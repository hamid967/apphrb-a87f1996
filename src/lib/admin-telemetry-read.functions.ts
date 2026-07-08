import { createServerFn } from "@tanstack/react-start";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";
import type { Json } from "@/integrations/supabase/types";

/** Row shape returned to /admin/telemetry. */
export type AdminEventRow = {
  id: string;
  event_type: string;
  actor_id: string | null;
  created_at: string;
  payload: Json;
};

/**
 * Lists recent admin.* system_events with optional filters.
 * Gated by super_admin — same guard as the /admin subtree.
 */
export const listAdminEvents = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const kind = typeof d.kind === "string" && d.kind.length <= 64 ? d.kind : null;
    const actorId =
      typeof d.actorId === "string" && d.actorId.length <= 128 ? d.actorId.trim() : null;
    const severity =
      d.severity === "error" || d.severity === "warning" || d.severity === "info"
        ? (d.severity as "error" | "warning" | "info")
        : null;
    const search = typeof d.search === "string" && d.search.length <= 200 ? d.search.trim() : null;
    const limit = Math.min(Math.max(Number(d.limit ?? 200) || 200, 1), 500);
    const sinceHours = Math.min(Math.max(Number(d.sinceHours ?? 24) || 24, 1), 168);
    return { kind, actorId, severity, search, limit, sinceHours };
  })
  .handler(async ({ context, data }) => {
    const sinceISO = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();
    let q = context.supabase
      .from("system_events")
      .select("id,event_type,actor_id,created_at,payload")
      .like("event_type", "admin.%")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.kind) q = q.eq("event_type", `admin.${data.kind}`);
    if (data.actorId) q = q.eq("actor_id", data.actorId);
    if (data.severity === "error") {
      q = q.in("event_type", [
        "admin.render_error",
        "admin.window_error",
        "admin.unhandled_rejection",
        "admin.route_error",
      ]);
    } else if (data.severity === "warning") {
      q = q.eq("event_type", "admin.aal2_bypass");
    } else if (data.severity === "info") {
      q = q.eq("event_type", "admin.nav");
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let out = (rows ?? []) as AdminEventRow[];
    if (data.search) {
      const needle = data.search.toLowerCase();
      out = out.filter((r) => {
        const p = (r.payload ?? {}) as { path?: string; message?: string };
        return (
          (p.path ?? "").toLowerCase().includes(needle) ||
          (p.message ?? "").toLowerCase().includes(needle)
        );
      });
    }
    return out;
  });

/**
 * KPIs for the last N hours across the admin.* event stream.
 * Reads a bounded slice (max 2000 rows) and aggregates in-process — the
 * volume of admin telemetry is low enough that this is cheaper than adding
 * SQL views right now.
 */
