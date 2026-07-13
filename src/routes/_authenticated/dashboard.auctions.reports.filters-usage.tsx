import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  TrendingUp,
  MousePointerClick,
  Keyboard,
  Hand,
  Trash2,
  Plus,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getFilterUsageStats, type FilterUsageStats } from "@/lib/filter-analytics.functions";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

import { sectionHead } from "@/lib/section-og-head";
const searchSchema = z.object({
  days: fallback(z.coerce.number().int().min(1).max(365), 30).default(30),
});

function statsQueryOptions(
  fn: (input: { data: { days: number } }) => Promise<FilterUsageStats>,
  days: number,
) {
  return queryOptions({
    queryKey: ["filter-usage-stats", days],
    queryFn: () => fn({ data: { days } }),
    staleTime: 60_000,
  });
}

export const Route = createFileRoute("/_authenticated/dashboard/auctions/reports/filters-usage")({
  validateSearch: zodValidator(searchSchema),
  head: () => sectionHead({ section: "dashboard", entityAr: "استخدام فلاتر المزادات", entityEn: "Auctions Filters Usage", path: "/dashboard/auctions/reports/filters-usage" }),
  component: FiltersUsagePage,
  pendingComponent: () => (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  ),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          {i18n.t("auctions.common.retry")}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{i18n.t("auctions.common.notFound")}</div>,
});

const SOURCE_COLORS: Record<string, string> = {
  button: "hsl(var(--primary))",
  keyboard: "hsl(var(--chart-2, 210 60% 50%))",
  swipe: "hsl(var(--chart-3, 40 80% 55%))",
  unknown: "hsl(var(--muted-foreground))",
};

const SOURCE_KEYS = ["button", "keyboard", "swipe", "unknown"] as const;
const FILTER_KEYS = ["status", "bidder", "bidderId", "dateRange", "metric", "from", "to"] as const;

