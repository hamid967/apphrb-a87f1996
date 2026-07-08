import { useEffect, useState } from "react";
import { onAnalyticsEvent, type AnalyticsEvent } from "@/lib/analytics";
import {
  drainPending,
  inspectPending,
  readPending,
  type DrainResult,
  type PendingSnapshot,
} from "@/lib/filter-analytics-pending";
import { ingestFilterAnalytics } from "@/lib/filter-analytics.functions";

/**
 * On-screen debug overlay for ActiveFiltersBar analytics.
 *
 * Activation (any of):
 * - URL contains `?debug=filters` (persisted to `localStorage.lov:debug:filters=1`)
 * - `localStorage.lov:debug:filters === "1"`
 * - `window.__LOV_DEBUG_FILTERS = true` (handy from devtools)
 *
 * When active it logs every `active_filters.*` event to the console with a
 * consistent prefix AND renders a compact, dismissible floating panel that
 * shows the last 25 events with their key props (source, remaining, chip
 * key, distance) so you can eyeball payload correctness in real time.
 *
 * Deactivate: `?debug=filters=0`, `localStorage.removeItem("lov:debug:filters")`,
 * or click the "×" in the panel header.
 */
const STORAGE_KEY = "lov:debug:filters";
const MAX_ROWS = 25;

