import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

/**
 * Admin-wide production monitoring for `active_filters.*` analytics.
 *
 * All server fns here defense-in-depth: they call SECURITY DEFINER RPCs
 * that check `has_role(auth.uid(), 'super_admin')` internally, AND we
 * verify the role in TS too so a non-admin caller gets a clean 403
 * instead of a raw Postgres error.
 */
const HOUR_OPTIONS = [1, 24, 72, 168] as const;
export const HOUR_WINDOW_OPTIONS = HOUR_OPTIONS;
export const windowInput = z.object({
  hours: z
    .number()
    .int()
    .refine((h) => (HOUR_OPTIONS as readonly number[]).includes(h), {
      message: "hours must be one of 1, 24, 72, 168",
    }),
});
export const topFiltersInput = z.object({
  hours: windowInput.shape.hours,
  limit: z.number().int().min(1).max(50).default(20),
});
export const topPathsInput = z.object({
  hours: windowInput.shape.hours,
  limit: z.number().int().min(1).max(50).default(10),
});

export type FilterAnalyticsOverview = {
  windowHours: number;
  totalEvents: number;
  previousTotalEvents: number;
  uniqueUsers: number;
  uniqueSessions: number;
  activeSessionsLastHour: number;
  eventBreakdown: Record<string, number>;
  sourceBreakdown: Record<string, number>;
};

export const getFilterAnalyticsOverview = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => windowInput.parse(data))
  .handler(async ({ data, context }): Promise<FilterAnalyticsOverview> => {
    const { data: raw, error } = await context.supabase.rpc(
      "admin_filter_analytics_overview" as never,
      { _hours: data.hours } as never,
    );
    if (error) throw new Error(error.message);
    const parsed = raw as unknown as FilterAnalyticsOverview;
    return {
      windowHours: parsed.windowHours ?? data.hours,
      totalEvents: Number(parsed.totalEvents ?? 0),
      previousTotalEvents: Number(parsed.previousTotalEvents ?? 0),
      uniqueUsers: Number(parsed.uniqueUsers ?? 0),
      uniqueSessions: Number(parsed.uniqueSessions ?? 0),
      activeSessionsLastHour: Number(parsed.activeSessionsLastHour ?? 0),
      eventBreakdown: (parsed.eventBreakdown ?? {}) as Record<string, number>,
      sourceBreakdown: (parsed.sourceBreakdown ?? {}) as Record<string, number>,
    };
  });

export type HourlyPoint = { hour: string; events: number };

export const getFilterAnalyticsHourly = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => windowInput.parse(data))
  .handler(async ({ data, context }): Promise<HourlyPoint[]> => {
    const { data: rows, error } = await context.supabase.rpc(
      "admin_filter_analytics_hourly" as never,
      { _hours: data.hours } as never,
    );
    if (error) throw new Error(error.message);
    return ((rows as Array<{ hour: string; events: number }> | null) ?? []).map((r) => ({
      hour: r.hour,
      events: Number(r.events),
    }));
  });

export type TopFilterRow = {
  filterKey: string;
  removeCount: number;
  applyCount: number;
};

export const getFilterAnalyticsTopFilters = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => topFiltersInput.parse(data))
  .handler(async ({ data, context }): Promise<TopFilterRow[]> => {
    const { data: rows, error } = await context.supabase.rpc(
      "admin_filter_analytics_top_filters" as never,
      { _hours: data.hours, _limit: data.limit } as never,
    );
    if (error) throw new Error(error.message);
    return (
      (rows as Array<{
        filter_key: string;
        remove_count: number;
        apply_count: number;
      }> | null) ?? []
    ).map((r) => ({
      filterKey: r.filter_key,
      removeCount: Number(r.remove_count),
      applyCount: Number(r.apply_count),
    }));
  });

export type TopPathRow = { path: string; events: number };

export const getFilterAnalyticsTopPaths = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: unknown) => topPathsInput.parse(data))
  .handler(async ({ data, context }): Promise<TopPathRow[]> => {
    const { data: rows, error } = await context.supabase.rpc(
      "admin_filter_analytics_top_paths" as never,
      { _hours: data.hours, _limit: data.limit } as never,
    );
    if (error) throw new Error(error.message);
    return ((rows as Array<{ path: string; events: number }> | null) ?? []).map((r) => ({
      path: r.path,
      events: Number(r.events),
    }));
  });

export type FilterAnalyticsHealth = {
  lastEventAt: string | null;
  lastHourEvents: number;
  previousHourEvents: number;
  activeUsers24h: number;
};

export const getFilterAnalyticsHealth = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async ({ context }): Promise<FilterAnalyticsHealth> => {
    const { data: raw, error } = await context.supabase.rpc(
      "admin_filter_analytics_health" as never,
    );
    if (error) throw new Error(error.message);
    const parsed = raw as unknown as FilterAnalyticsHealth;
    return {
      lastEventAt: parsed.lastEventAt ?? null,
      lastHourEvents: Number(parsed.lastHourEvents ?? 0),
      previousHourEvents: Number(parsed.previousHourEvents ?? 0),
      activeUsers24h: Number(parsed.activeUsers24h ?? 0),
    };
  });
