/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const periodSchema = z.object({
  org_id: z.string().uuid(),
  from: z.string().min(10),
  to: z.string().min(10),
});

type MoneyRow = Record<string, any>;

const sum = (rows: MoneyRow[], pick: (row: MoneyRow) => unknown) =>
  rows.reduce((total, row) => total + Number(pick(row) ?? 0), 0);

const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const monthKey = (date: Date) => date.toISOString().slice(0, 7);

export const getIndividualDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => periodSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = new Date();
    const from = data.from;
    const to = data.to;
    const yearStart = addMonths(monthStart(today), -11);
    const trendFrom = isoDate(yearStart);
    const in30 = isoDate(new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000));
    const in90 = isoDate(new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000));
    const in14 = isoDate(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000));

    const roleRes = await (supabase as any)
      .from("organization_members")
      .select("role")
      .eq("org_id", data.org_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (roleRes.error) throw roleRes.error;
    const role = String(roleRes.data?.role ?? "viewer");
    const canSeeAmounts = !["viewer", "maintenance_supervisor"].includes(role);
    const maintenanceOnly = role === "maintenance_supervisor";

    const [
      paymentsRes,
      expensesRes,
      unitsRes,
      budgetsRes,
      maintenanceRes,
      schedulesRes,
      dueSoonRes,
      contractsRes,
    ] = await Promise.all([
      (supabase as any)
        .from("lease_payments")
        .select(
          "id,due_date,amount,paid_amount,status,property:properties(id,title_ar,title_en),tenant:tenants(id,full_name)",
        )
        .eq("org_id", data.org_id)
        .gte("due_date", trendFrom)
        .lte("due_date", to),
      (supabase as any)
        .from("expenses")
        .select(
          "id,spent_at,amount,gross_amount,net_amount,scope,category,category_ref:expense_categories(id,name_ar,name_en,scope)",
        )
        .eq("org_id", data.org_id)
        .is("archived_at", null)
        .gte("spent_at", trendFrom)
        .lte("spent_at", to),
      (supabase as any).from("units").select("id,status").eq("org_id", data.org_id),
      (supabase as any)
        .from("budgets")
        .select("id,monthly_amount,scope,category_id")
        .eq("org_id", data.org_id)
        .is("archived_at", null),
      (supabase as any)
        .from("maintenance_requests")
        .select("id,title,priority,status,opened_at,assigned_vendor_id")
        .eq("org_id", data.org_id)
        .is("archived_at", null)
        .in("status", ["new", "approved", "in_progress"]),
      (supabase as any)
        .from("maintenance_schedules")
        .select("id,name,next_due_date,status")
        .eq("org_id", data.org_id)
        .is("archived_at", null)
        .eq("status", "active")
        .lte("next_due_date", in14),
      (supabase as any)
        .from("lease_payments")
        .select(
          "id,due_date,amount,paid_amount,status,property:properties(id,title_ar,title_en),tenant:tenants(id,full_name)",
        )
        .eq("org_id", data.org_id)
        .gte("due_date", isoDate(today))
        .lte("due_date", in30)
        .neq("status", "paid")
        .limit(8),
      (supabase as any)
        .from("contracts")
        .select(
          "id,contract_number,end_date,property:properties(id,title_ar,title_en),tenant:tenants(id,full_name)",
        )
        .eq("org_id", data.org_id)
        .gte("end_date", isoDate(today))
        .lte("end_date", in90)
        .limit(8),
    ]);

    for (const result of [
      paymentsRes,
      expensesRes,
      unitsRes,
      budgetsRes,
      maintenanceRes,
      schedulesRes,
      dueSoonRes,
      contractsRes,
    ]) {
      if (result.error) throw result.error;
    }

    const payments = paymentsRes.data ?? [];
    const expenses = expensesRes.data ?? [];
    const units = unitsRes.data ?? [];
    const budgets = budgetsRes.data ?? [];
    const maintenance = maintenanceRes.data ?? [];
    const schedules = schedulesRes.data ?? [];

    const periodPayments = payments.filter((p: MoneyRow) => p.due_date >= from && p.due_date <= to);
    const periodExpenses = expenses.filter((e: MoneyRow) => e.spent_at >= from && e.spent_at <= to);
    const propertyExpenses = periodExpenses.filter((e: MoneyRow) => e.scope !== "personal");
    const personalExpenses = periodExpenses.filter((e: MoneyRow) => e.scope === "personal");
    const collected = sum(periodPayments, (p) => p.paid_amount);
    const propertyExpenseTotal = sum(propertyExpenses, (e) => e.gross_amount ?? e.amount);
    const overdueRows = payments.filter(
      (p: MoneyRow) =>
        (p.status === "overdue" || p.due_date < isoDate(today)) && p.status !== "paid",
    );
    const totalUnits = units.length;
    const occupiedUnits = units.filter((u: MoneyRow) =>
      ["rented", "occupied", "leased"].includes(String(u.status ?? "")),
    ).length;
    const personalBudgetTotal = sum(
      budgets.filter((b: MoneyRow) => b.scope === "personal"),
      (b) => b.monthly_amount,
    );
    const personalExpenseTotal = sum(personalExpenses, (e) => e.gross_amount ?? e.amount);

    const monthly = Array.from({ length: 12 }).map((_, index) => {
      const date = addMonths(yearStart, index);
      const key = monthKey(date);
      const monthPayments = payments.filter((p: MoneyRow) => String(p.due_date).startsWith(key));
      const monthExpenses = expenses.filter(
        (e: MoneyRow) => String(e.spent_at).startsWith(key) && e.scope !== "personal",
      );
      const revenue = sum(monthPayments, (p) => p.paid_amount);
      const propertyExpense = sum(monthExpenses, (e) => e.gross_amount ?? e.amount);
      return { month: key, revenue, expenses: propertyExpense, net: revenue - propertyExpense };
    });

    const personalByCategoryMap = new Map<string, number>();
    for (const e of personalExpenses) {
      const label = e.category_ref?.name_ar ?? e.category_ref?.name_en ?? e.category ?? "other";
      personalByCategoryMap.set(
        label,
        (personalByCategoryMap.get(label) ?? 0) + Number(e.gross_amount ?? e.amount ?? 0),
      );
    }

    return {
      permissions: {
        role,
        canSeeAmounts,
        maintenanceOnly,
      },
      kpis: {
        netIncome: canSeeAmounts && !maintenanceOnly ? collected - propertyExpenseTotal : null,
        occupancyRate: totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0,
        occupiedUnits,
        totalUnits,
        overdueAmount:
          canSeeAmounts && !maintenanceOnly
            ? sum(overdueRows, (p) =>
                Math.max(Number(p.amount ?? 0) - Number(p.paid_amount ?? 0), 0),
              )
            : null,
        overdueCount: overdueRows.length,
        personalExpenseTotal: canSeeAmounts && !maintenanceOnly ? personalExpenseTotal : null,
        personalBudgetTotal: canSeeAmounts && !maintenanceOnly ? personalBudgetTotal : null,
      },
      monthly: canSeeAmounts && !maintenanceOnly ? monthly : [],
      personalByCategory:
        canSeeAmounts && !maintenanceOnly
          ? Array.from(personalByCategoryMap.entries()).map(([name, value]) => ({
              name,
              value,
            }))
          : [],
      dueSoon: maintenanceOnly
        ? []
        : canSeeAmounts
          ? (dueSoonRes.data ?? [])
          : (dueSoonRes.data ?? []).map((row: MoneyRow) => ({
              id: row.id,
              due_date: row.due_date,
              status: row.status,
              property: row.property,
              tenant: row.tenant,
            })),
      expiringContracts: maintenanceOnly ? [] : (contractsRes.data ?? []),
      maintenance: {
        openCount: maintenance.length,
        urgentUnassigned: maintenance.filter(
          (m: MoneyRow) => m.priority === "urgent" && !m.assigned_vendor_id,
        ).length,
        schedulesDue: schedules.length,
        requests: maintenance.slice(0, 5),
        schedules: schedules.slice(0, 5),
      },
      isEmpty:
        payments.length === 0 &&
        expenses.length === 0 &&
        units.length === 0 &&
        maintenance.length === 0,
    };
  });
