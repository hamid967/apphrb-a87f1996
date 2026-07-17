import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { getReports } from "@/lib/reports.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Download, BarChart3, Wrench, BookOpen } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  MotionBarChart,
  MotionDonutChart,
  MotionLineChart,
} from "@/components/charts/motion-tremor";

export const Route = createFileRoute("/_authenticated/dashboard/reports/")({
  component: ReportsPage,
});

const RANGES = [
  { key: "30", days: 30 },
  { key: "90", days: 90 },
  { key: "180", days: 180 },
  { key: "365", days: 365 },
];

const STATUS_COLORS: Record<string, string> = {
  offer: "hsl(var(--chart-1, 220 70% 50%))",
  counter: "hsl(var(--chart-2, 280 60% 55%))",
  accepted: "hsl(var(--chart-3, 160 60% 45%))",
  contract: "hsl(var(--chart-4, 40 90% 55%))",
  closed: "hsl(var(--chart-5, 140 70% 40%))",
  cancelled: "hsl(0 70% 55%)",
  pending: "hsl(45 90% 55%)",
  invoiced: "hsl(210 70% 55%)",
  paid: "hsl(140 70% 40%)",
};

function toCSV(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}

function download(name: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { t } = useTranslation();
  const [rangeKey, setRangeKey] = useState("90");
  const fetchReports = useServerFn(getReports);

  const orgsQuery = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listMyOrganizations(),
  });
  const orgId = orgsQuery.data?.[0]?.org.id;

  const range = useMemo(() => {
    const days = Number(rangeKey);
    const to = new Date();
    const from = new Date(Date.now() - days * 86400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [rangeKey]);

  const q = useQuery({
    queryKey: ["reports", orgId, range.from, range.to],
    queryFn: () => fetchReports({ data: { orgId: orgId!, from: range.from, to: range.to } }),
    enabled: !!orgId,
  });

  const stats = useMemo(() => {
    const deals = q.data?.deals ?? [];
    const commissions = q.data?.commissions ?? [];
    const pipeline = deals.reduce((s, d) => s + Number(d.agreed_amount ?? d.offer_amount ?? 0), 0);
    const won = deals.filter((d) => d.status === "closed");
    const wonValue = won.reduce((s, d) => s + Number(d.agreed_amount ?? d.offer_amount ?? 0), 0);
    const commissionsPaid = commissions
      .filter((c) => c.status === "paid")
      .reduce((s, c) => s + Number(c.amount ?? 0), 0);
    const commissionsPending = commissions
      .filter((c) => c.status !== "paid")
      .reduce((s, c) => s + Number(c.amount ?? 0), 0);

    const byStatus = deals.reduce<Record<string, number>>((acc, d) => {
      acc[d.status] = (acc[d.status] ?? 0) + 1;
      return acc;
    }, {});
    const statusData = Object.entries(byStatus).map(([name, value]) => ({ name, value }));

    const byMonth: Record<
      string,
      { month: string; deals: number; value: number; commissions: number }
    > = {};
    for (const d of deals) {
      const m = (d.offer_date ?? d.created_at).slice(0, 7);
      byMonth[m] ??= { month: m, deals: 0, value: 0, commissions: 0 };
      byMonth[m].deals += 1;
      byMonth[m].value += Number(d.agreed_amount ?? d.offer_amount ?? 0);
    }
    for (const c of commissions) {
      const m = (c.paid_at ?? c.created_at).slice(0, 7);
      byMonth[m] ??= { month: m, deals: 0, value: 0, commissions: 0 };
      byMonth[m].commissions += Number(c.amount ?? 0);
    }
    const monthly = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));

    return {
      pipeline,
      wonCount: won.length,
      wonValue,
      commissionsPaid,
      commissionsPending,
      statusData,
      monthly,
      deals,
      commissions,
    };
  }, [q.data]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("sidebar.reports")}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(range.from).toLocaleDateString()} —{" "}
              {new Date(range.to).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="default">
            <Link to="/dashboard/reports/builder">
              <Wrench className="size-4 me-2" /> {t("reportsPage.openBuilder")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard/reports/templates">
              <BookOpen className="size-4 me-2" /> {t("reportsPage.templates")}
            </Link>
          </Button>
          <Select value={rangeKey} onValueChange={setRangeKey}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {t("reportsPage.rangeDays", { days: r.days })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => download(`deals_${rangeKey}d.csv`, toCSV(stats.deals as any))}
            disabled={!stats.deals.length}
          >
            <Download className="size-4 me-2" /> {t("reportsPage.dealsCsv")}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              download(`commissions_${rangeKey}d.csv`, toCSV(stats.commissions as any))
            }
            disabled={!stats.commissions.length}
          >
            <Download className="size-4 me-2" /> {t("reportsPage.commissionsCsv")}
          </Button>
        </div>
      </div>

      {q.isLoading || !orgId ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label={t("reportsPage.statPipeline")} value={fmt(stats.pipeline)} />
            <StatCard
              label={t("reportsPage.statWonDeals")}
              value={`${stats.wonCount} · ${fmt(stats.wonValue)}`}
            />
            <StatCard
              label={t("reportsPage.statCommissionsPaid")}
              value={fmt(stats.commissionsPaid)}
            />
            <StatCard
              label={t("reportsPage.statCommissionsPending")}
              value={fmt(stats.commissionsPending)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("reportsPage.monthlyPerformance")}</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <MotionLineChart
                  data={stats.monthly.map((m: Record<string, unknown>) => ({
                    month: m.month,
                    [t("reportsPage.dealValue")]: m.value,
                    [t("reportsPage.commissions")]: m.commissions,
                  }))}
                  index="month"
                  categories={[t("reportsPage.dealValue"), t("reportsPage.commissions")]}
                  colors={["emerald", "blue"]}
                  className="h-72 mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("reportsPage.dealsByStatus")}</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <MotionDonutChart
                  data={stats.statusData}
                  index="name"
                  category="value"
                  className="h-72 mt-2"
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>{t("reportsPage.dealCountByMonth")}</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <MotionBarChart
                  data={stats.monthly}
                  index="month"
                  categories={["deals"]}
                  colors={["emerald"]}
                  showLegend={false}
                  className="h-64 mt-2"
                />
              </CardContent>

            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
