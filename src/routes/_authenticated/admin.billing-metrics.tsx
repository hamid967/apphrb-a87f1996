import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, Suspense } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
  Legend,
} from "recharts";
import {
  Download,
  TrendingUp,
  TrendingDown,
  Users,
  Repeat2,
  Percent,
  Wallet,
  Loader2,
  LineChart,
} from "lucide-react";
import { AdminPageHeader, AdminPageLoading } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getBillingMetrics,
  listAdminPackages,
  getChurnedOrgs,
  getTrialOrgs,
  type BillingMetrics,
  type BillingSeriesRow,
  type AdminPackage,
  type ChurnedOrgRow,
  type TrialOrgRow,
} from "@/lib/admin-billing-metrics.functions";

import { sectionHead } from "@/lib/section-og-head";
const metricsQuery = (months: number, packageId: string | null) =>
  queryOptions({
    queryKey: ["admin", "billing-metrics", months, packageId ?? "all"],
    queryFn: () => getBillingMetrics({ data: { months, packageId } }),
    staleTime: 60_000,
    refetchInterval: 15 * 60_000,
    refetchIntervalInBackground: false,
  });

const packagesQuery = queryOptions({
  queryKey: ["admin", "packages", "list"],
  queryFn: () => listAdminPackages(),
  staleTime: 5 * 60_000,
});

const churnedQuery = (months: number, packageId: string | null) =>
  queryOptions({
    queryKey: ["admin", "billing-churned", months, packageId ?? "all"],
    queryFn: () => getChurnedOrgs({ data: { months, packageId } }),
    staleTime: 60_000,
    refetchInterval: 15 * 60_000,
  });

const trialQuery = (packageId: string | null) =>
  queryOptions({
    queryKey: ["admin", "billing-trial", packageId ?? "all"],
    queryFn: () => getTrialOrgs({ data: { months: 12, packageId } }),
    staleTime: 60_000,
    refetchInterval: 15 * 60_000,
  });

export const Route = createFileRoute("/_authenticated/admin/billing-metrics")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(metricsQuery(12, null));
    context.queryClient.ensureQueryData(packagesQuery);
  },
  head: () => sectionHead({ section: "admin", entityAr: "مؤشرات الفوترة", entityEn: "Billing Metrics", path: "/admin/billing-metrics" }),
  component: BillingMetricsPage,
  errorComponent: ({ error }) => (
    <div className="p-4 sm:p-6 space-y-4">
      <AdminPageHeader ar="مؤشرات الفوترة" en="Billing KPIs" icon={LineChart} />
      <div className="text-sm text-destructive" role="alert">
        {error.message}
      </div>
    </div>
  ),
  pendingComponent: () => (
    <AdminPageLoading
      ar="مؤشرات الفوترة"
      en="Billing KPIs"
      icon={LineChart}
      descriptionAr="MRR والتشرن ومقاييس الاشتراكات الرئيسية."
      descriptionEn="MRR, churn and core subscription metrics."
    />
  ),
});

function BillingMetricsPage() {
  const [months, setMonths] = useState(12);
  const [packageId, setPackageId] = useState<string | null>(null);
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <Loader2 className="inline size-4 animate-spin" />
        </div>
      }
    >
      <MetricsContent
        months={months}
        onMonthsChange={setMonths}
        packageId={packageId}
        onPackageChange={setPackageId}
      />
    </Suspense>
  );
}

