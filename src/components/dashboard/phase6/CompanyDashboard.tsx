import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Building2, Coins, Receipt, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanyDashboard } from "@/lib/dashboard-phase6.functions";
import { EmptyDashboardState } from "./EmptyDashboardState";
import { KpiCard } from "./KpiCard";

type ActionItem = {
  id: string;
  type: string;
  title: string;
  meta: string;
  amount: number | null;
  to: string;
};

function money(value: number | null, isAr: boolean) {
  if (value === null) return isAr ? "مخفي" : "Hidden";
  return `${Number(value || 0).toLocaleString(isAr ? "ar" : "en", {
    maximumFractionDigits: 0,
  })} SAR`;
}

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export function CompanyDashboard({
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
    queryKey: ["phase6-company-dashboard", orgId, from, to],
    queryFn: () => getCompanyDashboard({ data: { org_id: orgId, from, to } }),
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
            ? "تعذر تحميل لوحة المنشأة"
            : "Could not load company dashboard"}
      </div>
    );
  }

  const data = q.data;
  if (!data || data.isEmpty) return <EmptyDashboardState isAr={isAr} />;

  const maintenanceOnly = data.permissions?.maintenanceOnly;

  if (maintenanceOnly) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <KpiCard
          title={isAr ? "طلبات صيانة مفتوحة" : "Open maintenance"}
          value={String(data.maintenance.openCount)}
          subtitle={isAr ? "ضمن محفظة المنشأة" : "Across the portfolio"}
          icon={Wrench}
          to="/dashboard/maintenance"
        />
        <KpiCard
          title={isAr ? "عاجلة بلا مورد" : "Urgent unassigned"}
          value={String(data.maintenance.urgentUnassigned)}
          subtitle={isAr ? "تحتاج إجراء سريع" : "Needs quick action"}
          icon={AlertTriangle}
          to="/dashboard/maintenance"
          tone={data.maintenance.urgentUnassigned > 0 ? "danger" : "success"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title={isAr ? "إيرادات المحفظة" : "Portfolio revenue"}
          value={money(data.kpis.collected, isAr)}
          subtitle={
            isAr
              ? `المتوقع: ${money(data.kpis.expected, isAr)}`
              : `Expected: ${money(data.kpis.expected, isAr)}`
          }
          icon={Coins}
          to="/dashboard/payments"
        />
        <KpiCard
          title={isAr ? "صافي الدخل" : "Net income"}
          value={money(data.kpis.portfolioNet, isAr)}
          subtitle={isAr ? "قبل الضريبة للمنشأة" : "Pre-tax for company"}
          icon={Receipt}
          to="/dashboard/reports"
          tone={
            data.kpis.portfolioNet === null || data.kpis.portfolioNet >= 0 ? "success" : "danger"
          }
        />
        <KpiCard
          title={isAr ? "الإشغال" : "Occupancy"}
          value={percent(data.kpis.occupancyRate)}
          subtitle={`${data.kpis.vacantUnits} ${isAr ? "وحدة شاغرة" : "vacant units"}`}
          icon={Building2}
          to="/dashboard/units"
        />
        <KpiCard
          title={isAr ? "المتأخرات" : "Overdue"}
          value={money(data.kpis.overdueAmount, isAr)}
          subtitle={
            isAr
              ? `النسبة: ${percent(data.kpis.overdueRatio)}`
              : `Ratio: ${percent(data.kpis.overdueRatio)}`
          }
          icon={AlertTriangle}
          to="/dashboard/payments"
          tone={data.kpis.overdueAmount && data.kpis.overdueAmount > 0 ? "danger" : "success"}
        />
        <KpiCard
          title={isAr ? "مصاريف الصيانة" : "Maintenance spend"}
          value={money(data.kpis.maintenanceThisPeriod, isAr)}
          subtitle={
            isAr
              ? `متوسط 6 أشهر: ${money(data.kpis.maintenanceSixMonthAvg, isAr)}`
              : `6-mo avg: ${money(data.kpis.maintenanceSixMonthAvg, isAr)}`
          }
          icon={Wrench}
          to="/dashboard/maintenance"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? "أعلى العقارات صافي دخل" : "Top properties by net income"}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topProperties} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="property" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="net" fill="#00D9C0" radius={[4, 4, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? "الإيرادات مقابل المصاريف" : "Revenue vs expenses"}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#00D9C0" strokeWidth={2} />
                <Line type="monotone" dataKey="expenses" stroke="#C9A961" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <ActionItems items={data.actionItems as ActionItem[]} isAr={isAr} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? "ملخص ضريبي تمهيدي" : "Tax readiness summary"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{isAr ? "ضريبة مخرجات" : "Output VAT"}</span>
              <strong>{money(data.taxSummary?.outputVat ?? null, isAr)}</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{isAr ? "ضريبة مدخلات" : "Input VAT"}</span>
              <strong>{money(data.taxSummary?.inputVat ?? null, isAr)}</strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActionItems({ items, isAr }: { items: ActionItem[]; isAr: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{isAr ? "يتطلب إجراء" : "Needs action"}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {isAr ? "لا توجد عناصر عاجلة حالياً" : "No urgent action items"}
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {items.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                className="flex items-center justify-between gap-3 p-3 text-sm transition hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.meta}</div>
                </div>
                {item.amount !== null && (
                  <span className="shrink-0 text-xs font-semibold">{money(item.amount, isAr)}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
