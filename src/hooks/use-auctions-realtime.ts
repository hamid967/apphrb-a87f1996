import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  logRealtimeConnectionEvent,
  getRealtimePollingConfig,
  DEFAULT_POLLING_INTERVALS,
  type PollingIntervalsConfig,
} from "@/lib/realtime-diagnostics.functions";
import { useServerFn } from "@tanstack/react-start";

// Fire-and-forget diagnostic write; never let logging break realtime.
function logEvent(
  kind:
    | "disconnect"
    | "reconnect"
    | "failed"
    | "poll_start"
    | "poll_stop"
    | "poll_fetch"
    | "poll_error",
  channelKey: string,
  attempt: number,
  detail?: string,
) {
  try {
    void logRealtimeConnectionEvent({
      data: { kind, channelKey, attempt, detail: detail ?? null },
    }).catch(() => {
      /* ignore */
    });
  } catch {
    /* ignore */
  }
}

export interface PollingDiagnostics {
  channelKey: string;
  activeRef: React.MutableRefObject<boolean>;
  fetchesRef: React.MutableRefObject<number>;
  errorsRef: React.MutableRefObject<number>;
}

/**
 * Track polling lifecycle for `channelKey`: emits `poll_start` when the
 * given `pollMs` turns on, `poll_stop` (with cumulative fetch/error counts
 * in `attempt` + `detail`) when it turns off or the component unmounts.
 *
 * Pair with `usePollingObserver` for each query you want counted.
 */
export function usePollingDiagnostics(
  channelKey: string,
  pollMs: number | false,
): PollingDiagnostics {
  const activeRef = useRef(false);
  const fetchesRef = useRef(0);
  const errorsRef = useRef(0);
  const intervalRef = useRef<number | false>(false);
  const isActive = typeof pollMs === "number" && pollMs > 0;

  useEffect(() => {
    if (isActive && !activeRef.current) {
      activeRef.current = true;
      fetchesRef.current = 0;
      errorsRef.current = 0;
      intervalRef.current = pollMs;
      logEvent("poll_start", channelKey, 0, `intervalMs=${pollMs}`);
    } else if (!isActive && activeRef.current) {
      const total = fetchesRef.current;
      const errs = errorsRef.current;
      const iv = intervalRef.current;
      activeRef.current = false;
      logEvent(
        "poll_stop",
        channelKey,
        total,
        `fetches=${total} errors=${errs} intervalMs=${iv || 0}`,
      );
    } else if (isActive) {
      intervalRef.current = pollMs;
    }
  }, [channelKey, isActive, pollMs]);

  useEffect(() => {
    return () => {
      if (!activeRef.current) return;
      const total = fetchesRef.current;
      const errs = errorsRef.current;
      const iv = intervalRef.current;
      activeRef.current = false;
      logEvent(
        "poll_stop",
        channelKey,
        total,
        `fetches=${total} errors=${errs} intervalMs=${iv || 0} (unmount)`,
      );
    };
  }, [channelKey]);

  return { channelKey, activeRef, fetchesRef, errorsRef };
}

/**
 * Observe a TanStack Query result and log a `poll_fetch` on each successful
 * background refetch while polling is on, and a `poll_error` on each error.
 * Safe to call for multiple queries per page.
 */
