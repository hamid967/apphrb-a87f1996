import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RealtimeEventKind =
  | "disconnect"
  | "reconnect"
  | "failed"
  | "poll_start"
  | "poll_stop"
  | "poll_fetch"
  | "poll_error";

const VALID_KINDS: ReadonlyArray<RealtimeEventKind> = [
  "disconnect",
  "reconnect",
  "failed",
  "poll_start",
  "poll_stop",
  "poll_fetch",
  "poll_error",
];

/**
 * Record a realtime channel diagnostic event (disconnect / reconnect / failed)
 * for the authenticated user. Fire-and-forget from the client.
 */
export const logRealtimeConnectionEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const kind = String(d.kind ?? "");
    if (!VALID_KINDS.includes(kind as RealtimeEventKind)) throw new Error("invalid_kind");
    const channelKey = typeof d.channelKey === "string" ? d.channelKey.slice(0, 256) : "";
    if (!channelKey) throw new Error("invalid_channel");
    const attempt =
      typeof d.attempt === "number" && Number.isFinite(d.attempt)
        ? Math.max(0, Math.round(d.attempt))
        : null;
    const detail = typeof d.detail === "string" ? d.detail.slice(0, 500) : null;
    return { kind: kind as RealtimeEventKind, channelKey, attempt, detail };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("realtime_connection_events").insert({
      user_id: context.userId,
      channel_key: data.channelKey,
      kind: data.kind,
      attempt: data.attempt,
      detail: data.detail,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export interface RealtimeStatsRow {
  user_id: string;
  user_label: string | null;
  channel_key: string;
  disconnects: number;
  reconnects: number;
  failed: number;
  poll_sessions: number; // count of poll_start
  poll_fetches: number; // count of poll_fetch
  poll_errors: number; // count of poll_error
  last_event_at: string;
  last_kind: RealtimeEventKind;
}

export interface RealtimeStatsSummary {
  totalDisconnects: number;
  totalReconnects: number;
  totalFailed: number;
  totalPollSessions: number;
  totalPollFetches: number;
  totalPollErrors: number;
  affectedUsers: number;
  affectedChannels: number;
  reconnectRate: number; // reconnects / disconnects in the window
}

/**
 * Aggregate realtime channel diagnostics for the super-admin dashboard.
 * Returns per-(user, channel) counts plus a global summary.
 */
export const listRealtimeConnectionStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const sinceHours =
      typeof d.sinceHours === "number" && Number.isFinite(d.sinceHours)
        ? Math.max(1, Math.min(24 * 30, Math.round(d.sinceHours)))
        : 24;
    const limit =
      typeof d.limit === "number" && Number.isFinite(d.limit)
        ? Math.max(1, Math.min(500, Math.round(d.limit)))
        : 200;
    return { sinceHours, limit };
  })
  .handler(async ({ context, data }) => {
    // Verify caller is super_admin (SELECT policy also enforces this,
    // but return a clean 403 rather than an empty result).
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");

    const since = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("realtime_connection_events")
      .select("user_id,channel_key,kind,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10_000);
    if (error) throw new Error(error.message);

    type Row = {
      user_id: string;
      channel_key: string;
      kind: RealtimeEventKind;
      created_at: string;
    };
    const byKey = new Map<string, RealtimeStatsRow>();
    let td = 0,
      tr = 0,
      tf = 0,
      tps = 0,
      tpf = 0,
      tpe = 0;
    for (const r of (rows ?? []) as Row[]) {
      const key = `${r.user_id}::${r.channel_key}`;
      let row = byKey.get(key);
      if (!row) {
        row = {
          user_id: r.user_id,
          user_label: null,
          channel_key: r.channel_key,
          disconnects: 0,
          reconnects: 0,
          failed: 0,
          poll_sessions: 0,
          poll_fetches: 0,
          poll_errors: 0,
          last_event_at: r.created_at,
          last_kind: r.kind,
        };
        byKey.set(key, row);
      }
      if (r.kind === "disconnect") {
        row.disconnects += 1;
        td += 1;
      } else if (r.kind === "reconnect") {
        row.reconnects += 1;
        tr += 1;
      } else if (r.kind === "failed") {
        row.failed += 1;
        tf += 1;
      } else if (r.kind === "poll_start") {
        row.poll_sessions += 1;
        tps += 1;
      } else if (r.kind === "poll_fetch") {
        row.poll_fetches += 1;
        tpf += 1;
      } else if (r.kind === "poll_error") {
        row.poll_errors += 1;
        tpe += 1;
      }
      if (r.created_at > row.last_event_at) {
        row.last_event_at = r.created_at;
        row.last_kind = r.kind;
      }
    }

    // Enrich with a human label via profiles.full_name (best-effort).
    const userIds = Array.from(new Set(Array.from(byKey.values()).map((r) => r.user_id)));
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name")
        .in("id", userIds);
      const labelById = new Map<string, string | null>();
      for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null }>) {
        labelById.set(p.id, p.full_name);
      }
      for (const row of byKey.values()) {
        row.user_label = labelById.get(row.user_id) ?? null;
      }
    }

    const sorted = Array.from(byKey.values())
      .sort(
        (a, b) =>
          b.disconnects + b.failed + b.poll_errors - (a.disconnects + a.failed + a.poll_errors) ||
          b.last_event_at.localeCompare(a.last_event_at),
      )
      .slice(0, data.limit);

    const affectedUsers = new Set(sorted.map((r) => r.user_id)).size;
    const affectedChannels = new Set(sorted.map((r) => r.channel_key)).size;
    const summary: RealtimeStatsSummary = {
      totalDisconnects: td,
      totalReconnects: tr,
      totalFailed: tf,
      totalPollSessions: tps,
      totalPollFetches: tpf,
      totalPollErrors: tpe,
      affectedUsers,
      affectedChannels,
      reconnectRate: td > 0 ? tr / td : 0,
    };

    return { rows: sorted, summary, sinceHours: data.sinceHours };
  });

