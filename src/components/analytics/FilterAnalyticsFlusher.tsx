import { useEffect, useRef } from "react";
import { onAnalyticsEvent, type AnalyticsEvent } from "@/lib/analytics";
import { ingestFilterAnalytics } from "@/lib/filter-analytics.functions";
import { supabase } from "@/integrations/supabase/client";
import { encodeBatch, type FullEventRow } from "@/lib/filter-analytics-codec";
import { drainPending as drainStoredBatches, stashBatch } from "@/lib/filter-analytics-pending";

/**
 * Mount-once component that persists `active_filters.*` events to the
 * backend for later aggregation on the "Filter Usage" report.
 *
 * Design:
 * - Subscribe to the in-page analytics bus and filter to the ActiveFiltersBar
 *   namespace only. Every other event is ignored — this component owns
 *   filter-usage persistence, nothing else.
 * - Batch in memory and flush every 10s or when the queue hits 20 items,
 *   whichever comes first. Also flush on `visibilitychange:hidden` and
 *   `pagehide` so mobile "swipe away tab" doesn't lose the last batch.
 * - Skip ingestion for anonymous visitors — the server fn requires auth,
 *   and posting from public pages would just 401.
 * - Swallow all errors: analytics must never surface to the user.
 * - On network failure (fetch reject, beacon returns `false`, or non-2xx
 *   response), stash the batch in `localStorage` and retry it the next
 *   time the tab is `online` or a subsequent flush succeeds.
 */