export function usePollingObserver(
  diag: PollingDiagnostics,
  query: { dataUpdatedAt: number; errorUpdatedAt: number; error?: unknown },
  label?: string,
) {
  const seenDataAt = useRef(query.dataUpdatedAt);
  const seenErrorAt = useRef(query.errorUpdatedAt);

  useEffect(() => {
    if (!diag.activeRef.current) {
      seenDataAt.current = query.dataUpdatedAt;
      seenErrorAt.current = query.errorUpdatedAt;
      return;
    }
    if (query.dataUpdatedAt > seenDataAt.current) {
      seenDataAt.current = query.dataUpdatedAt;
      diag.fetchesRef.current += 1;
      logEvent("poll_fetch", diag.channelKey, diag.fetchesRef.current, label);
    }
    if (query.errorUpdatedAt > seenErrorAt.current) {
      seenErrorAt.current = query.errorUpdatedAt;
      diag.errorsRef.current += 1;
      const msg =
        query.error instanceof Error ? query.error.message : String(query.error ?? "error");
      logEvent(
        "poll_error",
        diag.channelKey,
        diag.errorsRef.current,
        `${label ?? ""} ${msg}`.trim().slice(0, 500),
      );
    }
  }, [diag, query.dataUpdatedAt, query.errorUpdatedAt, query.error, label]);
}

type BuildChannel = () => RealtimeChannel;

export type RealtimeStatus = "disabled" | "connecting" | "connected" | "reconnecting" | "failed";

export interface RetryPolicy {
  /** Max reconnection attempts before giving up. `Infinity` = never give up. Default: 8. */
  maxAttempts?: number;
  /** Initial backoff delay in ms. Default: 1000. */
  initialDelayMs?: number;
  /** Cap on backoff delay in ms. Default: 30000. */
  maxDelayMs?: number;
  /** Exponential factor. Default: 2. */
  factor?: number;
}

export interface RealtimeHandle {
  status: RealtimeStatus;
  /** True while the channel is unusable (failed after exhausting retries). */
  isBlocked: boolean;
  /** Manually re-arm after `failed`, or force an immediate reconnect. */
  retry: () => void;
}

const DEFAULT_POLICY: Required<RetryPolicy> = {
  maxAttempts: 8,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  factor: 2,
};

/**
 * Suggested TanStack Query `refetchInterval` (ms) based on the current
 * realtime status. Returns `false` when live updates are healthy, so
 * queries stay driven by realtime alone. When realtime is degraded we
 * fall back to periodic polling so data stays fresh automatically.
 *
 * Defaults: reconnecting = 5s, failed = 15s, connecting = 10s, disabled = false.
 */
export function pollingIntervalFor(
  status: RealtimeStatus,
  overrides?: Partial<Record<RealtimeStatus, number | false>>,
): number | false {
  const table: Record<RealtimeStatus, number | false> = {
    connected: false,
    disabled: false,
    connecting: 10_000,
    reconnecting: 5_000,
    failed: 15_000,
    ...(overrides ?? {}),
  };
  return table[status];
}

/**
 * Live polling-interval overrides read from `app_settings`. Falls back to
 * the built-in defaults while loading or when the row is missing. Refreshes
 * every 60s so admin edits propagate without redeploy.
 */
export function useRealtimePollingConfig(): Partial<Record<RealtimeStatus, number | false>> {
  const fetchCfg = useServerFn(getRealtimePollingConfig);
  const q = useQuery({
    queryKey: ["realtime", "polling-config"],
    queryFn: () => fetchCfg(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const cfg: PollingIntervalsConfig = q.data?.config ?? DEFAULT_POLLING_INTERVALS;
  const out: Partial<Record<RealtimeStatus, number | false>> = {};
  (Object.keys(cfg) as Array<keyof PollingIntervalsConfig>).forEach((k) => {
    out[k as RealtimeStatus] = cfg[k] === null ? false : (cfg[k] as number);
  });
  return out;
}

/**
 * Coalesced query invalidator: drops calls that fire within `minSpacingMs`
 * of the last actual invalidation for the same key, and merges multiple
 * calls inside a short window into a single trailing invalidation.
 *
 * Prevents realtime + polling from double-fetching the same query when
 * both fire back-to-back at the boundary between the two modes.
 */
function makeCoalescer(minSpacingMs = 800) {
  const lastFiredAt = new Map<string, number>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  return function invalidate(qc: QueryClient, queryKey: QueryKey) {
    const id = JSON.stringify(queryKey);
    const now = Date.now();
    const last = lastFiredAt.get(id) ?? 0;
    const sinceLast = now - last;

    // Also skip if TanStack already has a fresh in-flight fetch for this key.
    const state = qc.getQueryState(queryKey);
    if (state?.fetchStatus === "fetching" && sinceLast < minSpacingMs) return;

    if (sinceLast >= minSpacingMs) {
      lastFiredAt.set(id, now);
      void qc.invalidateQueries({ queryKey });
      return;
    }
    // Debounce a trailing call so the very last event wins.
    const existing = pending.get(id);
    if (existing) clearTimeout(existing);
    const wait = minSpacingMs - sinceLast;
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id);
        lastFiredAt.set(id, Date.now());
        void qc.invalidateQueries({ queryKey });
      }, wait),
    );
  };
}

