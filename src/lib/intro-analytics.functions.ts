import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntroEvent = "shown" | "skipped" | "completed";

export interface IntroStatsRow {
  day: string; // YYYY-MM-DD
  path: string;
  shown: number;
  skipped: number;
  completed: number;
  completion_pct: number;
}

export interface IntroStats {
  totals: { shown: number; skipped: number; completed: number; completion_pct: number };
  rows: IntroStatsRow[];
  paths: string[];
  days: number;
}

export const getIntroStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { days?: number } | undefined) => ({
    days: Math.min(Math.max(Number(data?.days ?? 30), 1), 180),
  }))
  .handler(async ({ data, context }): Promise<IntroStats> => {
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("intro_events")
      .select("event,path,created_at")
      .gte("created_at", since)
      .limit(50_000);
    if (error) throw new Error(error.message);

    const bucket = new Map<string, IntroStatsRow>();
    const totals = { shown: 0, skipped: 0, completed: 0 };

    for (const r of rows ?? []) {
      const day = (r.created_at as string).slice(0, 10);
      const path = r.path ?? "/";
      const key = `${day}|${path}`;
      let row = bucket.get(key);
      if (!row) {
        row = { day, path, shown: 0, skipped: 0, completed: 0, completion_pct: 0 };
        bucket.set(key, row);
      }
      const ev = r.event as IntroEvent;
      if (ev === "shown" || ev === "skipped" || ev === "completed") {
        row[ev] += 1;
        totals[ev] += 1;
      }
    }

    const rowsOut = Array.from(bucket.values())
      .map((r) => ({
        ...r,
        completion_pct: r.shown ? Math.round((1000 * r.completed) / r.shown) / 10 : 0,
      }))
      .sort((a, b) =>
        a.day === b.day ? a.path.localeCompare(b.path) : b.day.localeCompare(a.day),
      );

    const paths = Array.from(new Set(rowsOut.map((r) => r.path))).sort();
    const completion_pct = totals.shown
      ? Math.round((1000 * totals.completed) / totals.shown) / 10
      : 0;

    return { totals: { ...totals, completion_pct }, rows: rowsOut, paths, days: data.days };
  });