function readActivation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("debug");
    if (q === "filters") {
      window.localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (q === "filters=0" || q === "off") {
      window.localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    if ((window as unknown as { __LOV_DEBUG_FILTERS?: boolean }).__LOV_DEBUG_FILTERS) {
      return true;
    }
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function FilterAnalyticsDebugPanel() {
  const [active, setActive] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  // Two snapshots: `before` is the raw storage state (may contain legacy
  // rows from a pre-codec build); `after` is the state right after
  // `readPending()` has run its in-place upgrade (always all-compact).
  // `after` is `null` until the user explicitly runs the upgrade, so we
  // don't hide the "before" evidence.
  const [before, setBefore] = useState<PendingSnapshot | null>(null);
  const [after, setAfter] = useState<PendingSnapshot | null>(null);
  const [drain, setDrain] = useState<DrainResult | null>(null);
  const [draining, setDraining] = useState(false);

  useEffect(() => {
    setActive(readActivation());
  }, []);

  // Poll storage while the panel is open so the counter reflects new
  // failed batches / drains without needing a manual refresh.
  useEffect(() => {
    if (!active) return;
    const refresh = () => setBefore(inspectPending());
    refresh();
    const t = window.setInterval(refresh, 2_000);
    return () => window.clearInterval(t);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const off = onAnalyticsEvent((ev) => {
      if (!ev.name.startsWith("active_filters.")) return;

      console.log(
        `%c[filters]%c ${ev.name}`,
        "background:#2563EB;color:#fff;padding:1px 4px;border-radius:3px",
        "color:inherit;font-weight:600",
        { sid: ev.sessionId, uid: ev.userId, path: ev.path, ...(ev.props ?? {}) },
      );
      setEvents((prev) => [ev, ...prev].slice(0, MAX_ROWS));
    });
    return off;
  }, [active]);

  if (!active) return null;

  const dismiss = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setActive(false);
  };

  /**
   * Trigger the same upgrade path production uses on drain. `readPending`
   * detects any legacy batches and rewrites storage in place. We snapshot
   * before and after so the debug panel shows the transition.
   */
  const runUpgrade = () => {
    const pre = inspectPending();
    readPending(); // side-effect: rewrites storage to compact form
    const post = inspectPending();
    setBefore(pre);
    setAfter(post);
  };

  /**
   * Fire the same drain path production uses (`drainPending` in
   * `filter-analytics-pending`), but on demand. Uses the authenticated
   * server function directly so it fails visibly with a readable error
   * on the panel if the user is signed out or the network is down —
   * ideal for debugging why the queue is not draining on its own.
   */
  const runDrain = async () => {
    if (draining) return;
    setDraining(true);
    try {
      const result = await drainPending((events) =>
        ingestFilterAnalytics({ data: { events: events as never } }),
      );
      setDrain(result);
    } catch (err) {
      setDrain({
        sentBatches: 0,
        sentEvents: 0,
        remainingBatches: inspectPending().totalBatches,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDraining(false);
      setBefore(inspectPending());
    }
  };

  return (
    <div
      dir="ltr"
      className="
        fixed z-[9999] bottom-3 right-3 w-[min(360px,calc(100vw-1.5rem))]
        rounded-lg border border-primary/40 bg-background/95 shadow-lg
        text-xs font-mono backdrop-blur
      "
      data-testid="filter-analytics-debug"
    >
      <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-1.5">
        <span className="inline-block size-2 rounded-full bg-primary animate-pulse" />
        <span className="font-semibold">filters debug</span>
        <span className="text-muted-foreground">({events.length})</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setEvents([])}
          className="rounded px-1.5 py-0.5 hover:bg-muted"
          title="Clear"
        >
          clear
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded px-1.5 py-0.5 hover:bg-muted"
          title="Toggle"
        >
          {collapsed ? "▲" : "▼"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded px-1.5 py-0.5 hover:bg-destructive/20"
          title="Disable debug"
        >
          ×
        </button>
      </div>
      {!collapsed && (
        <PendingCounter
          before={before}
          after={after}
          drain={drain}
          draining={draining}
          onUpgrade={runUpgrade}
          onRefresh={() => setBefore(inspectPending())}
          onDrain={runDrain}
        />
      )}
      {!collapsed && (
        <div className="max-h-64 overflow-auto divide-y divide-border/60">
          {events.length === 0 ? (
            <p className="p-3 text-muted-foreground">
              في انتظار الأحداث… تفاعل مع شريط الفلاتر لرؤيتها هنا.
            </p>
          ) : (
            events.map((ev, i) => {
              const p = ev.props ?? {};
              return (
                <div key={`${ev.ts}-${i}`} className="px-3 py-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-primary font-semibold">
                      {ev.name.replace("active_filters.", "")}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      {ev.ts ? new Date(ev.ts).toLocaleTimeString() : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{formatProps(p)}</div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function formatProps(props: Record<string, string | number | boolean | null | undefined>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}=${String(v)}`);
  }
  return parts.join("  ·  ") || "—";
}

/**
 * Inline row showing pending-batch counts by shape. The "قديمة" (legacy)
 * count is the diagnostic signal we care about after a release — once
 * every user has drained or upgraded, it should stay at 0.
 */
function PendingCounter({
  before,
  after,
  drain,
  draining,
  onUpgrade,
  onRefresh,
  onDrain,
}: {
  before: PendingSnapshot | null;
  after: PendingSnapshot | null;
  drain: DrainResult | null;
  draining: boolean;
  onUpgrade: () => void;
  onRefresh: () => void;
  onDrain: () => void;
}) {
  const b = before;
  return (
    <div className="border-b border-border/60 bg-muted/30 px-3 py-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">pending</span>
        {b ? (
          <span className="text-muted-foreground" data-testid="pending-counter-before">
            batches={b.totalBatches} · events={b.totalEvents} ·{" "}
            <span className={b.legacyBatches > 0 ? "text-amber-500" : ""}>
              قديمة={b.legacyBatches}
            </span>{" "}
            · <span>مضغوطة={b.compactBatches}</span>
            {b.corrupt ? <span className="text-destructive"> · corrupt</span> : null}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRefresh}
          className="rounded px-1.5 py-0.5 hover:bg-muted"
          title="Refresh snapshot"
        >
          refresh
        </button>
        <button
          type="button"
          onClick={onUpgrade}
          disabled={!b || b.totalBatches === 0}
          className="rounded px-1.5 py-0.5 hover:bg-primary/20 disabled:opacity-40"
          title="Run in-place upgrade of legacy batches"
        >
          upgrade
        </button>
        <button
          type="button"
          onClick={onDrain}
          disabled={draining || !b || b.totalBatches === 0}
          className="rounded px-1.5 py-0.5 hover:bg-primary/20 disabled:opacity-40"
          title="Replay pending batches through the auth-guarded server fn"
          data-testid="pending-drain-button"
        >
          {draining ? "draining…" : "drain now"}
        </button>
      </div>
      {after ? (
        <div className="mt-1 text-muted-foreground" data-testid="pending-counter-after">
          <span className="text-foreground">after&nbsp;→</span> batches=
          {after.totalBatches} · events={after.totalEvents} ·{" "}
          <span className={after.legacyBatches > 0 ? "text-amber-500" : ""}>
            قديمة={after.legacyBatches}
          </span>{" "}
          · مضغوطة={after.compactBatches}
        </div>
      ) : null}
      {drain ? (
        <div className="mt-1 text-muted-foreground" data-testid="pending-drain-result">
          <span className="text-foreground">drain&nbsp;→</span> sent=
          {drain.sentBatches} batch{drain.sentBatches === 1 ? "" : "es"} ({drain.sentEvents} events)
          · remaining={drain.remainingBatches}
          {drain.error ? <span className="text-destructive"> · error: {drain.error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