/**
 * Bounded LRU-ish "seen ids" tracker: returns true the first time an id
 * is presented, false on repeats. Used to dedupe bid INSERT payloads that
 * may arrive via realtime AND surface again in a polling refetch.
 */
function makeSeenTracker(max = 200) {
  const seen = new Set<string>();
  return function markFirstSeen(id: string | undefined | null): boolean {
    if (!id) return true; // no id → treat as new (safer for toasts)
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > max) {
      // Drop oldest ~10% to keep bounded.
      const drop = Math.ceil(max * 0.1);
      const it = seen.values();
      for (let i = 0; i < drop; i++) {
        const v = it.next();
        if (v.done) break;
        seen.delete(v.value);
      }
    }
    return true;
  };
}

/**
 * Manage a realtime channel with:
 * - toast on subscription error / timeout / unexpected close
 * - configurable exponential backoff auto-reconnect
 * - gives up after `maxAttempts` and exposes `failed` state + manual retry
 * - success toast once the channel reconnects after a prior failure
 */
function useResilientChannel(
  key: string,
  build: BuildChannel,
  enabled: boolean,
  deps: ReadonlyArray<unknown>,
  policy?: RetryPolicy,
): RealtimeHandle {
  const [status, setStatus] = useState<RealtimeStatus>(enabled ? "connecting" : "disabled");
  const [nonce, setNonce] = useState(0);
  const buildRef = useRef(build);
  buildRef.current = build;

  const p: Required<RetryPolicy> = { ...DEFAULT_POLICY, ...(policy ?? {}) };

  useEffect(() => {
    if (!enabled) {
      setStatus("disabled");
      return;
    }
    setStatus("connecting");

    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let hadError = false;
    let stopped = false;
    let toastId: string | number | undefined;

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleRetry = () => {
      clearRetry();
      if (stopped) return;
      if (attempt >= p.maxAttempts) {
        // Give up: mark failed, block sensitive updates, offer manual retry.
        setStatus("failed");
        if (toastId !== undefined) toast.dismiss(toastId);
        toastId = toast.error(
          `تعذّر استعادة الاتصال المباشر بعد ${p.maxAttempts} محاولات — التحديثات الحساسة موقوفة`,
          {
            id: `${key}:failed`,
            duration: Infinity,
            action: {
              label: "إعادة المحاولة",
              onClick: () => setNonce((n) => n + 1),
            },
          },
        );
        logEvent("failed", key, attempt, `exhausted after ${p.maxAttempts} attempts`);
        return;
      }
      const delay = Math.min(p.maxDelayMs, p.initialDelayMs * p.factor ** attempt);
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };

    const teardown = async () => {
      if (channel) {
        const c = channel;
        channel = null;
        try {
          await supabase.removeChannel(c);
        } catch {
          /* ignore */
        }
      }
    };

    const connect = () => {
      if (stopped) return;
      // Ensure any previous channel is torn down before creating a new one.
      void teardown().then(() => {
        if (stopped) return;
        channel = buildRef.current().subscribe((status) => {
          if (stopped) return;
          if (status === "SUBSCRIBED") {
            if (hadError) {
              if (toastId !== undefined) toast.dismiss(toastId);
              toast.success("تم استعادة الاتصال المباشر", { id: `${key}:ok`, duration: 2000 });
              logEvent("reconnect", key, attempt);
              hadError = false;
            }
            attempt = 0;
            setStatus("connected");
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (!hadError) {
              hadError = true;
              toastId = toast.warning("انقطع الاتصال المباشر — جارٍ إعادة المحاولة…", {
                id: `${key}:err`,
                duration: Infinity,
              });
              logEvent("disconnect", key, attempt, status);
            }
            setStatus("reconnecting");
            scheduleRetry();
          }
        });
      });
    };

    connect();

    return () => {
      stopped = true;
      clearRetry();
      if (toastId !== undefined) toast.dismiss(toastId);
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, p.maxAttempts, p.initialDelayMs, p.maxDelayMs, p.factor]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { status, isBlocked: status === "failed", retry };
}

/**
 * Subscribe to realtime updates for a single auction:
 * - INSERT on auction_bids (filtered by auction_id) → invalidate + toast
 * - UPDATE on auctions (filtered by id) → invalidate
 * Handles reconnection automatically and notifies on connection loss.
 */
export function useAuctionRealtime(
  auctionId: string | undefined,
  opts?: { notifyOnBid?: boolean; retry?: RetryPolicy },
): RealtimeHandle {
  const qc = useQueryClient();
  const notify = opts?.notifyOnBid ?? true;
  // Per-hook-instance state (survives re-subscribes within the same mount).
  const invalidateRef = useRef(makeCoalescer(800));
  const seenBidRef = useRef(makeSeenTracker(200));

  return useResilientChannel(
    `auction:${auctionId ?? "none"}`,
    () =>
      supabase
        .channel(`auction:${auctionId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "auction_bids",
            filter: `auction_id=eq.${auctionId}`,
          },
          (payload) => {
            const row = payload.new as { id?: string; amount?: number } | null;
            const firstTime = seenBidRef.current(row?.id ?? null);
            // Dedupe: if we've already surfaced this bid (e.g. via a
            // polling refetch that just returned it), skip invalidation
            // AND the toast so users don't see it twice.
            if (!firstTime) return;
            invalidateRef.current(qc, ["auction", auctionId]);
            invalidateRef.current(qc, ["auction", auctionId, "history"]);
            if (notify) {
              const amt = row?.amount;
              toast.info(
                amt != null ? `مزايدة جديدة: ${Number(amt).toLocaleString("ar")}` : "مزايدة جديدة",
                { id: row?.id ? `bid:${row.id}` : undefined, duration: 2500 },
              );
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${auctionId}` },
          () => invalidateRef.current(qc, ["auction", auctionId]),
        ),
    !!auctionId,
    [auctionId, qc, notify],
    opts?.retry,
  );
}

/**
 * Subscribe to realtime for a dashboard/list view scoped by org.
 * Refreshes the ["auctions","mine",orgId] query on any change to auctions or bids.
 * Handles reconnection automatically and notifies on connection loss.
 */
export function useAuctionsListRealtime(
  orgId: string | undefined,
  opts?: { retry?: RetryPolicy },
): RealtimeHandle {
  const qc = useQueryClient();
  const invalidateRef = useRef(makeCoalescer(800));

  return useResilientChannel(
    `auctions-list:${orgId ?? "none"}`,
    () => {
      const key = ["auctions", "mine", orgId] as const;
      return supabase
        .channel(`auctions-list:${orgId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "auctions" }, () =>
          invalidateRef.current(qc, key as unknown as QueryKey),
        )
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "auction_bids" }, () =>
          invalidateRef.current(qc, key as unknown as QueryKey),
        );
    },
    !!orgId,
    [orgId, qc],
    opts?.retry,
  );
}