export const getAdminEventStats = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const sinceHours = Math.min(Math.max(Number(d.sinceHours ?? 24) || 24, 1), 168);
    return { sinceHours };
  })
  .handler(async ({ context, data }) => {
    const sinceISO = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("system_events")
      .select("event_type,payload,created_at,actor_id")
      .like("event_type", "admin.%")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const byKind: Record<string, number> = {};
    const byPath: Record<string, number> = {};
    const byActor: Record<string, number> = {};
    const bucketSize = data.sinceHours <= 24 ? 3600_000 : 86_400_000; // hour vs day
    const series: Record<string, { total: number; errors: number; nav: number; bypass: number }> =
      {};
    // Heatmap: day-of-week (0=Sun..6=Sat) x hour-of-day (0..23).
    // 7x24 buckets initialised to zero so the UI always renders a full grid.
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    const heatmapErrors: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    const navDurations: number[] = [];
    let navCount = 0;
    let navDurationSum = 0;
    let errors = 0;
    let bypasses = 0;
    for (const r of rows ?? []) {
      const t = String(r.event_type ?? "").replace(/^admin\./, "");
      byKind[t] = (byKind[t] ?? 0) + 1;
      const p = (r.payload ?? {}) as { path?: string; duration_ms?: number };
      if (p.path) byPath[p.path] = (byPath[p.path] ?? 0) + 1;
      if (r["actor_id" as keyof typeof r]) {
        const a = String((r as { actor_id?: string | null }).actor_id ?? "");
        if (a) byActor[a] = (byActor[a] ?? 0) + 1;
      }
      const ts = new Date(r.created_at).getTime();
      const bucket = new Date(Math.floor(ts / bucketSize) * bucketSize).toISOString();
      const s = series[bucket] ?? (series[bucket] = { total: 0, errors: 0, nav: 0, bypass: 0 });
      s.total += 1;
      const dt = new Date(r.created_at);
      const dow = dt.getDay();
      const hour = dt.getHours();
      heatmap[dow][hour] += 1;
      if (t === "nav") {
        s.nav += 1;
        const dur = p.duration_ms;
        if (typeof dur === "number" && dur > 0) {
          navCount += 1;
          navDurationSum += dur;
          navDurations.push(dur);
        }
      }
      if (
        t === "render_error" ||
        t === "window_error" ||
        t === "unhandled_rejection" ||
        t === "route_error"
      ) {
        errors += 1;
        s.errors += 1;
        heatmapErrors[dow][hour] += 1;
      }
      if (t === "aal2_bypass") {
        bypasses += 1;
        s.bypass += 1;
      }
    }
    // p95 nav duration.
    let p95NavDurationMs: number | null = null;
    if (navDurations.length > 0) {
      navDurations.sort((a, b) => a - b);
      const idx = Math.min(navDurations.length - 1, Math.floor(navDurations.length * 0.95));
      p95NavDurationMs = Math.round(navDurations[idx]);
    }
    const total = rows?.length ?? 0;
    const errorRatePct = total > 0 ? Math.round((errors / total) * 1000) / 10 : 0;
    const uniqueActors = Object.keys(byActor).length;
    const timeSeries = Object.entries(series)
      .map(([bucket, v]) => ({ bucket, ...v }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));
    const topKinds = Object.entries(byKind)
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const topPaths = Object.entries(byPath)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const topActors = Object.entries(byActor)
      .map(([actor_id, count]) => ({ actor_id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return {
      sinceHours: data.sinceHours,
      total,
      errors,
      bypasses,
      avgNavDurationMs: navCount > 0 ? Math.round(navDurationSum / navCount) : null,
      p95NavDurationMs,
      errorRatePct,
      uniqueActors,
      heatmap,
      heatmapErrors,
      byKind,
      timeSeries,
      bucket: bucketSize === 3600_000 ? ("hour" as const) : ("day" as const),
      topKinds,
      topPaths,
      topActors,
    };
  });

/** Normalized row shape returned by the bulk export server fn. */
export type AdminEventExportRow = {
  id: string;
  time: string;
  kind: string;
  event_type: string;
  path: string;
  message: string;
  duration_ms: number | null;
  actor_id: string | null;
  payload_json: string;
};

/**
 * Server-side bulk fetch for export. Streams the full filtered dataset
 * (paged through DB in chunks of 1000, hard cap 50k) so exports are not
 * capped at the 200-row UI window. Client formats to CSV / XLSX / JSON.
 */
export const fetchAdminEventsBulk = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const kind = typeof d.kind === "string" && d.kind.length <= 64 ? d.kind : null;
    const actorId =
      typeof d.actorId === "string" && d.actorId.length <= 128 ? d.actorId.trim() : null;
    const severity =
      d.severity === "error" || d.severity === "warning" || d.severity === "info"
        ? (d.severity as "error" | "warning" | "info")
        : null;
    const search = typeof d.search === "string" && d.search.length <= 200 ? d.search.trim() : null;
    const sinceHours = Math.min(Math.max(Number(d.sinceHours ?? 24) || 24, 1), 168);
    return { kind, actorId, severity, search, sinceHours };
  })
  .handler(async ({ context, data }) => {
    const sinceISO = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();
    const HARD_CAP = 50_000;
    const PAGE = 1000;

    const out: AdminEventExportRow[] = [];

    let from = 0;
    let fetched = 0;
    const needle = data.search ? data.search.toLowerCase() : null;
    while (fetched < HARD_CAP) {
      const to = Math.min(from + PAGE - 1, HARD_CAP - 1);
      let q = context.supabase
        .from("system_events")
        .select("id,event_type,actor_id,created_at,payload")
        .like("event_type", "admin.%")
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (data.kind) q = q.eq("event_type", `admin.${data.kind}`);
      if (data.actorId) q = q.eq("actor_id", data.actorId);
      if (data.severity === "error") {
        q = q.in("event_type", [
          "admin.render_error",
          "admin.window_error",
          "admin.unhandled_rejection",
          "admin.route_error",
        ]);
      } else if (data.severity === "warning") {
        q = q.eq("event_type", "admin.aal2_bypass");
      } else if (data.severity === "info") {
        q = q.eq("event_type", "admin.nav");
      }
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      const batch = rows ?? [];
      for (const r of batch) {
        const eventType = String(r.event_type ?? "");
        const k = eventType.replace(/^admin\./, "");
        const p = (r.payload ?? {}) as {
          path?: string;
          message?: string;
          duration_ms?: number;
        };
        if (needle) {
          const hay = (p.path ?? "").toLowerCase() + " " + (p.message ?? "").toLowerCase();
          if (!hay.includes(needle)) continue;
        }
        out.push({
          id: String(r.id),
          time: new Date(r.created_at).toISOString(),
          kind: k,
          event_type: eventType,
          path: p.path ?? "",
          message: p.message ?? "",
          duration_ms: typeof p.duration_ms === "number" ? p.duration_ms : null,
          actor_id: r.actor_id ?? null,
          payload_json: r.payload == null ? "" : JSON.stringify(r.payload),
        });
      }
      fetched += batch.length;
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    return {
      rows: out,
      rowCount: out.length,
      truncated: fetched >= HARD_CAP,
    };
  });

/** Applies the standard admin.* event filters to a supabase query builder. */
function applyEventFilters<T>(
  q: T,
  data: {
    kind: string | null;
    actorId: string | null;
    severity: "error" | "warning" | "info" | null;
    sinceISO: string;
  },
): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qq: any = q;
  qq = qq.like("event_type", "admin.%").gte("created_at", data.sinceISO);
  if (data.kind) qq = qq.eq("event_type", `admin.${data.kind}`);
  if (data.actorId) qq = qq.eq("actor_id", data.actorId);
  if (data.severity === "error") {
    qq = qq.in("event_type", [
      "admin.render_error",
      "admin.window_error",
      "admin.unhandled_rejection",
      "admin.route_error",
    ]);
  } else if (data.severity === "warning") {
    qq = qq.eq("event_type", "admin.aal2_bypass");
  } else if (data.severity === "info") {
    qq = qq.eq("event_type", "admin.nav");
  }
  return qq as T;
}

/**
 * DB-level count of admin.* events matching the filters (excluding text
 * search, which is applied in-process). Used to drive export progress UI.
 */
export const countAdminEvents = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const kind = typeof d.kind === "string" && d.kind.length <= 64 ? d.kind : null;
    const actorId =
      typeof d.actorId === "string" && d.actorId.length <= 128 ? d.actorId.trim() : null;
    const severity =
      d.severity === "error" || d.severity === "warning" || d.severity === "info"
        ? (d.severity as "error" | "warning" | "info")
        : null;
    const sinceHours = Math.min(Math.max(Number(d.sinceHours ?? 24) || 24, 1), 168);
    return { kind, actorId, severity, sinceHours };
  })
  .handler(async ({ context, data }) => {
    const sinceISO = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();
    const base = context.supabase
      .from("system_events")
      .select("id", { count: "exact", head: true });
    const q = applyEventFilters(base, { ...data, sinceISO });
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

/**
 * Fetches ONE page of admin.* events, normalized to `AdminEventExportRow`.
 * Client drives the export loop and shows progress + per-page retry.
 */
export const fetchAdminEventsPage = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const kind = typeof d.kind === "string" && d.kind.length <= 64 ? d.kind : null;
    const actorId =
      typeof d.actorId === "string" && d.actorId.length <= 128 ? d.actorId.trim() : null;
    const severity =
      d.severity === "error" || d.severity === "warning" || d.severity === "info"
        ? (d.severity as "error" | "warning" | "info")
        : null;
    const search = typeof d.search === "string" && d.search.length <= 200 ? d.search.trim() : null;
    const sinceHours = Math.min(Math.max(Number(d.sinceHours ?? 24) || 24, 1), 168);
    const offset = Math.max(0, Math.min(Number(d.offset ?? 0) || 0, 50_000));
    const limit = Math.min(Math.max(Number(d.limit ?? 1000) || 1000, 1), 1000);
    return { kind, actorId, severity, search, sinceHours, offset, limit };
  })
  .handler(async ({ context, data }) => {
    const sinceISO = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();
    const base = context.supabase
      .from("system_events")
      .select("id,event_type,actor_id,created_at,payload")
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    const q = applyEventFilters(base, { ...data, sinceISO });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const needle = data.search ? data.search.toLowerCase() : null;
    const out: AdminEventExportRow[] = [];
    for (const r of rows ?? []) {
      const eventType = String(r.event_type ?? "");
      const k = eventType.replace(/^admin\./, "");
      const p = (r.payload ?? {}) as { path?: string; message?: string; duration_ms?: number };
      if (needle) {
        const hay = (p.path ?? "").toLowerCase() + " " + (p.message ?? "").toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      out.push({
        id: String(r.id),
        time: new Date(r.created_at).toISOString(),
        kind: k,
        event_type: eventType,
        path: p.path ?? "",
        message: p.message ?? "",
        duration_ms: typeof p.duration_ms === "number" ? p.duration_ms : null,
        actor_id: r.actor_id ?? null,
        payload_json: r.payload == null ? "" : JSON.stringify(r.payload),
      });
    }
    return {
      rows: out,
      fetched: rows?.length ?? 0,
      hasMore: (rows?.length ?? 0) === data.limit,
    };
  });

/** One deduped row from email_send_log for the admin telemetry email panel. */
export type AdminAlertEmailRow = {
  message_id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

const EMAIL_STATUS_VALUES = [
  "pending",
  "sent",
  "dlq",
  "suppressed",
  "failed",
  "bounced",
  "complained",
] as const;

/**
 * Lists recent admin-alert email sends (deduped by message_id → latest row).
 * Uses supabaseAdmin because email_send_log RLS restricts SELECT to service_role;
 * caller is still gated by super_admin via requireSupabaseAuth + has_role.
 */
export const listAdminAlertEmails = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const template =
      typeof d.template === "string" && d.template.length <= 64 && d.template !== "__all"
        ? d.template
        : null;
    const status =
      typeof d.status === "string" && (EMAIL_STATUS_VALUES as readonly string[]).includes(d.status)
        ? (d.status as (typeof EMAIL_STATUS_VALUES)[number])
        : null;
    const search = typeof d.search === "string" && d.search.length <= 200 ? d.search.trim() : null;
    const limit = Math.min(Math.max(Number(d.limit ?? 200) || 200, 1), 500);
    const sinceHours = Math.min(Math.max(Number(d.sinceHours ?? 168) || 168, 1), 720);
    return { template, status, search, limit, sinceHours };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sinceISO = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();
    // Overfetch — we dedupe by message_id client-side inside the handler.
    let q = supabaseAdmin
      .from("email_send_log")
      .select("message_id,template_name,recipient_email,status,error_message,created_at")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(data.limit * 3);
    if (data.template) q = q.eq("template_name", data.template);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    const deduped: AdminAlertEmailRow[] = [];
    const needle = data.search ? data.search.toLowerCase() : null;
    for (const r of rows ?? []) {
      const mid = String(r.message_id ?? "");
      if (!mid || seen.has(mid)) continue;
      seen.add(mid);
      if (data.status && r.status !== data.status) continue;
      if (needle) {
        const hay =
          `${r.recipient_email ?? ""} ${r.error_message ?? ""} ${r.template_name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      deduped.push({
        message_id: mid,
        template_name: String(r.template_name ?? ""),
        recipient_email: String(r.recipient_email ?? ""),
        status: String(r.status ?? ""),
        error_message: (r.error_message as string | null) ?? null,
        created_at: String(r.created_at),
      });
      if (deduped.length >= data.limit) break;
    }

    // Distinct templates + status counts across the (already time-filtered) window.
    const templates = new Set<string>();
    const statusCounts: Record<string, number> = {};
    for (const r of rows ?? []) {
      if (r.template_name) templates.add(String(r.template_name));
    }
    // Recompute counts against the deduped set (source of truth for the table).
    for (const r of deduped) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

    return {
      rows: deduped,
      templates: Array.from(templates).sort(),
      statusCounts,
      hasMore: (rows?.length ?? 0) >= data.limit * 3,
    };
  });
