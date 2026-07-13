import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Sparkles, BarChart3, PieChart as PieIcon } from "lucide-react";
import { getDashboardAnalytics } from "@/lib/dashboard-analytics.functions";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Counter,
  MotionAreaChart,
  MotionBarChart,
  MotionDonutChart,
  MotionLineChart,
  MotionPanel,
  StaggerSection,
} from "@/components/charts/motion-tremor";

export function AnalyticsPanels({ orgId, isAr }: { orgId: string | undefined; isAr: boolean }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["dashboard-analytics", orgId],
    queryFn: () => getDashboardAnalytics({ data: { org_id: orgId! } }),
    staleTime: 60_000,
  });
  const d = q.data;
  const loadingLabel = isAr ? "جارٍ التحميل..." : "Loading...";
  const emptyLabel = isAr ? "لا توجد بيانات بعد" : "No data yet";

  const [range, setRange] = useState<"3" | "6" | "12">("6");
  const [series, setSeries] = useState<"both" | "revenue" | "expenses">("both");
  const [maintView, setMaintView] = useState<"bar" | "pie">("bar");

  const n = Number(range);
  const monthly = useMemo(() => (d ? d.monthly.slice(-n) : []), [d, n]);
  const occupancy = useMemo(
    () => (d ? d.occupancy.slice(-Math.min(n, d.occupancy.length)) : []),
    [d, n],
  );
  const totals = useMemo(() => {
    const r = monthly.reduce((a, m) => a + m.revenue, 0);
    const e = monthly.reduce((a, m) => a + m.expenses, 0);
    return { r, e, net: r - e };
  }, [monthly]);
  const fmt = (v: number) => v.toLocaleString(isAr ? "ar-SA" : "en-US");
  const rangeLabel = isAr ? `آخر ${n} أشهر` : `Last ${n} months`;

  const revenueSeries = useMemo(() => {
    if (series === "revenue") return ["revenue"];
    if (series === "expenses") return ["expenses"];
    return ["revenue", "expenses"];
  }, [series]);
  const revenueLabels: Record<string, string> = isAr
    ? { revenue: "الإيرادات", expenses: "المصروفات" }
    : { revenue: "Revenue", expenses: "Expenses" };
  const monthlyDisplay = useMemo(
    () =>
      monthly.map((m) => ({
        month: m.month,
        [revenueLabels.revenue]: m.revenue,
        [revenueLabels.expenses]: m.expenses,
      })),
    [monthly, revenueLabels],
  );
  const activeCats = revenueSeries.map((k) => revenueLabels[k]);

  const RangeFilter = (
    <ToggleGroup
      type="single"
      value={range}
      onValueChange={(v) => v && setRange(v as typeof range)}
      className="h-7"
    >
      {(["3", "6", "12"] as const).map((r) => (
        <ToggleGroupItem key={r} value={r} className="h-7 px-2 text-[11px]">
          {isAr ? `${r} أ` : `${r}m`}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  return (
    <div className="mt-6 space-y-4">
      {/* Global filter bar with animated counters */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card/60 px-3 py-2 backdrop-blur-xl ring-1 ring-border/40">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{isAr ? "تحليلات" : "Analytics"}</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{rangeLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {d ? (
            <div className="hidden items-center gap-3 text-[11px] sm:flex">
              <span className="text-muted-foreground">
                {isAr ? "إيراد" : "Rev"}:{" "}
                <Counter
                  value={totals.r}
                  format={fmt}
                  className="font-semibold text-success dark:text-success"
                />
              </span>
              <span className="text-muted-foreground">
                {isAr ? "مصروف" : "Exp"}:{" "}
                <Counter
                  value={totals.e}
                  format={fmt}
                  className="font-semibold text-destructive dark:text-destructive"
                />
              </span>
              <span className="text-muted-foreground">
                {isAr ? "صافي" : "Net"}:{" "}
                <Counter
                  value={totals.net}
                  format={fmt}
                  className={`font-semibold ${totals.net >= 0 ? "text-success dark:text-success" : "text-destructive dark:text-destructive"}`}
                />
              </span>
            </div>
          ) : null}
          {RangeFilter}
        </div>
      </div>

      <StaggerSection className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <MotionPanel
          title={isAr ? "الإيرادات مقابل المصروفات" : "Revenue vs Expenses"}
          subtitle={rangeLabel}
          actions={
            <ToggleGroup
              type="single"
              value={series}
              onValueChange={(v) => v && setSeries(v as typeof series)}
              className="h-7"
            >
              <ToggleGroupItem value="both" className="h-7 px-2 text-[11px]">
                {isAr ? "الكل" : "Both"}
              </ToggleGroupItem>
              <ToggleGroupItem value="revenue" className="h-7 px-2 text-[11px]">
                {isAr ? "إيراد" : "Rev"}
              </ToggleGroupItem>
              <ToggleGroupItem value="expenses" className="h-7 px-2 text-[11px]">
                {isAr ? "مصروف" : "Exp"}
              </ToggleGroupItem>
            </ToggleGroup>
          }
          className="xl:col-span-2"
        >
          {!d ? (
            <div className="grid h-64 place-items-center text-xs text-muted-foreground">
              {loadingLabel}
            </div>
          ) : (
            <MotionAreaChart
              data={monthlyDisplay}
              index="month"
              categories={activeCats}
              colors={series === "expenses" ? ["rose"] : series === "revenue" ? ["emerald"] : ["emerald", "rose"]}
              valueFormatter={fmt}
              emptyLabel={emptyLabel}
            />
          )}
        </MotionPanel>

        <MotionPanel title={isAr ? "أنواع العقارات" : "Property Types"}>
          {!d ? (
            <div className="grid h-64 place-items-center text-xs text-muted-foreground">
              {loadingLabel}
            </div>
          ) : (
            <MotionDonutChart
              data={d.property_types}
              index="name"
              category="value"
              valueFormatter={fmt}
              emptyLabel={emptyLabel}
            />
          )}
        </MotionPanel>

        <MotionPanel
          title={isAr ? "الإشغال" : "Occupancy"}
          subtitle={isAr ? `آخر ${occupancy.length} أشهر` : `Last ${occupancy.length} months`}
        >
          {!d ? (
            <div className="grid h-64 place-items-center text-xs text-muted-foreground">
              {loadingLabel}
            </div>
          ) : (
            <MotionLineChart
              data={occupancy}
              index="month"
              categories={["occupancy"]}
              colors={["emerald"]}
              valueFormatter={(v) => `${v}%`}
              emptyLabel={emptyLabel}
            />
          )}
        </MotionPanel>

        <MotionPanel
          title={isAr ? "نسبة التحصيل" : "Collection Rate"}
          subtitle={isAr ? "الشهر الحالي" : "This month"}
        >
          {!d ? (
            <div className="grid h-64 place-items-center text-xs text-muted-foreground">
              {loadingLabel}
            </div>
          ) : (
            <MotionDonutChart
              data={d.collection.map((c) => ({
                name: c.name === "paid" ? (isAr ? "مدفوع" : "Paid") : isAr ? "متبقٍ" : "Outstanding",
                value: c.value,
              }))}
              index="name"
              category="value"
              colors={["emerald", "rose"]}
              valueFormatter={fmt}
              emptyLabel={emptyLabel}
            />
          )}
        </MotionPanel>

        <MotionPanel
          title={isAr ? "حالة الصيانة" : "Maintenance Status"}
          actions={
            <ToggleGroup
              type="single"
              value={maintView}
              onValueChange={(v) => v && setMaintView(v as typeof maintView)}
              className="h-7"
            >
              <ToggleGroupItem
                value="bar"
                className="h-7 w-8 p-0"
                aria-label={isAr ? "أعمدة" : "Bar"}
              >
                <BarChart3 className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="pie"
                className="h-7 w-8 p-0"
                aria-label={isAr ? "دائرة" : "Pie"}
              >
                <PieIcon className="size-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>
          }
        >
          {!d ? (
            <div className="grid h-64 place-items-center text-xs text-muted-foreground">
              {loadingLabel}
            </div>
          ) : maintView === "bar" ? (
            <MotionBarChart
              data={d.maintenance}
              index="name"
              categories={["value"]}
              colors={["violet"]}
              showLegend={false}
              emptyLabel={emptyLabel}
            />
          ) : (
            <MotionDonutChart
              data={d.maintenance}
              index="name"
              category="value"
              emptyLabel={emptyLabel}
            />
          )}
        </MotionPanel>

        <MotionPanel
          title={isAr ? "توقّعات الذكاء" : "AI Forecast"}
          subtitle={isAr ? "قريبًا" : "Coming soon"}
        >
          <div className="grid h-64 place-items-center text-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
              <div className="text-sm font-medium">
                {isAr ? "توقّعات مبنية على الذكاء الاصطناعي" : "AI-powered forecasting"}
              </div>
              <div className="max-w-xs text-xs">
                {isAr
                  ? "سيتم تفعيلها في المرحلة التالية مع ربطها بنموذج الذكاء."
                  : "Wires into the model in the next phase."}
              </div>
            </div>
          </div>
        </MotionPanel>
      </StaggerSection>
    </div>
  );
}
