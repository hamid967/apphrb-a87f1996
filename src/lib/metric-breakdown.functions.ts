import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MetricKey =
  | "properties"
  | "units_occupied"
  | "units_vacant"
  | "owners"
  | "tenants"
  | "revenue";

export type MetricBreakdown = {
  metric: MetricKey;
  series: Array<{ month: string; label: string; value: number }>; // last 6 months, oldest→newest
  current: number;
  previous: number;
  delta_abs: number;
  delta_pct: number | null;
  compare: "prev_month" | "yoy";
  end_month: string; // YYYY-MM anchor
  previous_month: string; // YYYY-MM of the compared bucket
  // For revenue: split of previous month by paid vs invoiced
  extra?: Record<string, number>;
};

const input = z.object({
  org_id: z.string().uuid(),
  metric: z.enum(["properties", "units_occupied", "units_vacant", "owners", "tenants", "revenue"]),
  end_month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  compare: z.enum(["prev_month", "yoy"]).optional(),
});

function monthList(n: number, anchor?: Date, extraOlder = 0) {
  const out: Array<{ start: Date; end: Date; key: string; label: string }> = [];
  const base = anchor ?? new Date();
  for (let i = n - 1; i >= -extraOlder; i--) {
    const start = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const end = new Date(base.getFullYear(), base.getMonth() - i + 1, 1);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    const label = start.toLocaleString("en-US", { month: "short" });
    out.push({ start, end, key, label });
  }
  return out;
}

export const getMetricBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      org_id: string;
      metric: MetricKey;
      end_month?: string;
      compare?: "prev_month" | "yoy";
    }) => input.parse(data),
  )
  .handler(async ({ data, context }): Promise<MetricBreakdown> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as unknown as { from: (t: string) => any };
    const orgId = data.org_id;
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const compare = data.compare ?? "prev_month";
    const anchor = data.end_month
      ? new Date(Number(data.end_month.slice(0, 4)), Number(data.end_month.slice(5, 7)) - 1, 1)
      : new Date();
    // Need 12 extra older months when comparing YoY so the series includes the compared bucket.
    const months = monthList(6, anchor, compare === "yoy" ? 12 : 0);

    // Helper: count of rows in table with org_id + created_at < endISO,
    // representing the snapshot at end of that month.
    async function snapshotCount(table: string, extra?: (q: any) => any) {
      const values: number[] = [];
      for (const m of months) {
        let q = supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .lt("created_at", iso(m.end));
        if (extra) q = extra(q);
        const { count } = await q;
        values.push(count ?? 0);
      }
      return values;
    }

    let values: number[] = [];
    const extra: Record<string, number> = {};

    if (data.metric === "properties") values = await snapshotCount("properties");
    else if (data.metric === "owners") values = await snapshotCount("owners");
    else if (data.metric === "tenants") values = await snapshotCount("tenants");
    else if (data.metric === "units_occupied")
      values = await snapshotCount("units", (q) => q.eq("status", "occupied"));
    else if (data.metric === "units_vacant")
      values = await snapshotCount("units", (q) => q.eq("status", "vacant"));
    else {
      // revenue: sum of paid invoices per month
      for (const m of months) {
        const { data: rows } = await supabase
          .from("invoices")
          .select("total, status")
          .eq("org_id", orgId)
          .eq("status", "paid")
          .gte("issue_date", iso(m.start))
          .lt("issue_date", iso(m.end));
        values.push((rows ?? []).reduce((a: number, r: any) => a + Number(r.total ?? 0), 0));
      }
      // Extra: comparison-bucket invoiced (all statuses) for context
      const cmpIdx = compare === "yoy" ? months.length - 1 - 12 : months.length - 2;
      const prev = months[cmpIdx];
      if (prev) {
        const { data: rows } = await supabase
          .from("invoices")
          .select("total, status")
          .eq("org_id", orgId)
          .gte("issue_date", iso(prev.start))
          .lt("issue_date", iso(prev.end));
        extra.invoiced_prev = (rows ?? []).reduce(
          (a: number, r: any) => a + Number(r.total ?? 0),
          0,
        );
        extra.paid_prev = values[cmpIdx] ?? 0;
      }
    }

    const fullSeries = months.map((m, i) => ({
      month: m.key,
      label: m.label,
      value: values[i] ?? 0,
    }));
    // Visible window = last 6 months (anchor-relative)
    const series = fullSeries.slice(-6);
    const currentIdx = fullSeries.length - 1;
    const compareIdx = compare === "yoy" ? currentIdx - 12 : currentIdx - 1;
    const current = fullSeries[currentIdx]?.value ?? 0;
    const previous = fullSeries[compareIdx]?.value ?? 0;
    const previous_month = fullSeries[compareIdx]?.month ?? "";
    const delta_abs = current - previous;
    const delta_pct =
      previous === 0 && current === 0
        ? null
        : previous === 0
          ? 100
          : ((current - previous) / previous) * 100;

    return {
      metric: data.metric,
      series,
      current,
      previous,
      delta_abs,
      delta_pct,
      compare,
      end_month: months[currentIdx].key,
      previous_month,
      extra,
    };
  });
