import { t } from "@/lib/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BarChart3,
  RefreshCcw,
  Users,
  MousePointerClick,
  Wifi,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Download,
} from "lucide-react";
import {
  MotionAreaChart,
  MotionBarChart,
  MotionDonutChart,
} from "@/components/charts/motion-tremor";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getFilterAnalyticsOverview,
  getFilterAnalyticsHourly,
  getFilterAnalyticsTopFilters,
  getFilterAnalyticsTopPaths,
  getFilterAnalyticsHealth,
} from "@/lib/admin-filter-analytics.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/filter-analytics")({
  head: () => sectionHead({ section: "admin", entityAr: "تحليلات الفلاتر", entityEn: "Filter Analytics", path: "/admin/filter-analytics" }),
  component: FilterAnalyticsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <AdminPageHeader ar="تحليلات الفلاتر" en="Filter analytics" icon={BarChart3} />
        <p className="text-sm text-destructive">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

const RANGE_OPTIONS = [
  { value: "1", ar: "آخر ساعة", en: "Last hour" },
  { value: "24", ar: "آخر 24 ساعة", en: "Last 24h" },
  { value: "72", ar: "آخر 3 أيام", en: "Last 3 days" },
  { value: "168", ar: "آخر أسبوع", en: "Last week" },
];

// Quick-pick presets shown above the KPI/AreaChart/summary block.
const QUICK_RANGES = [
  { value: "1", ar: "آخر ساعة", en: "Last hour" },
  { value: "24", ar: "آخر يوم", en: "Last day" },
  { value: "168", ar: "آخر أسبوع", en: "Last week" },
];

const PIE_COLORS = ["hsl(var(--primary))", "#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#F43F5E"];

function FilterAnalyticsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [rangeValue, setRangeValue] = useState<string>("24");
  const hours = Number(rangeValue) || 24;

  const overviewFn = useServerFn(getFilterAnalyticsOverview);
  const hourlyFn = useServerFn(getFilterAnalyticsHourly);
  const filtersFn = useServerFn(getFilterAnalyticsTopFilters);
  const pathsFn = useServerFn(getFilterAnalyticsTopPaths);
  const healthFn = useServerFn(getFilterAnalyticsHealth);

  // Shared cache/polling settings:
  // - keepPreviousData: switching the range (or a background refetch) shows
  //   the old numbers while the new ones load, so charts don't flicker to empty.
  // - staleTime just under the refetch interval: manual re-mounts within
  //   the same window reuse the cache instead of re-hitting the RPC.
  // - gcTime 15m: keep results in memory while the admin flips between ranges.
  // - refetchIntervalInBackground: false → tab hidden = no polling cost.
  // - refetchOnWindowFocus: false → returning to the tab uses the cached
  //   value; the interval will refresh it on schedule.
  const HEAVY_INTERVAL = 60_000;
  const HEALTH_INTERVAL = 30_000;
  const commonPolling = {
    placeholderData: keepPreviousData,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchIntervalInBackground: false,
    retry: 1,
  } as const;

  const overviewQ = useQuery({
    queryKey: ["admin", "filter-analytics", "overview", hours],
    queryFn: () => overviewFn({ data: { hours } }),
    refetchInterval: HEAVY_INTERVAL,
    staleTime: HEAVY_INTERVAL - 5_000,
    ...commonPolling,
  });
  const hourlyQ = useQuery({
    queryKey: ["admin", "filter-analytics", "hourly", hours],
    queryFn: () => hourlyFn({ data: { hours } }),
    refetchInterval: HEAVY_INTERVAL,
    staleTime: HEAVY_INTERVAL - 5_000,
    ...commonPolling,
  });
  const filtersQ = useQuery({
    queryKey: ["admin", "filter-analytics", "top-filters", hours],
    queryFn: () => filtersFn({ data: { hours, limit: 15 } }),
    refetchInterval: HEAVY_INTERVAL,
    staleTime: HEAVY_INTERVAL - 5_000,
    ...commonPolling,
  });
  const pathsQ = useQuery({
    queryKey: ["admin", "filter-analytics", "top-paths", hours],
    queryFn: () => pathsFn({ data: { hours, limit: 10 } }),
    refetchInterval: HEAVY_INTERVAL,
    staleTime: HEAVY_INTERVAL - 5_000,
    ...commonPolling,
  });
  const healthQ = useQuery({
    queryKey: ["admin", "filter-analytics", "health"],
    queryFn: () => healthFn(),
    refetchInterval: HEALTH_INTERVAL,
    staleTime: HEALTH_INTERVAL - 5_000,
    ...commonPolling,
  });

  const nf = useMemo(() => new Intl.NumberFormat(isAr ? "ar-SA" : "en-US"), [isAr]);
  const overview = overviewQ.data;
  const hourly = hourlyQ.data ?? [];
  const top = filtersQ.data ?? [];
  const paths = pathsQ.data ?? [];
  const health = healthQ.data;

  const delta = overview
    ? overview.previousTotalEvents === 0
      ? overview.totalEvents > 0
        ? 1
        : 0
      : (overview.totalEvents - overview.previousTotalEvents) / overview.previousTotalEvents
    : 0;

  const sourcePie = useMemo(() => {
    if (!overview) return [];
    return Object.entries(overview.sourceBreakdown ?? {})
      .map(([name, value]) => ({ name, value: Number(value) }))
      .sort((a, b) => b.value - a.value);
  }, [overview]);

  const totalEventsInPaths = paths.reduce((s, p) => s + p.events, 0);

  // Health signals
  const lastEventAgeMs = health?.lastEventAt
    ? Date.now() - new Date(health.lastEventAt).getTime()
    : null;
  const stalled = lastEventAgeMs !== null && lastEventAgeMs > 15 * 60_000;
  const hourlyDelta =
    health && health.previousHourEvents > 0
      ? (health.lastHourEvents - health.previousHourEvents) / health.previousHourEvents
      : null;
  const sharpDrop = hourlyDelta !== null && hourlyDelta <= -0.5;
  const healthy = !stalled && !sharpDrop && health?.lastEventAt !== null;

  // Alerts: fire a toast when the health status transitions into an unhealthy
  // state, and re-arm when it recovers. Deduped so 30s polling doesn't spam.
  const lastAlertRef = useRef<"stalled" | "sharpDrop" | null>(null);
  useEffect(() => {
    if (!health) return;
    const current: "stalled" | "sharpDrop" | null = stalled
      ? "stalled"
      : sharpDrop
        ? "sharpDrop"
        : null;
    if (current === lastAlertRef.current) return;
    if (current === "stalled") {
      const mins = lastEventAgeMs !== null ? Math.round(lastEventAgeMs / 60_000) : null;
      toast.error(isAr ? "انقطاع في وصول أحداث الفلاتر" : "Filter analytics ingestion outage", {
        description: isAr
          ? `لم تصل أي أحداث منذ ${mins ?? "?"} دقيقة. تحقق من الشبكة أو RPCs.`
          : `No events received for ${mins ?? "?"} minute(s). Check network or RPC health.`,
        duration: 12_000,
      });
    } else if (current === "sharpDrop") {
      const pct = hourlyDelta !== null ? Math.round(hourlyDelta * 100) : 0;
      toast.warning(isAr ? "انخفاض حاد في معدل الأحداث" : "Sharp drop in event rate", {
        description: isAr
          ? `معدل الساعة الحالية انخفض ${Math.abs(pct)}% مقارنة بالساعة السابقة.`
          : `Current-hour rate dropped ${Math.abs(pct)}% vs the previous hour.`,
        duration: 10_000,
      });
    } else if (lastAlertRef.current !== null) {
      toast.success(isAr ? "عاد الاستيعاب إلى وضعه الطبيعي" : "Ingestion recovered", {
        duration: 5_000,
      });
    }
    lastAlertRef.current = current;
  }, [health, stalled, sharpDrop, lastEventAgeMs, hourlyDelta, isAr]);

  const refetchAll = () => {
    void overviewQ.refetch();
    void hourlyQ.refetch();
    void filtersQ.refetch();
    void pathsQ.refetch();
    void healthQ.refetch();
  };

  const downloadCsv = (filename: string, rows: (string | number)[][]) => {
    const esc = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportKpisCsv = () => {
    const rows: (string | number)[][] = [
      [isAr ? "المؤشر" : "Metric", isAr ? "القيمة" : "Value"],
      [isAr ? "النطاق (ساعات)" : "Range (hours)", hours],
      [isAr ? "إجمالي الأحداث" : "Total events", overview?.totalEvents ?? 0],
      [isAr ? "الفترة السابقة" : "Previous window", overview?.previousTotalEvents ?? 0],
      [isAr ? "التغير %" : "Delta %", Math.round(delta * 100)],
      [isAr ? "مستخدمون فريدون" : "Unique users", overview?.uniqueUsers ?? 0],
      [isAr ? "جلسات فريدة" : "Unique sessions", overview?.uniqueSessions ?? 0],
      [
        isAr ? "جلسات نشطة (آخر ساعة)" : "Active sessions (1h)",
        overview?.activeSessionsLastHour ?? 0,
      ],
      [isAr ? "أحداث الساعة الأخيرة" : "Last hour events", health?.lastHourEvents ?? 0],
      [isAr ? "أحداث الساعة السابقة" : "Previous hour events", health?.previousHourEvents ?? 0],
      [isAr ? "مستخدمون نشطون (24س)" : "Active users (24h)", health?.activeUsers24h ?? 0],
      [isAr ? "آخر حدث" : "Last event at", health?.lastEventAt ?? ""],
    ];
    downloadCsv(
      `filter-analytics-kpis-${hours}h-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
    );
  };

  const exportPathsCsv = () => {
    const rows: (string | number)[][] = [
      [isAr ? "المسار" : "Path", isAr ? "الأحداث" : "Events", "%"],
      ...paths.map((p) => [
        p.path,
        p.events,
        totalEventsInPaths > 0 ? Math.round((p.events / totalEventsInPaths) * 100) : 0,
      ]),
    ];
    downloadCsv(
      `filter-analytics-top-paths-${hours}h-${new Date().toISOString().slice(0, 10)}.csv`,
      rows,
    );
  };

  const hourFmt = (h: string) => {
    const d = new Date(h);
    return isAr
      ? d.toLocaleTimeString("ar-SA", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        })
      : d.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        });
  };

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        icon={BarChart3}
        ar="تحليلات الفلاتر"
        en="Filter analytics"
        descriptionAr="مراقبة إنتاجية لأحداث شريط الفلاتر عبر كل المستخدمين."
        descriptionEn="Production monitoring for ActiveFiltersBar events across all users."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={rangeValue} onValueChange={setRangeValue}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {isAr ? r.ar : r.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={refetchAll}
              disabled={overviewQ.isFetching}
            >
              <RefreshCcw className="me-1 size-4" />
              {isAr ? "تحديث" : "Refresh"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportKpisCsv}
              disabled={!overview}
              title={isAr ? "تصدير المؤشرات CSV" : "Export KPIs CSV"}
            >
              <Download className="me-1 size-4" />
              {isAr ? "تصدير المؤشرات" : "Export KPIs"}
            </Button>
          </div>
        }
      />

      {/* Health banner */}
      <Card className={healthy ? "border-success/40" : "border-warning/50"}>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          {healthy ? (
            <CheckCircle2 className="size-5 text-success" />
          ) : (
            <AlertTriangle className="size-5 text-warning" />
          )}
          <div className="flex-1 text-sm">
            <div className="font-semibold">
              {healthy
                ? isAr
                  ? "الاستيعاب سليم"
                  : "Ingestion healthy"
                : stalled
                  ? isAr
                    ? "لم تصل أحداث منذ فترة"
                    : "No events received recently"
                  : isAr
                    ? "انخفاض حاد في الأحداث"
                    : "Sharp drop in event rate"}
            </div>
            <div className="text-xs text-muted-foreground">
              {isAr ? "آخر حدث" : "Last event"}:{" "}
              {health?.lastEventAt
                ? new Date(health.lastEventAt).toLocaleString(isAr ? "ar-SA" : "en-US")
                : "—"}{" "}
              · {isAr ? "الساعة الأخيرة" : "Last hour"}: {nf.format(health?.lastHourEvents ?? 0)} ·{" "}
              {isAr ? "الساعة السابقة" : "Previous hour"}:{" "}
              {nf.format(health?.previousHourEvents ?? 0)} ·{" "}
              {isAr ? "مستخدمون نشطون (24س)" : "Active users (24h)"}:{" "}
              {nf.format(health?.activeUsers24h ?? 0)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick range switcher — scopes KPIs, AreaChart, and event summary. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-2">
        <div className="text-xs text-muted-foreground">
          {isAr ? "نطاق البطاقات والرسم البياني والملخص" : "Range for KPIs, chart and summary"}
        </div>
        <div className="inline-flex rounded-lg border border-border/50 bg-background p-0.5">
          {QUICK_RANGES.map((r) => {
            const active = rangeValue === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRangeValue(r.value)}
                aria-pressed={active}
                className={
                  "px-3 py-1 text-xs rounded-md transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60")
                }
              >
                {isAr ? r.ar : r.en}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<MousePointerClick className="size-5" />}
          label={isAr ? "إجمالي الأحداث" : "Total events"}
          value={nf.format(overview?.totalEvents ?? 0)}
          sub={
            overview
              ? `${delta >= 0 ? "▲" : "▼"} ${nf.format(Math.abs(Math.round(delta * 100)))}% ${isAr ? "مقارنة بالفترة السابقة" : "vs previous window"}`
              : isAr
                ? "…"
                : "…"
          }
          tone={delta >= 0 ? "emerald" : "amber"}
        />
        <Kpi
          icon={<Users className="size-5" />}
          label={isAr ? "مستخدمون فريدون" : "Unique users"}
          value={nf.format(overview?.uniqueUsers ?? 0)}
          tone="primary"
        />
        <Kpi
          icon={<Clock className="size-5" />}
          label={isAr ? "جلسات فريدة" : "Unique sessions"}
          value={nf.format(overview?.uniqueSessions ?? 0)}
          tone="sky"
        />
        <Kpi
          icon={<Wifi className="size-5" />}
          label={isAr ? "جلسات نشطة (آخر ساعة)" : "Active sessions (1h)"}
          value={nf.format(overview?.activeSessionsLastHour ?? 0)}
          tone={overview && overview.activeSessionsLastHour > 0 ? "emerald" : "amber"}
        />
      </div>

      {/* Hourly trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {isAr ? "الاتجاه الزمني للأحداث" : "Event volume trend"}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {hourly.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isAr ? "لا بيانات" : "No data"}</p>
          ) : (
            <MotionAreaChart
              data={hourly.map((h: Record<string, unknown>) => ({
                hour: hourFmt(h.hour as string),
                events: h.events,
              }))}
              index="hour"
              categories={["events"]}
              colors={["emerald"]}
              showLegend={false}
              className="h-64 mt-2"
            />

          )}
        </CardContent>
      </Card>

      {/* Top filters + source breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              {isAr ? "أكثر الفلاتر نشاطاً" : "Most active filters"}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isAr ? "لا بيانات" : "No data"}</p>
            ) : (
              <MotionBarChart
                data={top.map((r: Record<string, unknown>) => ({
                  filterKey: r.filterKey,
                  [isAr ? "تطبيق" : "Apply"]: r.applyCount,
                  [isAr ? "إزالة" : "Remove"]: r.removeCount,
                }))}
                index="filterKey"
                categories={[isAr ? "تطبيق" : "Apply", isAr ? "إزالة" : "Remove"]}
                colors={["emerald", "amber"]}
                layout="vertical"
                yAxisWidth={120}
                className="h-72 mt-2"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{isAr ? "مصدر الإزالة" : "Removal source"}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {sourcePie.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isAr ? "لا بيانات" : "No data"}</p>
            ) : (
              <MotionDonutChart
                data={sourcePie}
                index="name"
                category="value"
                className="h-72 mt-2"
              />

            )}
          </CardContent>
        </Card>
      </div>

      {/* Top paths */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm">{isAr ? "المسارات الأعلى نشاطاً" : "Top paths"}</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={exportPathsCsv}
            disabled={paths.length === 0}
          >
            <Download className="me-1 size-4" />
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          {paths.length === 0 ? (
            <p className="text-sm text-muted-foreground">{isAr ? "لا بيانات" : "No data"}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? "المسار" : "Path"}</TableHead>
                  <TableHead className="text-end">{isAr ? "الأحداث" : "Events"}</TableHead>
                  <TableHead className="text-end w-24">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paths.map((p) => (
                  <TableRow key={p.path}>
                    <TableCell className="font-mono text-xs">{p.path}</TableCell>
                    <TableCell className="text-end tabular-nums">{nf.format(p.events)}</TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {totalEventsInPaths > 0
                        ? `${Math.round((p.events / totalEventsInPaths) * 100)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Event breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {isAr ? "توزيع الأحداث حسب النوع" : "Event breakdown"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {overview && Object.keys(overview.eventBreakdown).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(overview.eventBreakdown)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
                  >
                    <span className="truncate text-xs font-mono">
                      {name.replace(/^active_filters\./, "")}
                    </span>
                    <span className="tabular-nums text-sm font-semibold">
                      {nf.format(Number(count))}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{isAr ? "لا بيانات" : "No data"}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "sky" | "emerald" | "amber";
}) {
  const toneCls =
    tone === "emerald"
      ? "bg-success/10 text-success"
      : tone === "amber"
        ? "bg-warning/10 text-warning"
        : tone === "sky"
          ? "bg-info/10 text-info"
          : "bg-primary/10 text-primary";
  return (
    <div className="surface-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs text-muted-foreground truncate">{label}</div>
          <div className="mt-1.5 text-2xl tabular-nums font-semibold">{value}</div>
          {sub && <div className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</div>}
        </div>
        <div
          className={"grid size-10 sm:size-11 shrink-0 place-items-center rounded-xl " + toneCls}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
