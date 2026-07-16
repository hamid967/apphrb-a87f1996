import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Building2, Coins, Gauge, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function money(value: number, isAr: boolean) {
  return `${Number(value || 0).toLocaleString(isAr ? "ar" : "en", {
    maximumFractionDigits: 0,
  })} SAR`;
}

function moneyOrHidden(value: number | null, isAr: boolean) {
  return value === null ? (isAr ? "مخفي" : "Hidden") : money(value, isAr);
}

function itemTypeLabel(type: string, isAr: boolean) {
  const labels: Record<string, [string, string]> = {
    overdue: ["متأخرات", "Overdue"],
    contract: ["عقد ينتهي", "Contract"],
    maintenance: ["صيانة عاجلة", "Maintenance"],
    vacancy: ["وحدة شاغرة", "Vacancy"],
  };
  const entry = labels[type] ?? [type, type];
  return isAr ? entry[0] : entry[1];
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

  if (data.permissions?.maintenanceOnly) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <KpiCard
          title={isAr ? "طلبات الصيانة المفتوحة" : "Open maintenance requests"}
          value={String(data.maintenance.openCount)}
          subtitle={isAr ? "ضمن المحفظة" : "Across the portfolio"}
          icon={Wrench}
          to="/dashboard/maintenance"
        />
        <KpiCard
          title={isAr ? "عاجلة بلا مورد" : "Urgent unassigned"}
          value={String(data.maintenance.urgentUnassigned)}
          subtitle={isAr ? "تتطلب إجراء" : "Needs action"}
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
          value={moneyOrHidden(data.kpis.collected, isAr)}
          subtitle={`${isAr ? "المتوقع" : "Expected"} ${moneyOrHidden(data.kpis.expected, isAr)}`}
          icon={Coins}
          to="/dashboard/payments"
          tone="success"
        />
        <KpiCard
          title={isAr ? "صافي دخل المحفظة" : "Portfolio net income"}
          value={moneyOrHidden(data.kpis.portfolioNet, isAr)}
          subtitle={isAr ? "بالصافي قبل الضريبة" : "Net before tax"}
          icon={Building2}
          to="/dashboard/reports"
          tone={
            data.kpis.portfolioNet === null || data.kpis.portfolioNet >= 0 ? "success" : "danger"
          }
        />
        <KpiCard
          title={isAr ? "الإشغال" : "Occupancy"}
          value={`${data.kpis.occupancyRate}%`}
          subtitle={`${data.kpis.vacantUnits} ${isAr ? "وحدة شاغرة" : "vacant units"}`}
          icon={Gauge}
          to="/dashboard/units"
        />
        <KpiCard
          title={isAr ? "المتأخرات" : "Overdue"}
          value={moneyOrHidden(data.kpis.overdueAmount, isAr)}
          subtitle={
            data.kpis.overdueRatio === null
              ? isAr
                ? "النسبة مخفية"
                : "Ratio hidden"
              : `${data.kpis.overdueRatio}% ${isAr ? "من المستحق" : "of due"}`
          }
          icon={AlertTriangle}
          to="/dashboard/payments"
          tone={data.kpis.overdueAmount && data.kpis.overdueAmount > 0 ? "danger" : "success"}
        />
        <KpiCard
          title={isAr ? "مصاريف الصيانة" : "Maintenance spend"}
          value={moneyOrHidden(data.kpis.maintenanceThisPeriod, isAr)}
          subtitle={`${isAr ? "متوسط 6 أشهر" : "6-mo avg"} ${moneyOrHidden(data.kpis.maintenanceSixMonthAvg, isAr)}`}
          icon={Wrench}
          to="/dashboard/maintenance"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? "أعلى 5 عقارات صافي دخل" : "Top 5 properties by net income"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 min-w-[520px] overflow-x-auto">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topProperties}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="property" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="net" fill="#00D9C0" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? "الإيرادات مقابل المصاريف آخر 12 شهراً" : "Revenue vs expenses, 12 months"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 min-w-[560px] overflow-x-auto">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="#00D9C0" strokeWidth={2} />
                  <Line type="monotone" dataKey="expenses" stroke="#0A1A2F" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? "يتطلب إجراء" : "Needs action"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.actionItems.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {isAr ? "لا توجد عناصر عاجلة الآن" : "No urgent items right now"}
              </div>
            ) : (
              data.actionItems.map((item: ActionItem) => (
                <Link
                  key={item.id}
                  to={item.to}
                  className="flex flex-col gap-2 rounded-md border p-3 transition-colors hover:bg-muted/60 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{itemTypeLabel(item.type, isAr)}</Badge>
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div>
                  </div>
                  {item.amount !== null && (
                    <div className="text-sm font-semibold">{money(item.amount, isAr)}</div>
                  )}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? "ملخص ضريبي ربع سنوي" : "Quarterly tax summary"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TaxLine
              label={isAr ? "ضريبة مخرجات محصّلة" : "Output VAT collected"}
              value={moneyOrHidden(data.taxSummary?.outputVat ?? null, isAr)}
            />
            <TaxLine
              label={isAr ? "ضريبة مدخلات على المصاريف" : "Input VAT on expenses"}
              value={moneyOrHidden(data.taxSummary?.inputVat ?? null, isAr)}
            />
            <p className="text-xs leading-6 text-muted-foreground">
              {isAr
                ? "ملخص تمهيدي لإقرار ZATCA ويعتمد على بيانات التحصيل والمصاريف المسجلة."
                : "Preparatory ZATCA summary based on recorded collections and expenses."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TaxLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
