import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-event input — one row per user interaction with ActiveFiltersBar.
 * Every field except `event_name` is optional because different event
 * shapes carry different metadata (chip_remove has filter_key + source,
 * horizontal_scroll has progress + reached_end, etc.).
 */
const eventSchema = z.object({
  session_id: z.string().max(64).optional().nullable(),
  event_name: z.string().min(1).max(64),
  filter_key: z.string().max(64).optional().nullable(),
  source: z.string().max(32).optional().nullable(),
  chip_count: z.number().int().min(0).max(1000).optional().nullable(),
  remaining: z.number().int().min(0).max(1000).optional().nullable(),
  distance_px: z.number().int().min(0).max(10_000).optional().nullable(),
  progress: z.number().min(0).max(1).optional().nullable(),
  reached_end: z.boolean().optional().nullable(),
  path: z.string().max(256).optional().nullable(),
  action: z.string().max(16).optional().nullable(),
  prev_event_name: z.string().max(64).optional().nullable(),
  prev_event_age_ms: z.number().int().min(0).max(600_000).optional().nullable(),
});

const ingestSchema = z.object({
  events: z.array(eventSchema).min(1).max(100),
});

/**
 * Batch-ingest ActiveFiltersBar analytics rows for the current user.
 * Called by the client-side flusher; each row is scoped to the caller
 * via `user_id = auth.uid()` (enforced by RLS + explicit assignment).
 */
export const ingestFilterAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ingestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const rows = data.events.map((e) => ({ ...e, user_id: context.userId }));
    const { error } = await context.supabase.from("filter_analytics_events").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

const statsInput = z.object({
  days: z.number().int().min(1).max(365).default(30),
});

export type FilterUsageStats = {
  windowDays: number;
  totals: {
    totalEvents: number;
    totalRemovals: number;
    totalApplies: number;
    clearAllCount: number;
    scrollEvents: number;
  };
  topFilters: Array<{ filterKey: string; removeCount: number }>;
  topFiltersApplied: Array<{
    filterKey: string;
    addCount: number;
    changeCount: number;
  }>;
  applyPrecededBy: Record<string, number>;
  sourceBreakdown: Record<string, number>;
  swipeFriction: {
    reveals: number;
    aborts: number;
    cancels: number;
    confirms: number;
    /** aborts / (aborts + reveals) — higher = more indecision */
    abortRate: number;
  };
  scrollStats: {
    events: number;
    avgProgress: number;
    reachedEndRate: number;
  };
  perPath: Array<{ path: string; events: number }>;
};

/**
 * Aggregate stats over the caller's own events within the requested window.
 *
 * Aggregation is done in TS after a bounded fetch because the per-user row
 * volume is small (bar interactions, not page hits) and this avoids
 * shipping SQL fragments for each metric. A hard row cap of 5000 keeps
 * memory bounded even for pathological cases.
 */
export const getFilterUsageStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statsInput.parse(data))
  .handler(async ({ data, context }): Promise<FilterUsageStats> => {
    const sinceIso = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("filter_analytics_events")
      .select(
        "event_name, filter_key, source, remaining, distance_px, progress, reached_end, path, action, prev_event_name",
      )
      .eq("user_id", context.userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    const list = rows ?? [];

    const removals = list.filter((r) => r.event_name === "active_filters.chip_remove");
    const clearAll = list.filter((r) => r.event_name === "active_filters.clear_all");
    const scroll = list.filter((r) => r.event_name === "active_filters.horizontal_scroll");
    const swipeReveal = list.filter((r) => r.event_name === "active_filters.swipe_reveal");
    const swipeAbort = list.filter((r) => r.event_name === "active_filters.swipe_abort");
    const swipeCancel = list.filter((r) => r.event_name === "active_filters.swipe_cancel");
    const swipeConfirm = removals.filter((r) => r.source === "swipe");
    const applies = list.filter((r) => r.event_name === "active_filters.chip_apply");

    // Applies per filter split by action (add vs change).
    const applyCounts = new Map<string, { addCount: number; changeCount: number }>();
    for (const r of applies) {
      if (!r.filter_key) continue;
      const entry = applyCounts.get(r.filter_key) ?? { addCount: 0, changeCount: 0 };
      if (r.action === "add") entry.addCount += 1;
      else if (r.action === "change") entry.changeCount += 1;
      applyCounts.set(r.filter_key, entry);
    }
    const topFiltersApplied = [...applyCounts.entries()]
      .map(([filterKey, v]) => ({ filterKey, ...v }))
      .sort((a, b) => b.addCount + b.changeCount - (a.addCount + a.changeCount))
      .slice(0, 20);

    // What immediately preceded each apply — the "friction context" signal.
    const applyPrecededBy: Record<string, number> = {};
    for (const r of applies) {
      const key = r.prev_event_name ? r.prev_event_name.replace(/^active_filters\./, "") : "(none)";
      applyPrecededBy[key] = (applyPrecededBy[key] ?? 0) + 1;
    }

    // top filters removed
    const filterCounts = new Map<string, number>();
    for (const r of removals) {
      if (!r.filter_key) continue;
      filterCounts.set(r.filter_key, (filterCounts.get(r.filter_key) ?? 0) + 1);
    }
    const topFilters = [...filterCounts.entries()]
      .map(([filterKey, removeCount]) => ({ filterKey, removeCount }))
      .sort((a, b) => b.removeCount - a.removeCount)
      .slice(0, 20);

    // source breakdown (button / keyboard / swipe)
    const sourceBreakdown: Record<string, number> = {};
    for (const r of removals) {
      const s = r.source ?? "unknown";
      sourceBreakdown[s] = (sourceBreakdown[s] ?? 0) + 1;
    }

    // scroll aggregates
    let progressSum = 0;
    let reachedEndCount = 0;
    for (const r of scroll) {
      progressSum += typeof r.progress === "number" ? r.progress : 0;
      if (r.reached_end) reachedEndCount += 1;
    }
    const scrollStats = {
      events: scroll.length,
      avgProgress: scroll.length ? progressSum / scroll.length : 0,
      reachedEndRate: scroll.length ? reachedEndCount / scroll.length : 0,
    };

    // per-path event volume
    const pathCounts = new Map<string, number>();
    for (const r of list) {
      const p = r.path ?? "unknown";
      pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);
    }
    const perPath = [...pathCounts.entries()]
      .map(([path, events]) => ({ path, events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 10);

    const swipeAttempts = swipeReveal.length + swipeAbort.length;

    return {
      windowDays: data.days,
      totals: {
        totalEvents: list.length,
        totalRemovals: removals.length,
        totalApplies: applies.length,
        clearAllCount: clearAll.length,
        scrollEvents: scroll.length,
      },
      topFilters,
      topFiltersApplied,
      applyPrecededBy,
      sourceBreakdown,
      swipeFriction: {
        reveals: swipeReveal.length,
        aborts: swipeAbort.length,
        cancels: swipeCancel.length,
        confirms: swipeConfirm.length,
        abortRate: swipeAttempts ? swipeAbort.length / swipeAttempts : 0,
      },
      scrollStats,
      perPath,
    };
  });
