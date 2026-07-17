import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type IntroEvent = "shown" | "skipped" | "completed" | "cta_click";

export interface IntroStatsRow {
  day: string; // YYYY-MM-DD
  path: string;
  shown: number;
  skipped: number;
  completed: number;
  cta_click: number;
  completion_pct: number;
  ctr_pct: number;
}

export interface IntroStats {
  totals: {
    shown: number;
    skipped: number;
    completed: number;
    cta_click: number;
    completion_pct: number;
    ctr_pct: number;
  };
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
    const totals = { shown: 0, skipped: 0, completed: 0, cta_click: 0 };

    for (const r of rows ?? []) {
      const day = (r.created_at as string).slice(0, 10);
      const path = r.path ?? "/";
      const key = `${day}|${path}`;
      let row = bucket.get(key);
      if (!row) {
        row = {
          day,
          path,
          shown: 0,
          skipped: 0,
          completed: 0,
          cta_click: 0,
          completion_pct: 0,
          ctr_pct: 0,
        };
        bucket.set(key, row);
      }
      const ev = r.event as IntroEvent;
      if (ev === "shown" || ev === "skipped" || ev === "completed" || ev === "cta_click") {
        row[ev] += 1;
        totals[ev] += 1;
      }
    }

    const pct = (num: number, den: number) =>
      den ? Math.round((1000 * num) / den) / 10 : 0;

    const rowsOut = Array.from(bucket.values())
      .map((r) => ({
        ...r,
        completion_pct: pct(r.completed, r.shown),
        ctr_pct: pct(r.cta_click, r.shown),
      }))
      .sort((a, b) =>
        a.day === b.day ? a.path.localeCompare(b.path) : b.day.localeCompare(a.day),
      );

    const paths = Array.from(new Set(rowsOut.map((r) => r.path))).sort();

    return {
      totals: {
        ...totals,
        completion_pct: pct(totals.completed, totals.shown),
        ctr_pct: pct(totals.cta_click, totals.shown),
      },
      rows: rowsOut,
      paths,
      days: data.days,
    };
  });