function MetricsContent({
  months,
  onMonthsChange,
  packageId,
  onPackageChange,
}: {
  months: number;
  onMonthsChange: (m: number) => void;
  packageId: string | null;
  onPackageChange: (id: string | null) => void;
}) {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || "ar").startsWith("ar");
  const { data } = useSuspenseQuery(metricsQuery(months, packageId));
  const { data: packages } = useSuspenseQuery(packagesQuery);
  const queryClient = useQueryClient();
  const m = data as BillingMetrics;
  const activePackage = (packages as AdminPackage[]).find((p) => p.id === packageId) ?? null;

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", {
      style: "currency",
      currency: m.currency || "SAR",
      maximumFractionDigits: 0,
    }).format(n || 0);
  const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);
  const fmtInt = (n: number) => new Intl.NumberFormat(isAr ? "ar-SA" : "en-US").format(n || 0);

  const seriesLabelled = useMemo(
    () => (m.series || []).map((r) => ({ ...r, label: r.month_start.slice(0, 7) })),
    [m.series],
  );

  const [exporting, setExporting] = useState(false);
  const downloadCsv = async () => {
    setExporting(true);
    try {
      const packageLabel = activePackage ? activePackage.name : isAr ? "كل الباقات" : "ALL";
      const esc = (v: unknown) => JSON.stringify(v ?? "");
      const toLine = (arr: unknown[]) => arr.map(esc).join(",");

      // Fetch drill-down data on demand so CSV is complete regardless of open tab
      const [churned, trial] = await Promise.all([
        queryClient.ensureQueryData(churnedQuery(months, packageId)) as Promise<ChurnedOrgRow[]>,
        queryClient.ensureQueryData(trialQuery(packageId)) as Promise<TrialOrgRow[]>,
      ]);

      const lines: string[] = [];

      // ── Summary ──
      lines.push(toLine(["#", "billing_metrics_summary"]));
      lines.push(toLine(["generated_at", m.generated_at]));
      lines.push(toLine(["currency", m.currency]));
      lines.push(toLine(["package", packageLabel]));
      lines.push(toLine(["package_id", packageId ?? ""]));
      lines.push(toLine(["window_months", months]));
      lines.push(toLine(["mrr_current", m.mrr_current]));
      lines.push(toLine(["mrr_previous", m.mrr_previous]));
      lines.push(toLine(["mrr_growth_pct", m.mrr_growth_pct ?? ""]));
      lines.push(toLine(["paying_orgs_current", m.paying_orgs_current]));
      lines.push(toLine(["new_paying_orgs_current", m.new_paying_orgs_current]));
      lines.push(toLine(["churned_orgs_current", m.churned_orgs_current]));
      lines.push(toLine(["churn_rate_pct", m.churn_rate_pct]));
      lines.push(toLine(["arpu", m.arpu]));
      lines.push(toLine(["ltv", m.ltv ?? ""]));
      lines.push(toLine(["trial_cohort", m.trial_cohort]));
      lines.push(toLine(["trial_converted", m.trial_converted]));
      lines.push(toLine(["trial_conversion_pct", m.trial_conversion_pct]));
      lines.push("");

      // ── Series: monthly breakdown ──
      const seriesHeaders = [
        "section",
        "package",
        "month_start",
        "revenue",
        "paying_orgs",
        "new_paying_orgs",
        "churned_orgs",
      ];
      lines.push(toLine(seriesHeaders));
      for (const r of (m.series || []) as BillingSeriesRow[]) {
        lines.push(
          toLine([
            "monthly_series",
            packageLabel,
            r.month_start,
            r.revenue,
            r.paying_orgs,
            r.new_paying_orgs,
            r.churned_orgs,
          ]),
        );
      }
      lines.push("");

      // ── Churned orgs per month ──
      const churnHeaders = [
        "section",
        "package",
        "churn_month",
        "org_id",
        "org_name",
        "last_payment_month",
        "last_amount",
        "tenure_months",
      ];
      lines.push(toLine(churnHeaders));
      for (const r of churned) {
        lines.push(
          toLine([
            "churned_orgs",
            packageLabel,
            r.month_start.slice(0, 7),
            r.org_id,
            r.org_name,
            r.last_payment_at.slice(0, 7),
            r.last_amount,
            r.tenure_months,
          ]),
        );
      }
      lines.push("");

      // ── Trial → Paid cohort ──
      const trialHeaders = [
        "section",
        "package",
        "cohort_month",
        "org_id",
        "org_name",
        "created_at",
        "status",
        "first_payment_month",
        "first_amount",
      ];
      lines.push(toLine(trialHeaders));
      for (const r of trial) {
        lines.push(
          toLine([
            "trial_to_paid",
            packageLabel,
            r.cohort_month.slice(0, 7),
            r.org_id,
            r.org_name,
            r.created_at.slice(0, 10),
            r.converted ? "converted" : "pending",
            r.first_payment_at ? r.first_payment_at.slice(0, 7) : "",
            r.first_amount ?? "",
          ]),
        );
      }

      const csv = lines.join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const pkgSlug = activePackage ? `-${activePackage.name.replace(/[^a-zA-Z0-9]+/g, "_")}` : "";
      a.download = `billing-metrics${pkgSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const growth = m.mrr_growth_pct ?? 0;
  const growthPositive = growth >= 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isAr ? "مؤشرات الفوترة والاشتراكات" : "Billing & Subscription Metrics"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr
              ? "MRR — Churn — LTV — تحويل التجربة إلى مدفوع"
              : "MRR — Churn — LTV — Trial → Paid conversion"}
            {activePackage && (
              <span className="ms-2 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {isAr ? "الباقة: " : "Plan: "}
                {activePackage.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={packageId ?? "__all"}
            onValueChange={(v) => onPackageChange(v === "__all" ? null : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{isAr ? "كل الباقات" : "All plans"}</SelectItem>
              {(packages as AdminPackage[]).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {!p.active && (isAr ? " (متوقفة)" : " (inactive)")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(months)} onValueChange={(v) => onMonthsChange(Number(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[6, 12, 18, 24].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {isAr ? `آخر ${n} شهرًا` : `Last ${n} months`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={downloadCsv} disabled={exporting} className="gap-2">
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {isAr ? "تصدير CSV" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi
          icon={<Wallet className="size-4" />}
          label={isAr ? "الإيرادات الشهرية (MRR)" : "MRR (this month)"}
          value={fmtMoney(m.mrr_current)}
          sub={
            <span className={growthPositive ? "text-success" : "text-destructive"}>
              {growthPositive ? (
                <TrendingUp className="me-1 inline size-3.5" />
              ) : (
                <TrendingDown className="me-1 inline size-3.5" />
              )}
              {fmtPct(m.mrr_growth_pct)} {isAr ? "مقارنة بالشهر السابق" : "vs previous"}
            </span>
          }
        />
        <Kpi
          icon={<Users className="size-4" />}
          label={isAr ? "منشآت مدفوعة نشطة" : "Paying orgs"}
          value={fmtInt(m.paying_orgs_current)}
          sub={
            <span>
              +{fmtInt(m.new_paying_orgs_current)} {isAr ? "جديدة هذا الشهر" : "new this month"}
            </span>
          }
        />
        <Kpi
          icon={<Percent className="size-4" />}
          label={isAr ? "معدل التسرّب (Churn)" : "Churn rate"}
          value={fmtPct(m.churn_rate_pct)}
          sub={
            <span>
              {fmtInt(m.churned_orgs_current)} {isAr ? "منشآت تسرّبت" : "orgs churned"}
            </span>
          }
        />
        <Kpi
          icon={<Repeat2 className="size-4" />}
          label={isAr ? "قيمة العميل مدى الحياة (LTV)" : "LTV"}
          value={m.ltv == null ? "—" : fmtMoney(m.ltv)}
          sub={
            <span>
              {isAr ? "متوسط الإيراد لكل منشأة: " : "ARPU: "}
              {fmtMoney(m.arpu)}
            </span>
          }
        />
        <Kpi
          icon={<Users className="size-4" />}
          label={isAr ? "تحويل التجربة إلى مدفوع" : "Trial → Paid"}
          value={fmtPct(m.trial_conversion_pct)}
          sub={
            <span>
              {fmtInt(m.trial_converted)} / {fmtInt(m.trial_cohort)} {isAr ? "منشأة" : "orgs"}
            </span>
          }
        />
        <Kpi
          icon={<Users className="size-4" />}
          label={isAr ? "إجمالي المنشآت" : "Total orgs"}
          value={fmtInt(m.total_orgs)}
          sub={
            <span>
              {fmtInt(m.paying_orgs_lifetime)} {isAr ? "دفعت مرة على الأقل" : "paid at least once"}
            </span>
          }
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{isAr ? "نظرة عامة" : "Overview"}</TabsTrigger>
          <TabsTrigger value="churn">
            {isAr ? "الشركات المُتسرِّبة" : "Churned companies"}
          </TabsTrigger>
          <TabsTrigger value="trial">{isAr ? "التجربة → مدفوع" : "Trial → Paid"}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Revenue chart */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {isAr ? "الإيراد الشهري" : "Monthly revenue"}
              </h2>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={seriesLabelled} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", {
                        notation: "compact",
                      }).format(Number(v))
                    }
                  />
                  <Tooltip
                    formatter={(v: number) => [fmtMoney(v), isAr ? "الإيراد" : "Revenue"]}
                    labelFormatter={(l) => String(l)}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    fill="url(#gRev)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* New vs churned */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {isAr ? "المنشآت الجديدة مقابل التسرّب" : "New vs churned orgs"}
              </h2>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seriesLabelled} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={40}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="new_paying_orgs"
                    name={isAr ? "جديدة" : "New"}
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="churned_orgs"
                    name={isAr ? "تسرّبت" : "Churned"}
                    fill="hsl(var(--destructive))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Series table */}
          <Card className="overflow-hidden">
            <div className="border-b p-4">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {isAr ? "التفاصيل الشهرية" : "Monthly breakdown"}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{isAr ? "الشهر" : "Month"}</th>
                    <th className="p-3 text-end font-medium">{isAr ? "الإيراد" : "Revenue"}</th>
                    <th className="p-3 text-end font-medium">
                      {isAr ? "منشآت مدفوعة" : "Paying orgs"}
                    </th>
                    <th className="p-3 text-end font-medium">{isAr ? "جديدة" : "New"}</th>
                    <th className="p-3 text-end font-medium">{isAr ? "تسرّبت" : "Churned"}</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesLabelled.map((r) => (
                    <tr key={r.month_start} className="border-t">
                      <td className="p-3 font-medium">{r.label}</td>
                      <td className="p-3 text-end tabular-nums">{fmtMoney(Number(r.revenue))}</td>
                      <td className="p-3 text-end tabular-nums">{fmtInt(r.paying_orgs)}</td>
                      <td className="p-3 text-end tabular-nums text-success">
                        {fmtInt(r.new_paying_orgs)}
                      </td>
                      <td className="p-3 text-end tabular-nums text-destructive">
                        {fmtInt(r.churned_orgs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="churn">
          <Suspense fallback={<CardLoader />}>
            <ChurnDrill
              months={months}
              packageId={packageId}
              isAr={isAr}
              fmtMoney={fmtMoney}
              fmtInt={fmtInt}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="trial">
          <Suspense fallback={<CardLoader />}>
            <TrialDrill packageId={packageId} isAr={isAr} fmtMoney={fmtMoney} />
          </Suspense>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        {isAr
          ? `الإيراد يستند إلى مدفوعات التحويل البنكي الموافَق عليها فقط. ` +
            (m.data_refreshed_at
              ? `آخر تحديث للبيانات المخزّنة: ${new Date(m.data_refreshed_at).toLocaleString("ar-SA")} — يُحدَّث تلقائيًا كل ${m.refresh_interval_minutes} دقيقة. `
              : "") +
            `تم توليد التقرير: ${new Date(m.generated_at).toLocaleString("ar-SA")}.`
          : `Revenue is based on approved bank-transfer payments only. ` +
            (m.data_refreshed_at
              ? `Cached data last refreshed: ${new Date(m.data_refreshed_at).toLocaleString("en-US")} — auto-refreshes every ${m.refresh_interval_minutes} minutes. `
              : "") +
            `Report generated: ${new Date(m.generated_at).toLocaleString("en-US")}.`}
      </p>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function CardLoader() {
  return (
    <Card className="p-8 text-sm text-muted-foreground">
      <Loader2 className="me-2 inline size-4 animate-spin" /> …
    </Card>
  );
}

type SortDir = "asc" | "desc";

function ChurnDrill({
  months,
  packageId,
  isAr,
  fmtMoney,
  fmtInt,
}: {
  months: number;
  packageId: string | null;
  isAr: boolean;
  fmtMoney: (n: number) => string;
  fmtInt: (n: number) => string;
}) {
  const { data } = useSuspenseQuery(churnedQuery(months, packageId));
  const rows = data as ChurnedOrgRow[];
  const [monthFilter, setMonthFilter] = useState<string>("__all");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const monthOptions = useMemo(() => {
    const s = new Set(rows.map((r) => r.month_start));
    return Array.from(s).sort((a, b) => (a < b ? 1 : -1));
  }, [rows]);

  const filtered = useMemo(() => {
    const list = monthFilter === "__all" ? rows : rows.filter((r) => r.month_start === monthFilter);
    return [...list].sort((a, b) => {
      const cmp = a.month_start.localeCompare(b.month_start);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, monthFilter, sortDir]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-sm font-semibold">
            {isAr ? "الشركات التي تسرّبت" : "Churned companies"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAr
              ? "منشآت دفعت الشهر السابق ثم توقّفت في الشهر الحالي."
              : "Organizations that paid the previous month but stopped in the target month."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{isAr ? "كل الأشهر" : "All months"}</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m.slice(0, 7)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">{isAr ? "الأحدث أولًا" : "Newest first"}</SelectItem>
              <SelectItem value="asc">{isAr ? "الأقدم أولًا" : "Oldest first"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-3 text-start font-medium">{isAr ? "شهر التسرّب" : "Churn month"}</th>
              <th className="p-3 text-start font-medium">{isAr ? "الشركة" : "Company"}</th>
              <th className="p-3 text-end font-medium">
                {isAr ? "آخر شهر دفع" : "Last paid month"}
              </th>
              <th className="p-3 text-end font-medium">{isAr ? "آخر مبلغ" : "Last amount"}</th>
              <th className="p-3 text-end font-medium">
                {isAr ? "مدة الاشتراك (أشهر)" : "Tenure (months)"}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {isAr ? "لا توجد شركات ضمن هذا الفلتر." : "No companies match this filter."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={`${r.month_start}-${r.org_id}`} className="border-t">
                <td className="p-3 font-medium tabular-nums">{r.month_start.slice(0, 7)}</td>
                <td className="p-3">{r.org_name}</td>
                <td className="p-3 text-end tabular-nums">{r.last_payment_at.slice(0, 7)}</td>
                <td className="p-3 text-end tabular-nums">{fmtMoney(Number(r.last_amount))}</td>
                <td className="p-3 text-end tabular-nums">{fmtInt(r.tenure_months)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TrialDrill({
  packageId,
  isAr,
  fmtMoney,
}: {
  packageId: string | null;
  isAr: boolean;
  fmtMoney: (n: number) => string;
}) {
  const { data } = useSuspenseQuery(trialQuery(packageId));
  const rows = data as TrialOrgRow[];
  const [monthFilter, setMonthFilter] = useState<string>("__all");
  const [statusFilter, setStatusFilter] = useState<"all" | "converted" | "pending">("all");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const monthOptions = useMemo(() => {
    const s = new Set(rows.map((r) => r.cohort_month));
    return Array.from(s).sort((a, b) => (a < b ? 1 : -1));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = monthFilter === "__all" ? rows : rows.filter((r) => r.cohort_month === monthFilter);
    if (statusFilter === "converted") list = list.filter((r) => r.converted);
    if (statusFilter === "pending") list = list.filter((r) => !r.converted);
    return [...list].sort((a, b) => {
      const cmp = a.cohort_month.localeCompare(b.cohort_month);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, monthFilter, statusFilter, sortDir]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-sm font-semibold">
            {isAr ? "قائمة تحويل التجربة إلى مدفوع" : "Trial → Paid list"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAr
              ? "منشآت أُنشئت خلال آخر 14–90 يومًا مع حالة التحويل إلى مدفوع."
              : "Organizations created 14–90 days ago with conversion status."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{isAr ? "كل أشهر الفوج" : "All cohorts"}</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m.slice(0, 7)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem>
              <SelectItem value="converted">{isAr ? "حوَّلت" : "Converted"}</SelectItem>
              <SelectItem value="pending">{isAr ? "لم تحوِّل" : "Not converted"}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">{isAr ? "الأحدث أولًا" : "Newest first"}</SelectItem>
              <SelectItem value="asc">{isAr ? "الأقدم أولًا" : "Oldest first"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="p-3 text-start font-medium">
                {isAr ? "شهر التسجيل" : "Cohort month"}
              </th>
              <th className="p-3 text-start font-medium">{isAr ? "الشركة" : "Company"}</th>
              <th className="p-3 text-end font-medium">{isAr ? "تاريخ الإنشاء" : "Created"}</th>
              <th className="p-3 text-center font-medium">{isAr ? "الحالة" : "Status"}</th>
              <th className="p-3 text-end font-medium">
                {isAr ? "أول شهر دفع" : "First paid month"}
              </th>
              <th className="p-3 text-end font-medium">{isAr ? "أول مبلغ" : "First amount"}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {isAr ? "لا توجد شركات ضمن هذا الفلتر." : "No companies match this filter."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.org_id} className="border-t">
                <td className="p-3 font-medium tabular-nums">{r.cohort_month.slice(0, 7)}</td>
                <td className="p-3">{r.org_name}</td>
                <td className="p-3 text-end tabular-nums">{r.created_at.slice(0, 10)}</td>
                <td className="p-3 text-center">
                  {r.converted ? (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success dark:text-success">
                      {isAr ? "حوَّلت" : "Converted"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning dark:text-warning">
                      {isAr ? "قيد التجربة" : "Pending"}
                    </span>
                  )}
                </td>
                <td className="p-3 text-end tabular-nums">
                  {r.first_payment_at ? r.first_payment_at.slice(0, 7) : "—"}
                </td>
                <td className="p-3 text-end tabular-nums">
                  {r.first_amount != null ? fmtMoney(Number(r.first_amount)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