function percent(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

function FiltersUsagePage() {
  const { t } = useTranslation();
  const { days } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const fn = useServerFn(getFilterUsageStats);
  const { data: stats } = useSuspenseQuery(statsQueryOptions(fn, days));

  const sourceLabel = (k: string) =>
    (SOURCE_KEYS as readonly string[]).includes(k)
      ? t(`auctions.filtersUsage.sources.${k}` as const)
      : k;
  const filterLabel = (k: string) =>
    (FILTER_KEYS as readonly string[]).includes(k)
      ? t(`auctions.filtersUsage.filters.${k}` as const)
      : k;

  const sourceData = Object.entries(stats.sourceBreakdown).map(([k, v]) => ({
    key: k,
    name: sourceLabel(k),
    value: v,
    fill: SOURCE_COLORS[k] ?? SOURCE_COLORS.unknown,
  }));

  const topFiltersData = stats.topFilters.map((f) => ({
    name: filterLabel(f.filterKey),
    value: f.removeCount,
  }));

  const hasData = stats.totals.totalEvents > 0;

  return (
    <div className="p-4 sm:p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/auctions/reports">
            <ArrowLeft className="size-4 me-1" />
            {t("auctions.common.back")}
          </Link>
        </Button>
        <div className="flex-1 min-w-40">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            {t("auctions.filtersUsage.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("auctions.filtersUsage.subtitle")}
          </p>
        </div>
        <div className="w-40">
          <Select
            value={String(days)}
            onValueChange={(v) =>
              navigate({
                search: (prev: { days: number }) => ({ ...prev, days: Number(v) }),
                replace: true,
              })
            }
          >
            <SelectTrigger data-testid="days-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t("auctions.filtersUsage.last7")}</SelectItem>
              <SelectItem value="30">{t("auctions.filtersUsage.last30")}</SelectItem>
              <SelectItem value="90">{t("auctions.filtersUsage.last90")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {!hasData ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("auctions.filtersUsage.empty")}</CardTitle>
            <CardDescription>{t("auctions.filtersUsage.emptyHint")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<Trash2 className="size-4" />}
              label={t("auctions.filtersUsage.totalRemovals")}
              value={stats.totals.totalRemovals}
            />
            <MetricCard
              icon={<Plus className="size-4" />}
              label={t("auctions.filtersUsage.totalApplies")}
              value={stats.totals.totalApplies}
            />
            <MetricCard
              icon={<TrendingUp className="size-4" />}
              label={t("auctions.filtersUsage.clearAll")}
              value={stats.totals.clearAllCount}
            />
            <MetricCard
              icon={<MousePointerClick className="size-4" />}
              label={t("auctions.filtersUsage.hswipe")}
              value={stats.totals.scrollEvents}
              hint={
                stats.scrollStats.events
                  ? t("auctions.filtersUsage.scrollHint", {
                      avg: percent(stats.scrollStats.avgProgress),
                      end: percent(stats.scrollStats.reachedEndRate),
                    })
                  : undefined
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("auctions.filtersUsage.mostRemoved")}</CardTitle>
                <CardDescription>{t("auctions.filtersUsage.mostRemovedHint")}</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topFiltersData} layout="vertical" margin={{ left: 32 }}>
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={100} />
                    <RTooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("auctions.filtersUsage.removeMethod")}</CardTitle>
                <CardDescription>{t("auctions.filtersUsage.removeMethodHint")}</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {sourceData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("auctions.filtersUsage.noRemovals")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sourceData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {sourceData.map((s) => (
                          <Cell key={s.key} fill={s.fill} />
                        ))}
                      </Pie>
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <ul className="mt-2 space-y-1 text-xs">
                  {sourceData.map((s) => (
                    <li key={s.key} className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: s.fill }}
                        />
                        {s.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("auctions.filtersUsage.frictionDetails")}</CardTitle>
              <CardDescription>{t("auctions.filtersUsage.frictionHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <FrictionRow
                icon={<Hand className="size-4" />}
                label={t("auctions.filtersUsage.swipeBackRatio")}
                value={percent(stats.swipeFriction.abortRate)}
              />
              <FrictionRow
                icon={<Hand className="size-4" />}
                label={t("auctions.filtersUsage.swipeReveals")}
                value={stats.swipeFriction.reveals}
              />
              <FrictionRow
                icon={<Hand className="size-4 text-warning" />}
                label={t("auctions.filtersUsage.backBeforeConfirm")}
                value={stats.swipeFriction.aborts}
              />
              <FrictionRow
                icon={<Keyboard className="size-4" />}
                label={t("auctions.filtersUsage.kbdRemove")}
                value={stats.sourceBreakdown.keyboard ?? 0}
              />
            </CardContent>
          </Card>

          {stats.totals.totalApplies > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t("auctions.filtersUsage.mostApplied")}</CardTitle>
                  <CardDescription>{t("auctions.filtersUsage.mostAppliedHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y text-sm">
                    {stats.topFiltersApplied.map((f) => (
                      <li key={f.filterKey} className="flex items-center justify-between py-2">
                        <span>{filterLabel(f.filterKey)}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          <span className="text-foreground font-medium">{f.addCount}</span> ·{" "}
                          <span className="text-foreground font-medium">{f.changeCount}</span> {t("auctions.filtersUsage.change")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("auctions.filtersUsage.beforeApply")}</CardTitle>
                  <CardDescription>{t("auctions.filtersUsage.beforeApplyHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y text-sm">
                    {Object.entries(stats.applyPrecededBy)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <li key={k} className="flex items-center justify-between py-2">
                          <code className="text-xs text-muted-foreground">{k}</code>
                          <span className="tabular-nums font-medium">{v}</span>
                        </li>
                      ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {stats.perPath.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("auctions.filtersUsage.byPage")}</CardTitle>
                <CardDescription>{t("auctions.filtersUsage.byPageHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {stats.perPath.map((p) => (
                    <li key={p.path} className="flex items-center justify-between py-2">
                      <code className="text-xs text-muted-foreground">{p.path}</code>
                      <span className="tabular-nums font-medium">{p.events}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <Card className={tone === "warn" ? "border-warning/60" : undefined}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function FrictionRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/20 p-3">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="tabular-nums font-semibold">{value}</span>
    </div>
  );
}
