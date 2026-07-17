import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  orgId: z.string().uuid(),
  months: z.number().int().min(3).max(24).default(12),
});

export const getExecutiveAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { orgId, months } = data;
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    const fromIso = from.toISOString();
    const supabase = context.supabase;

    const [invRes, expRes, contractsRes, unitsRes, dealsRes, commRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, total, status, issue_date, paid_at, currency, property_id")
        .eq("org_id", orgId)
        .gte("issue_date", fromIso.slice(0, 10)),
      supabase
        .from("expenses")
        .select("id, amount, spent_at, category, currency")
        .eq("org_id", orgId)
        .gte("spent_at", fromIso.slice(0, 10)),
      supabase
        .from("contracts")
        .select("id, status, amount, start_date, end_date, unit_id")
        .eq("org_id", orgId)
        .is("deleted_at", null),
      supabase
        .from("units")
        .select("id, status, rent_amount, building_id, code")
        .eq("org_id", orgId)
        .is("deleted_at", null),
      supabase
        .from("deals")
        .select("id, status, agreed_amount, offer_amount, created_at, close_date")
        .eq("org_id", orgId)
        .gte("created_at", fromIso),
      supabase
        .from("commissions")
        .select("id, amount, status, paid_at, created_at")
        .eq("org_id", orgId)
        .gte("created_at", fromIso),
    ]);

    for (const r of [invRes, expRes, contractsRes, unitsRes, dealsRes, commRes]) {
      if (r.error) throw r.error;
    }

    const invoices = invRes.data ?? [];
    const expenses = expRes.data ?? [];
    const contracts = contractsRes.data ?? [];
    const units = unitsRes.data ?? [];
    const deals = dealsRes.data ?? [];
    const commissions = commRes.data ?? [];

    // Monthly buckets
    const monthKeys: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      monthKeys.push(d.toISOString().slice(0, 7));
    }
    const monthly = monthKeys.map((m) => ({
      month: m,
      revenue: 0,
      collected: 0,
      expenses: 0,
      net: 0,
      invoiced_count: 0,
    }));
    const idx = (k: string) => monthKeys.indexOf(k);

    for (const inv of invoices) {
      const k = String(inv.issue_date ?? "").slice(0, 7);
      const i = idx(k);
      if (i >= 0) {
        monthly[i].revenue += Number(inv.total ?? 0);
        monthly[i].invoiced_count += 1;
        if (inv.status === "paid") monthly[i].collected += Number(inv.total ?? 0);
      }
    }
    for (const e of expenses) {
      const k = String(e.spent_at ?? "").slice(0, 7);
      const i = idx(k);
      if (i >= 0) monthly[i].expenses += Number(e.amount ?? 0);
    }
    monthly.forEach((m) => (m.net = m.collected - m.expenses));

    // KPIs
    const revenueTotal = monthly.reduce((s, m) => s + m.revenue, 0);
    const collectedTotal = monthly.reduce((s, m) => s + m.collected, 0);
    const expensesTotal = monthly.reduce((s, m) => s + m.expenses, 0);
    const netTotal = collectedTotal - expensesTotal;
    const outstanding = invoices
      .filter((i: any) => i.status !== "paid" && i.status !== "cancelled")
      .reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);
    const collectionRate = revenueTotal > 0 ? collectedTotal / revenueTotal : 0;

    // Occupancy
    const totalUnits = units.length;
    const occupiedUnits = units.filter((u: any) => u.status === "occupied").length;
    const vacantUnits = units.filter((u: any) => u.status === "vacant").length;
    const occupancyRate = totalUnits > 0 ? occupiedUnits / totalUnits : 0;

    // Contracts
    const activeContracts = contracts.filter((c: any) => c.status === "active").length;
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400_000);
    const expiring30 = contracts.filter((c: any) => {
      if (!c.end_date || c.status !== "active") return false;
      const d = new Date(c.end_date);
      return d >= now && d <= in30;
    }).length;

    // Deals pipeline
    const pipelineValue = deals
      .filter((d: any) => !["closed", "cancelled"].includes(d.status))
      .reduce((s: number, d: any) => s + Number(d.agreed_amount ?? d.offer_amount ?? 0), 0);
    const wonValue = deals
      .filter((d: any) => d.status === "closed")
      .reduce((s: number, d: any) => s + Number(d.agreed_amount ?? d.offer_amount ?? 0), 0);
    const dealsByStatus: Record<string, number> = {};
    for (const d of deals) dealsByStatus[d.status] = (dealsByStatus[d.status] ?? 0) + 1;

    // Commissions
    const commissionsPaid = commissions
      .filter((c: any) => c.status === "paid")
      .reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
    const commissionsPending = commissions
      .filter((c: any) => c.status !== "paid")
      .reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);

    // Expenses by category
    const expensesByCategory: Record<string, number> = {};
    for (const e of expenses) {
      const k = String(e.category ?? "other");
      expensesByCategory[k] = (expensesByCategory[k] ?? 0) + Number(e.amount ?? 0);
    }

    // Simple revenue forecast: linear regression on last N months collected
    const y = monthly.map((m) => m.collected);
    const n = y.length;
    const xs = y.map((_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (y[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    const slope = den === 0 ? 0 : num / den;
    const intercept = meanY - slope * meanX;
    const forecast: { month: string; forecast: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + i);
      forecast.push({
        month: d.toISOString().slice(0, 7),
        forecast: Math.max(0, intercept + slope * (n - 1 + i)),
      });
    }

    return {
      kpis: {
        revenueTotal,
        collectedTotal,
        expensesTotal,
        netTotal,
        outstanding,
        collectionRate,
        occupancyRate,
        occupiedUnits,
        vacantUnits,
        totalUnits,
        activeContracts,
        expiring30,
        pipelineValue,
        wonValue,
        commissionsPaid,
        commissionsPending,
      },
      monthly,
      forecast,
      dealsByStatus,
      expensesByCategory,
    };
  });

const kpiSchema = z.object({
  orgId: z.string().uuid(),
  kpi: z.enum([
    "collectedTotal",
    "revenueTotal",
    "outstanding",
    "netTotal",
    "occupancyRate",
    "vacantUnits",
    "activeContracts",
    "pipelineValue",
    "commissionsPaid",
    "commissionsPending",
  ]),
  months: z.number().int().min(3).max(24).default(12),
  page: z.number().int().min(1).max(2000).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  sortField: z.enum(["date", "amount", "status"]).default("date"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type KpiRecord = {
  id: string;
  primary: string;
  secondary?: string;
  date?: string | null;
  amount?: number | null;
  status?: string | null;
  href?: string | null;
};

export const getKpiRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => kpiSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ records: KpiRecord[]; count: number; page: number; pageSize: number }> => {
      const {
        orgId,
        kpi,
        months,
        page,
        pageSize,
        dateFrom,
        dateTo,
        status,
        category,
        sortField,
        sortDir,
      } = data;
      const from = new Date();
      from.setMonth(from.getMonth() - months);
      const fromDate = dateFrom || from.toISOString().slice(0, 10);
      const toDate = dateTo || null;
      const supabase = context.supabase;
      const rangeFrom = (page - 1) * pageSize;
      const rangeTo = rangeFrom + pageSize - 1;
      const asc = sortDir === "asc";

      const wrap = (rows: KpiRecord[], count: number | null) => ({
        records: rows,
        count: count ?? rows.length,
        page,
        pageSize,
      });

      if (kpi === "collectedTotal" || kpi === "revenueTotal" || kpi === "outstanding") {
        const orderCol =
          sortField === "amount" ? "total" : sortField === "status" ? "status" : "issue_date";
        let q = supabase
          .from("invoices")
          .select("id, number, total, status, issue_date, paid_at", { count: "exact" })
          .eq("org_id", orgId)
          .gte("issue_date", fromDate);
        if (toDate) q = q.lte("issue_date", toDate);
        if (kpi === "collectedTotal") q = q.eq("status", "paid");
        else if (kpi === "outstanding") q = q.not("status", "in", "(paid,cancelled)");
        else if (status) q = q.eq("status", status as any);
        q = q.order(orderCol, { ascending: asc }).range(rangeFrom, rangeTo);
        const { data: rows, error, count } = await q;
        if (error) throw error;
        return wrap(
          (rows ?? []).map((r: any) => ({
            id: r.id,
            primary: r.number ?? r.id,
            secondary: `Invoice · ${r.status}`,
            date: r.paid_at ?? r.issue_date,
            amount: Number(r.total ?? 0),
            status: r.status,
            href: `/accounting`,
          })),
          count,
        );
      }

      if (kpi === "netTotal") {
        const orderCol = sortField === "amount" ? "amount" : "spent_at";
        let q = supabase
          .from("expenses")
          .select("id, description, category, amount, spent_at", { count: "exact" })
          .eq("org_id", orgId)
          .gte("spent_at", fromDate);
        if (toDate) q = q.lte("spent_at", toDate);
        if (category) q = q.eq("category", category as any);
        const {
          data: exps,
          error,
          count,
        } = await q.order(orderCol, { ascending: asc }).range(rangeFrom, rangeTo);
        if (error) throw error;
        return wrap(
          (exps ?? []).map((r: any) => ({
            id: r.id,
            primary: r.description ?? r.category ?? r.id,
            secondary: `Expense · ${r.category ?? "—"}`,
            date: r.spent_at,
            amount: -Number(r.amount ?? 0),
            status: null,
            href: `/accounting/expenses`,
          })),
          count,
        );
      }

      if (kpi === "occupancyRate" || kpi === "vacantUnits") {
        const orderCol =
          sortField === "amount" ? "rent_amount" : sortField === "status" ? "status" : "code";
        let q = supabase
          .from("units")
          .select("id, code, status, rent_amount, type", { count: "exact" })
          .eq("org_id", orgId)
          .is("deleted_at", null);
        if (kpi === "vacantUnits") q = q.eq("status", "vacant");
        else if (status) q = q.eq("status", status as any);
        if (category) q = q.eq("type", category as any);
        const {
          data: rows,
          error,
          count,
        } = await q.order(orderCol, { ascending: asc }).range(rangeFrom, rangeTo);
        if (error) throw error;
        return wrap(
          (rows ?? []).map((r: any) => ({
            id: r.id,
            primary: r.code,
            secondary: `${r.type ?? "unit"} · ${r.status}`,
            amount: Number(r.rent_amount ?? 0),
            status: r.status,
            href: `/properties`,
          })),
          count,
        );
      }

      if (kpi === "activeContracts") {
        const orderCol =
          sortField === "amount" ? "amount" : sortField === "status" ? "status" : "end_date";
        let q = supabase
          .from("contracts")
          .select("id, contract_number, status, amount, start_date, end_date", { count: "exact" })
          .eq("org_id", orgId)
          .eq("status", (status || "active") as any)
          .is("deleted_at", null);
        if (dateFrom) q = q.gte("start_date", fromDate);
        if (toDate) q = q.lte("end_date", toDate);
        const {
          data: rows,
          error,
          count,
        } = await q.order(orderCol, { ascending: asc }).range(rangeFrom, rangeTo);
        if (error) throw error;
        return wrap(
          (rows ?? []).map((r: any) => ({
            id: r.id,
            primary: r.contract_number ?? r.id,
            secondary: `Ends ${r.end_date ?? "—"}`,
            date: r.start_date,
            amount: Number(r.amount ?? 0),
            status: r.status,
            href: `/rentals`,
          })),
          count,
        );
      }

      if (kpi === "pipelineValue") {
        const orderCol =
          sortField === "amount"
            ? "agreed_amount"
            : sortField === "status"
              ? "status"
              : "created_at";
        let q = supabase
          .from("deals")
          .select("id, status, agreed_amount, offer_amount, created_at, close_date", {
            count: "exact",
          })
          .eq("org_id", orgId)
          .gte("created_at", dateFrom ? `${fromDate}T00:00:00Z` : from.toISOString());
        if (toDate) q = q.lte("created_at", `${toDate}T23:59:59Z`);
        if (status) q = q.eq("status", status as any);
        else q = q.not("status", "in", "(closed,cancelled)");
        const {
          data: rows,
          error,
          count,
        } = await q.order(orderCol, { ascending: asc }).range(rangeFrom, rangeTo);
        if (error) throw error;
        return wrap(
          (rows ?? []).map((r: any) => ({
            id: r.id,
            primary: `Deal ${r.id.slice(0, 8)}`,
            secondary: `Status · ${r.status}`,
            date: r.close_date ?? r.created_at,
            amount: Number(r.agreed_amount ?? r.offer_amount ?? 0),
            status: r.status,
            href: `/dashboard/crm/deals/${r.id}`,
          })),
          count,
        );
      }

      if (kpi === "commissionsPaid" || kpi === "commissionsPending") {
        const orderCol =
          sortField === "amount" ? "amount" : sortField === "status" ? "status" : "created_at";
        let q = supabase
          .from("commissions")
          .select("id, amount, status, paid_at, created_at", { count: "exact" })
          .eq("org_id", orgId)
          .gte("created_at", dateFrom ? `${fromDate}T00:00:00Z` : from.toISOString());
        if (toDate) q = q.lte("created_at", `${toDate}T23:59:59Z`);
        if (status) q = q.eq("status", status as any);
        else q = kpi === "commissionsPaid" ? q.eq("status", "paid") : q.neq("status", "paid");
        q = q.order(orderCol, { ascending: asc }).range(rangeFrom, rangeTo);
        const { data: rows, error, count } = await q;
        if (error) throw error;
        return wrap(
          (rows ?? []).map((r: any) => ({
            id: r.id,
            primary: `Commission ${r.id.slice(0, 8)}`,
            secondary: `Status · ${r.status}`,
            date: r.paid_at ?? r.created_at,
            amount: Number(r.amount ?? 0),
            status: r.status,
            href: `/dashboard/crm/deals`,
          })),
          count,
        );
      }

      return { records: [], count: 0, page, pageSize };
    },
  );
