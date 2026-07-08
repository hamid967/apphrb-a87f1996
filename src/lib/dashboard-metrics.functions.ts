import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DashboardMetrics = {
  properties: number;
  units_total: number;
  units_occupied: number;
  units_vacant: number;
  owners: number;
  tenants: number;
  contracts_active: number;
  revenue_month: number;
  expenses_month: number;
  profit_month: number;
  maintenance_open: number;
  support_open: number;
  ai_score: number; // 0..100
  occupancy_pct: number; // 0..100
  collection_pct: number; // 0..100
  // Snapshot at end of previous month (counts) / previous month totals
  // (currency). Used for computing month-over-month delta chips.
  properties_prev: number;
  units_occupied_prev: number;
  units_vacant_prev: number;
  owners_prev: number;
  tenants_prev: number;
  revenue_prev: number;
};

const input = z.object({ org_id: z.string().uuid() });

function monthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startISO: iso(start), endISO: iso(end), prevStartISO: iso(prevStart) };
}

export const getDashboardMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { org_id: string }) => input.parse(data))
  .handler(async ({ data, context }): Promise<DashboardMetrics> => {
    const supabase = context.supabase as unknown as {
      from: (t: string) => any;
    };
    const orgId = data.org_id;
    const { startISO, endISO, prevStartISO } = monthBounds();

    const count = (t: string, apply?: (q: any) => any) => {
      let q = supabase.from(t).select("id", { count: "exact", head: true }).eq("org_id", orgId);
      if (apply) q = apply(q);
      return q;
    };
    // Count rows created before the current month started (i.e. the snapshot
    // that existed at the end of last month). Best-effort — falls back to 0
    // if the table has no created_at column.
    const countPrev = (t: string, apply?: (q: any) => any) => {
      let q = supabase
        .from(t)
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .lt("created_at", startISO);
      if (apply) q = apply(q);
      return q;
    };

    const [
      propertiesR,
      unitsTotalR,
      unitsOccupiedR,
      unitsVacantR,
      ownersR,
      tenantsR,
      contractsR,
      invoicesMonthR,
      invoicesAllMonthR,
      expensesR,
      maintR,
      ticketsR,
      propertiesPrevR,
      unitsOccupiedPrevR,
      unitsVacantPrevR,
      ownersPrevR,
      tenantsPrevR,
      invoicesPrevMonthR,
    ] = await Promise.all([
      count("properties"),
      count("units"),
      count("units", (q) => q.eq("status", "occupied")),
      count("units", (q) => q.eq("status", "vacant")),
      count("owners"),
      count("tenants"),
      count("contracts", (q) => q.eq("status", "active")),
      supabase
        .from("invoices")
        .select("total, status, issue_date")
        .eq("org_id", orgId)
        .gte("issue_date", startISO)
        .lt("issue_date", endISO)
        .eq("status", "paid"),
      supabase
        .from("invoices")
        .select("total, status")
        .eq("org_id", orgId)
        .gte("issue_date", startISO)
        .lt("issue_date", endISO),
      supabase
        .from("expenses")
        .select("amount, spent_at")
        .eq("org_id", orgId)
        .gte("spent_at", startISO)
        .lt("spent_at", endISO),
      count("maintenance_tickets", (q) => q.in("status", ["open", "in_progress", "pending"])),
      count("tickets", (q) => q.in("status", ["open", "pending"])),
      countPrev("properties"),
      countPrev("units", (q) => q.eq("status", "occupied")),
      countPrev("units", (q) => q.eq("status", "vacant")),
      countPrev("owners"),
      countPrev("tenants"),
      supabase
        .from("invoices")
        .select("total, status, issue_date")
        .eq("org_id", orgId)
        .gte("issue_date", prevStartISO)
        .lt("issue_date", startISO)
        .eq("status", "paid"),
    ]);

    const sum = (
      rows: Array<{ total?: number | null; amount?: number | null }> | null | undefined,
      k: "total" | "amount",
    ) => (rows ?? []).reduce((a, r) => a + Number((r as any)[k] ?? 0), 0);

    const revenue_month = sum((invoicesMonthR.data as any[]) ?? [], "total");
    const expenses_month = sum((expensesR.data as any[]) ?? [], "amount");
    const profit_month = revenue_month - expenses_month;

    const invoicedTotal = sum((invoicesAllMonthR.data as any[]) ?? [], "total");
    const collection_pct =
      invoicedTotal > 0 ? Math.round((revenue_month / invoicedTotal) * 100) : 0;

    const unitsTotal = unitsTotalR.count ?? 0;
    const unitsOccupied = unitsOccupiedR.count ?? 0;
    const occupancy_pct = unitsTotal > 0 ? Math.round((unitsOccupied / unitsTotal) * 100) : 0;

    const maintOpen = maintR.count ?? 0;
    // Composite AI health score (0..100): occupancy 40, collection 40, maint penalty 20.
    const maintPenalty = Math.min(20, maintOpen * 2);
    const ai_score = Math.max(
      0,
      Math.min(100, Math.round(occupancy_pct * 0.4 + collection_pct * 0.4 + (20 - maintPenalty))),
    );

    const revenue_prev = sum((invoicesPrevMonthR.data as any[]) ?? [], "total");

    return {
      properties: propertiesR.count ?? 0,
      units_total: unitsTotal,
      units_occupied: unitsOccupied,
      units_vacant: unitsVacantR.count ?? 0,
      owners: ownersR.count ?? 0,
      tenants: tenantsR.count ?? 0,
      contracts_active: contractsR.count ?? 0,
      revenue_month,
      expenses_month,
      profit_month,
      maintenance_open: maintOpen,
      support_open: ticketsR.count ?? 0,
      ai_score,
      occupancy_pct,
      collection_pct,
      properties_prev: propertiesPrevR?.count ?? 0,
      units_occupied_prev: unitsOccupiedPrevR?.count ?? 0,
      units_vacant_prev: unitsVacantPrevR?.count ?? 0,
      owners_prev: ownersPrevR?.count ?? 0,
      tenants_prev: tenantsPrevR?.count ?? 0,
      revenue_prev,
    };
  });
