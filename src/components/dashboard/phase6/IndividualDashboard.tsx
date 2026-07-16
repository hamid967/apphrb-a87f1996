import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Coins, Gauge, Receipt, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getIndividualDashboard } from "@/lib/dashboard-phase6.functions";
import { EmptyDashboardState } from "./EmptyDashboardState";
import { KpiCard } from "./KpiCard";

const COLORS = ["#00D9C0", "#0A1A2F", "#C9A961", "#14B8A6", "#64748B"];
type LooseRow = Record<string, unknown>;
const nested = (row: LooseRow, key: string) => (row[key] ?? {}) as LooseRow;

function money(value: number, isAr: boolean) {
  return `${Number(value || 0).toLocaleString(isAr ? "ar" : "en", {
    maximumFractionDigits: 0,
  })} SAR`;
}

function moneyOrHidden(value: number | null, isAr: boolean) {
  return value === null ? (isAr ? "مخفي" : "Hidden") : money(value, isAr);
}

export function IndividualDashboard({
  orgId,
  from,
  to,
  isAr,
}: {
  orgId: string;
  from: string;
  to: string;
  isAr: boolean;
}) {
  const q = useQuery({
    queryKey: ["phase6-individual-dashboard", orgId, from, to],
    queryFn: () => getIndividualDashboard({ data: { org_id: orgId, from, to } }),
  });

  if (q.isLoading) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">...</div>;
  }

  if (q.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {q.error instanceof Error
          ? q.error.message
          : isAr
            ? "تعذر تحميل اللوحة"
            : "Could not load dashboard"}
      </div>
    );
  }

  const data = q.data;
  if (!data || data.isEmpty) return <EmptyDashboardState isAr={isAr} />;

  const budgetPct =
    data.kpis.personalBudgetTotal && data.kpis.personalExpenseTotal !== null
      ? Math.round((data.kpis.personalExpenseTotal / data.kpis.personalBudgetTotal) * 100)
      : 0;
  const maintenanceOnly = data.permissions?.maintenanceOnly;
  const canSeeAmounts = data.permissions?.canSeeAmounts;

  if (maintenanceOnly) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <ActionCard
          title={isAr ? "الصيانة" : "Maintenance"}
          empty={isAr ? "لا توجد مهام صيانة مفتوحة" : "No open maintenance items"}
          items={[
            {
              id: "open",
              label: isAr ? "طلبات مفتوحة" : "Open requests",
              meta: String(data.maintenance.openCount),
            },
            {
              id: "urgent",
              label: isAr ? "عاجلة بلا مورد" : "Urgent unassigned",
              meta: String(data.maintenance.urgentUnassigned),
            },
            {
              id: "scheduled",
              label: isAr ? "وقائية خلال 14 يوماً" : "Preventive due in 14 days",
              meta: String(data.maintenance.schedulesDue),
            },
          ]}
          icon={Wrench}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? "إجراءات الصيانة" : "Maintenance actions"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild>
              <Link to="/dashboard/maintenance">{isAr ? "فتح الصيانة" : "Open maintenance"}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={isAr ? "صافي الدخل هذا الشهر" : "Net income"}
          value={moneyOrHidden(data.kpis.netIncome, isAr)}
          subtitle={isAr ? "المحصّل ناقص المصاريف العقارية" : "Collected minus property expenses"}
          icon={Coins}
          to="/dashboard/payments"
          tone={data.kpis.netIncome === null || data.kpis.netIncome >= 0 ? "success" : "danger"}
        />
        <KpiCard
          title={isAr ? "نسبة الإشغال" : "Occupancy"}
          value={`${data.kpis.occupancyRate}%`}
          subtitle={`${data.kpis.occupiedUnits}/${data.kpis.totalUnits} ${isAr ? "وحدة" : "units"}`}
          icon={Gauge}
          to="/dashboard/units"
        />
        <KpiCard
          title={isAr ? "المتأخرات" : "Overdue"}
          value={moneyOrHidden(data.kpis.overdueAmount, isAr)}
          subtitle={`${data.kpis.overdueCount} ${isAr ? "دفعة" : "payments"}`}
          icon={AlertTriangle}
          to="/dashboard/payments"
          tone={data.kpis.overdueAmount && data.kpis.overdueAmount > 0 ? "danger" : "success"}
        />
        <KpiCard
          title={isAr ? "المصاريف الشخصية" : "Personal expenses"}
          value={moneyOrHidden(data.kpis.personalExpenseTotal, isAr)}
          subtitle={
            data.kpis.personalBudgetTotal
              ? `${budgetPct}% ${isAr ? "من الميزانية" : "of budget"}`
              : isAr
                ? "لا توجد ميزانية"
                : "No budget"
          }
          icon={Receipt}
          to="/dashboard/expenses"
          tone={budgetPct >= 100 ? "danger" : budgetPct >= 80 ? "warning" : "default"}
        />
      </div>

      {!maintenanceOnly && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAr ? "صافي الدخل آخر 12 شهراً" : "Net income, last 12 months"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 min-w-[520px] overflow-x-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthly}>
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="net" stroke="#00D9C0" fill="#99F6E4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAr ? "المصاريف الشخصية بالتصنيف" : "Personal expenses by category"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.personalByCategory}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                    >
                      {data.personalByCategory.map((item, index) => (
                        <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <ActionCard
          title={isAr ? "يستحق قريباً" : "Due soon"}
          empty={isAr ? "لا توجد دفعات قريبة" : "No upcoming payments"}
          items={[
            ...data.dueSoon.map((p: LooseRow) => ({
              id: `p-${String(p.id)}`,
              label:
                String(nested(p, "tenant").full_name ?? "") ||
                String(nested(p, "property").title_ar ?? "") ||
                String(nested(p, "property").title_en ?? "") ||
                "—",
              meta: canSeeAmounts
                ? `${String(p.due_date ?? "")} · ${money(Number(p.amount ?? 0) - Number(p.paid_amount ?? 0), isAr)}`
                : String(p.due_date ?? ""),
            })),
            ...data.expiringContracts.map((c: LooseRow) => ({
              id: `c-${String(c.id)}`,
              label:
                String(c.contract_number ?? "") ||
                String(nested(c, "tenant").full_name ?? "") ||
                "—",
              meta: `${isAr ? "ينتهي" : "Ends"} ${String(c.end_date ?? "")}`,
            })),
          ]}
        />
        <ActionCard
          title={isAr ? "الصيانة" : "Maintenance"}
          empty={isAr ? "لا توجد مهام صيانة مفتوحة" : "No open maintenance items"}
          items={[
            {
              id: "open",
              label: isAr ? "طلبات مفتوحة" : "Open requests",
              meta: String(data.maintenance.openCount),
            },
            {
              id: "urgent",
              label: isAr ? "عاجلة بلا مورد" : "Urgent unassigned",
              meta: String(data.maintenance.urgentUnassigned),
            },
            {
              id: "scheduled",
              label: isAr ? "وقائية خلال 14 يوماً" : "Preventive due in 14 days",
              meta: String(data.maintenance.schedulesDue),
            },
          ]}
          icon={Wrench}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? "إجراءات سريعة" : "Quick actions"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild variant="outline">
              <Link to="/dashboard/payments">{isAr ? "تسجيل سداد" : "Record payment"}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard/expenses">{isAr ? "إضافة مصروف" : "Add expense"}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard/maintenance">{isAr ? "طلب صيانة" : "Maintenance request"}</Link>
            </Button>
            <Button asChild>
              <Link to="/dashboard/reports">{isAr ? "تصدير تقرير" : "Export report"}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionCard({
  title,
  empty,
  items,
  icon: Icon,
}: {
  title: string;
  empty: string;
  items: { id: string; label: string; meta: string }[];
  icon?: typeof Wrench;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {Icon && <Icon className="size-4 text-primary" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">{empty}</div>
        ) : (
          items.slice(0, 8).map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