// ---------------------------------------------------------------------------
// Polling interval configuration (per-status), editable at runtime by
// super_admin from /admin/realtime-diagnostics. Persisted in app_settings
// under the key below as a JSON object of `{ [status]: number | null }`.
// A `null` value means "no polling for this status" (i.e. `false`).
// ---------------------------------------------------------------------------

export const REALTIME_POLLING_SETTINGS_KEY = "realtime.polling_intervals";

export type PollingStatusKey = "disabled" | "connecting" | "connected" | "reconnecting" | "failed";

export type PollingIntervalsConfig = Record<PollingStatusKey, number | null>;

export const DEFAULT_POLLING_INTERVALS: PollingIntervalsConfig = {
  connected: null,
  disabled: null,
  connecting: 10_000,
  reconnecting: 5_000,
  failed: 15_000,
};

const STATUS_KEYS: ReadonlyArray<PollingStatusKey> = [
  "disabled",
  "connecting",
  "connected",
  "reconnecting",
  "failed",
];

// Guardrails: keep values sane so a bad admin edit can't hammer the DB
// or effectively disable polling with an hour-long gap.
const MIN_MS = 1_000;
const MAX_MS = 600_000;

function normalizeConfig(raw: unknown): PollingIntervalsConfig {
  const out: PollingIntervalsConfig = { ...DEFAULT_POLLING_INTERVALS };
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const k of STATUS_KEYS) {
    const v = src[k];
    if (v === null) {
      out[k] = null;
      continue;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = Math.min(MAX_MS, Math.max(MIN_MS, Math.round(v)));
    }
  }
  return out;
}

/**
 * Read the current polling-interval configuration. Any authenticated user
 * may read (the app_settings staff-read policy already allows it) so client
 * hooks can apply the values without an admin round-trip.
 */
export const getRealtimePollingConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("value,updated_at,updated_by")
      .eq("key", REALTIME_POLLING_SETTINGS_KEY)
      .maybeSingle();
    if (error && error.code !== "PGRST116") {
      // Row missing is fine; anything else surface as defaults.
      return {
        config: DEFAULT_POLLING_INTERVALS,
        updatedAt: null as string | null,
        updatedBy: null as string | null,
      };
    }
    return {
      config: normalizeConfig(data?.value),
      updatedAt: (data?.updated_at as string | null) ?? null,
      updatedBy: (data?.updated_by as string | null) ?? null,
    };
  });

/**
 * Update the polling-interval configuration. Super-admin only — enforced
 * by both the app_settings RLS write policy and this pre-check.
 */
export const updateRealtimePollingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    return { config: normalizeConfig(d.config) };
  })
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { error } = await context.supabase.from("app_settings").upsert(
      {
        key: REALTIME_POLLING_SETTINGS_KEY,
        value: data.config as unknown as never,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, config: data.config };
  });
