import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MonthPoint = { month: string; revenue: number; expenses: number };
export type OccupancyPoint = { month: string; occupancy: number };
export type Slice = { name: string; value: number };
export type CollectionSlice = { name: string; value: number };

export type DashboardAnalytics = {
  monthly: MonthPoint[]; // last 12 months
  occupancy: OccupancyPoint[]; // last 6 months (approx from contracts.start_date)
  property_types: Slice[]; // count per property_type
  collection: CollectionSlice[]; // paid vs outstanding (MTD)
  maintenance: Slice[]; // status breakdown
};

const input = z.object({ org_id: z.string().uuid() });

function monthList(count: number) {
  const now = new Date();
  const arr: { key: string; start: string; end: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    arr.push({
      key: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}`,
      start: s.toISOString().slice(0, 10),
      end: e.toISOString().slice(0, 10),
      label: s.toLocaleString("en-US", { month: "short" }),
    });
  }
  return arr;
}

export const getDashboardAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { org_id: string }) => input.parse(data))
  .handler(async ({ data, context }): Promise<DashboardAnalytics> => {
    const supabase = context.supabase as unknown as { from: (t: string) => any };
    const orgId = data.org_id;
    const months12 = monthList(12);
    const rangeStart = months12[0].start;
    const rangeEnd = months12[months12.length - 1].end;

    const [invRes, expRes, propRes, mtdInvRes, maintRes, contractRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("total, status, issue_date, paid_at")
        .eq("org_id", orgId)
        .gte("issue_date", rangeStart)
        .lt("issue_date", rangeEnd),
      supabase
        .from("expenses")
        .select("amount, spent_at")
        .eq("org_id", orgId)
        .gte("spent_at", rangeStart)
        .lt("spent_at", rangeEnd),
      supabase.from("properties").select("property_type").eq("org_id", orgId),
      supabase
        .from("invoices")
        .select("total, status, issue_date")
        .eq("org_id", orgId)
        .gte("issue_date", months12[months12.length - 1].start)
        .lt("issue_date", months12[months12.length - 1].end),
      supabase.from("maintenance_tickets").select("status").eq("org_id", orgId),
      supabase
        .from("contracts")
        .select("status, start_date, end_date")
        .eq("org_id", orgId)
        .is("deleted_at", null),
    ]);

    const monthly: MonthPoint[] = months12.map((m) => {
      const rev = ((invRes.data as any[]) ?? [])
        .filter((r) => r.status === "paid" && r.issue_date >= m.start && r.issue_date < m.end)
        .reduce((a, r) => a + Number(r.total ?? 0), 0);
      const exp = ((expRes.data as any[]) ?? [])
        .filter((r) => r.spent_at >= m.start && r.spent_at < m.end)
        .reduce((a, r) => a + Number(r.amount ?? 0), 0);
      return { month: m.label, revenue: Math.round(rev), expenses: Math.round(exp) };
    });

    // Occupancy proxy: active contracts overlapping each month / active-ever
    const months6 = months12.slice(-6);
    const contracts = ((contractRes.data as any[]) ?? []).filter((c) => c.status === "active");
    const activeEver = Math.max(contracts.length, 1);
    const occupancy: OccupancyPoint[] = months6.map((m) => {
      const active = contracts.filter(
        (c) => (c.start_date ?? "9999-01-01") < m.end && (c.end_date ?? "9999-01-01") >= m.start,
      ).length;
      return { month: m.label, occupancy: Math.round((active / activeEver) * 100) };
    });

    const typeMap = new Map<string, number>();
    for (const p of (propRes.data as any[]) ?? []) {
      const k = String(p.property_type ?? "other");
      typeMap.set(k, (typeMap.get(k) ?? 0) + 1);
    }
    const property_types: Slice[] = Array.from(typeMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const mtdInvoices = (mtdInvRes.data as any[]) ?? [];
    const paid = mtdInvoices
      .filter((r) => r.status === "paid")
      .reduce((a, r) => a + Number(r.total ?? 0), 0);
    const outstanding = mtdInvoices
      .filter((r) => r.status !== "paid")
      .reduce((a, r) => a + Number(r.total ?? 0), 0);
    const collection: CollectionSlice[] = [
      { name: "paid", value: Math.round(paid) },
      { name: "outstanding", value: Math.round(outstanding) },
    ];

    const maintMap = new Map<string, number>();
    for (const t of (maintRes.data as any[]) ?? []) {
      const k = String(t.status ?? "unknown");
      maintMap.set(k, (maintMap.get(k) ?? 0) + 1);
    }
    const maintenance: Slice[] = Array.from(maintMap.entries()).map(([name, value]) => ({
      name,
      value,
    }));

    return { monthly, occupancy, property_types, collection, maintenance };
  });