export function FilterAnalyticsFlusher() {
  const queueRef = useRef<Array<Record<string, unknown>>>([]);
  const timerRef = useRef<number | null>(null);
  const authedRef = useRef(false);
  const draining = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Track sign-in status so we don't fire pointless 401s while logged out.
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      authedRef.current = !!data.user;
      // If we come back signed-in with pending batches from a prior
      // session, try to drain them now.
      if (authedRef.current) void drainPending();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      authedRef.current = !!session?.user;
      if (authedRef.current) void drainPending();
    });

    /**
     * Replay any locally-stashed batches through the auth-guarded server
     * fn. Runs one batch at a time; if any batch fails we put it back at
     * the head of the queue and stop — the next `online` / auth event
     * will trigger another drain. Guarded by `draining` to avoid parallel
     * drains stepping on each other.
     */
    const drainPending = async () => {
      if (draining.current) return;
      if (!authedRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      draining.current = true;
      try {
        await drainStoredBatches((events) =>
          ingestFilterAnalytics({ data: { events: events as never } }),
        );
      } finally {
        draining.current = false;
      }
    };

    const flush = () => {
      if (!authedRef.current) {
        queueRef.current = []; // don't hoard events for a user that never signed in
        return;
      }
      const batch = queueRef.current;
      if (!batch.length) return;
      queueRef.current = [];
      ingestFilterAnalytics({
        data: { events: batch as never },
      })
        .then(() => {
          // Opportunistic drain — a successful send is a good signal that
          // the network is back, so try to flush any earlier stashed batches.
          void drainPending();
        })
        .catch(() => {
          // Network blip / server error — stash for retry instead of dropping.
          stashBatch(batch as unknown as FullEventRow[]);
        });
    };

    /**
     * Reliable send path for page-lifecycle events (`pagehide`,
     * `visibilitychange:hidden`). On mobile the browser will often cancel
     * an in-flight fetch when the tab is backgrounded — `sendBeacon`
     * (and `fetch({ keepalive: true })` as a fallback) is queued at the
     * OS level and survives the transition.
     *
     * `sendBeacon` cannot set headers, so we POST to a dedicated public
     * route that verifies the caller's access token from the body. This
     * path is used ONLY on lifecycle events; normal periodic flushes
     * still go through the auth-guarded server fn.
     *
     * If both `sendBeacon` and the keepalive `fetch` fallback fail, the
     * batch is stashed to `localStorage` for retry on the next visit /
     * `online` event. We cannot `await` in a `pagehide` handler, so the
     * stash happens synchronously as part of the fallback path.
     */
    const flushWithBeacon = () => {
      if (!authedRef.current) {
        queueRef.current = [];
        return;
      }
      const batch = queueRef.current;
      if (!batch.length) return;
      queueRef.current = [];

      // Grab a fresh token synchronously from the local Supabase session.
      // getSession() is sync-friendly (reads from in-memory + localStorage)
      // and avoids the network round-trip getUser() would incur.
      supabase.auth
        .getSession()
        .then(({ data }) => {
          const token = data.session?.access_token;
          if (!token) {
            // Signed-out mid-flight — stash so a later authed session drains it.
            stashBatch(batch as unknown as FullEventRow[]);
            return;
          }
          // Compact wire format ONLY on the beacon path — the server-fn
          // path validates the full schema and is well under the beacon's
          // ~64 KB per-origin cap anyway. Encoding shrinks a typical row
          // from ~250 B to ~90 B on the wire (60-70% reduction) by using
          // short keys and int-coded enums.
          const payload = JSON.stringify({
            token,
            v: 1,
            events: encodeBatch(batch as FullEventRow[]),
          });
          const url = "/api/public/filter-analytics-beacon";
          try {
            const blob = new Blob([payload], { type: "application/json" });
            if (
              typeof navigator !== "undefined" &&
              typeof navigator.sendBeacon === "function" &&
              navigator.sendBeacon(url, blob)
            ) {
              return;
            }
          } catch {
            // fall through to keepalive fetch
          }
          // Fallback: keepalive fetch survives page unload on most browsers.
          try {
            fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
              keepalive: true,
            })
              .then((res) => {
                if (!res.ok) stashBatch(batch as unknown as FullEventRow[]);
              })
              .catch(() => stashBatch(batch as unknown as FullEventRow[]));
          } catch {
            // Even scheduling the fetch failed — stash for later.
            stashBatch(batch as unknown as FullEventRow[]);
          }
        })
        .catch(() => {
          // Failed to read the session — stash and retry on next drain.
          stashBatch(batch as unknown as FullEventRow[]);
        });
    };

    const scheduleFlush = () => {
      if (timerRef.current !== null) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        flush();
      }, 10_000);
    };

    const off = onAnalyticsEvent((ev: AnalyticsEvent) => {
      if (!ev.name.startsWith("active_filters.")) return;
      // Strip the "active_filters." prefix — the DB column stores the fully
      // qualified name so downstream queries can still discriminate.
      const props = ev.props ?? {};
      queueRef.current.push({
        session_id: ev.sessionId ?? null,
        event_name: ev.name,
        filter_key: (props.filterKey as string | undefined) ?? null,
        source: (props.source as string | undefined) ?? null,
        chip_count: (props.chipCount as number | undefined) ?? null,
        remaining: (props.remaining as number | undefined) ?? null,
        distance_px: (props.distancePx as number | undefined) ?? null,
        progress: (props.progress as number | undefined) ?? null,
        reached_end: (props.reachedEnd as boolean | undefined) ?? null,
        path: ev.path ?? null,
        action: (props.action as string | undefined) ?? null,
        prev_event_name: ev.prevEventName ?? null,
        // Clamp to the DB column's upper bound (10 min); anything older is noise.
        prev_event_age_ms:
          typeof ev.prevEventAgeMs === "number" ? Math.min(ev.prevEventAgeMs, 600_000) : null,
      });
      if (queueRef.current.length >= 20) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        flush();
      } else {
        scheduleFlush();
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushWithBeacon();
    };
    const onOnline = () => {
      void drainPending();
    };
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushWithBeacon);
    window.addEventListener("online", onOnline);

    // Kick a drain on mount in case a previous session left events behind.
    void drainPending();

    return () => {
      mounted = false;
      off();
      sub.subscription.unsubscribe();
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushWithBeacon);
      window.removeEventListener("online", onOnline);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      flush();
    };
  }, []);

  return null;
}
