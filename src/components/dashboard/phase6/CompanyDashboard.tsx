import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Coins, Gauge, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompanyDashboard } from "@/lib/dashboard-phase6.functions";
import { EmptyDashboardState } from "./EmptyDashboardState";
import { KpiCard } from "./KpiCard";

function money(value: number | null, isAr: boolean) {
  if (value === null || value === undefined) return isAr ? "مخفي" : "Hidden";
  return `${Number(value || 0).toLocaleString(isAr ? "ar" : "en", {
    maximumFractionDigits: 0,
  })} SAR`;
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
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">…</div>;
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

  const maintenanceOnly = data.permissions?.maintenanceOnly;
  const canSeeAmounts = data.permissions?.canSeeAmounts;

  if (maintenanceOnly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="size-4 text-primary" />
            {isAr ? "الصيانة" : "Maintenance"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            {isAr ? "طلبات مفتوحة" : "Open requests"}: {data.maintenance.openCount}
          </div>
          <div>
            {isAr ? "عاجلة بلا مورد" : "Urgent unassigned"}: {data.maintenance.urgentUnassigned}
          </div>
          <Button asChild>
            <Link to="/dashboard/maintenance">{isAr ? "فتح الصيانة" : "Open maintenance"}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={isAr ? "المحصّل في الفترة" : "Collected"}
          value={money(data.kpis.collected, isAr)}
          subtitle={
            canSeeAmounts && data.kpis.expected
              ? `${isAr ? "من المتوقع" : "of expected"} ${money(data.kpis.expected, isAr)}`
              : undefined
          }
          icon={Coins}
          to="/dashboard/payments"
          tone="success"
        />
        <KpiCard
          title={isAr ? "صافي المحفظة" : "Portfolio net"}
          value={money(data.kpis.portfolioNet, isAr)}
          icon={Coins}
          to="/dashboard/reports"
          tone={
            data.kpis.portfolioNet === null || data.kpis.portfolioNet >= 0 ? "success" : "danger"
          }
        />
        <KpiCard
          title={isAr ? "نسبة الإشغال" : "Occupancy"}
          value={`${data.kpis.occupancyRate}%`}
          subtitle={`${data.kpis.vacantUnits} ${isAr ? "شاغرة" : "vacant"}`}
          icon={Gauge}
          to="/dashboard/units"
        />
        <KpiCard
          title={isAr ? "المتأخرات" : "Overdue"}
          value={money(data.kpis.overdueAmount, isAr)}
          subtitle={
            data.kpis.overdueRatio !== null
              ? `${data.kpis.overdueRatio}% ${isAr ? "من المستحق" : "of due"}`
              : undefined
          }
          icon={AlertTriangle}
          to="/dashboard/payments"
          tone={
            data.kpis.overdueAmount && data.kpis.overdueAmount > 0 ? "danger" : "success"
          }
        />
      </div>

      {canSeeAmounts && data.monthly.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAr ? "الإيرادات مقابل المصاريف (12 شهراً)" : "Revenue vs expenses (12 months)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 min-w-[520px] overflow-x-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthly}>
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="revenue" stroke="#00D9C0" fill="#99F6E4" />
                    <Area type="monotone" dataKey="expenses" stroke="#C9A961" fill="#FDE68A" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isAr ? "أفضل العقارات (صافي)" : "Top properties (net)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topProperties}>
                    <XAxis dataKey="property" hide />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="net" fill="#0A1A2F" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? "بنود تحتاج إجراء" : "Action items"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.actionItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {isAr ? "لا توجد بنود" : "Nothing to action"}
            </div>
          ) : (
            data.actionItems.map((item) => (
              <Link
                key={item.id}
                to={item.to as string}
                className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/50"
              >
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.meta}</div>
                </div>
                {item.amount !== null && (
                  <div className="tabular-nums text-sm">{money(item.amount, isAr)}</div>
                )}
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
