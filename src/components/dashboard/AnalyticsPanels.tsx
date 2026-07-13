import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDashboardAnalytics } from "@/lib/dashboard-analytics.functions";
import { Sparkles, BarChart3, PieChart as PieIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const PALETTE = [
  "hsl(var(--primary))",
  "#2563EB",
  "#10B981",
  "#F59E0B",
  "#F43F5E",
  "#8B5CF6",
  "#0EA5E9",
  "#EAB308",
  "#EF4444",
  "#22C55E",
];

function Panel({
  title,
  subtitle,
  children,
  actions,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl border bg-card/70 p-4 backdrop-blur-xl ring-1 ring-border/40 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="h-64 w-full">{children}</div>
    </motion.div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center text-xs text-muted-foreground">{label}</div>
  );
}

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

  const tooltipStyle = {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  } as const;

  // Interactive filters — all client-side over the fetched 12-month payload.
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
      {/* Global filter bar */}
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
                <span className="font-semibold tabular-nums text-success dark:text-success">
                  {fmt(totals.r)}
                </span>
              </span>
              <span className="text-muted-foreground">
                {isAr ? "مصروف" : "Exp"}:{" "}
                <span className="font-semibold tabular-nums text-destructive dark:text-destructive">
                  {fmt(totals.e)}
                </span>
              </span>
              <span className="text-muted-foreground">
                {isAr ? "صافي" : "Net"}:{" "}
                <span
                  className={`font-semibold tabular-nums ${totals.net >= 0 ? "text-success dark:text-success" : "text-destructive dark:text-destructive"}`}
                >
                  {fmt(totals.net)}
                </span>
              </span>
            </div>
          ) : null}
          {RangeFilter}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel
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
            <EmptyState label={loadingLabel} />
          ) : (
            <ResponsiveContainer>
              <AreaChart data={monthly} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => v.toLocaleString()}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series !== "expenses" && (
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name={isAr ? "الإيرادات" : "Revenue"}
                    stroke="hsl(var(--primary))"
                    fill="url(#revG)"
                    strokeWidth={2}
                    animationDuration={600}
                  />
                )}
                {series !== "revenue" && (
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name={isAr ? "المصروفات" : "Expenses"}
                    stroke="#F43F5E"
                    fill="url(#expG)"
                    strokeWidth={2}
                    animationDuration={600}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title={isAr ? "أنواع العقارات" : "Property Types"}>
          {!d ? (
            <EmptyState label={loadingLabel} />
          ) : d.property_types.length === 0 ? (
            <EmptyState label={emptyLabel} />
          ) : (
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={d.property_types}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {d.property_types.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel
          title={isAr ? "الإشغال" : "Occupancy"}
          subtitle={isAr ? `آخر ${occupancy.length} أشهر` : `Last ${occupancy.length} months`}
        >
          {!d ? (
            <EmptyState label={loadingLabel} />
          ) : (
            <ResponsiveContainer>
              <LineChart data={occupancy} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="occG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                <Line
                  type="monotone"
                  dataKey="occupancy"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  animationDuration={600}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel
          title={isAr ? "نسبة التحصيل" : "Collection Rate"}
          subtitle={isAr ? "الشهر الحالي" : "This month"}
        >
          {!d ? (
            <EmptyState label={loadingLabel} />
          ) : d.collection.every((c) => c.value === 0) ? (
            <EmptyState label={emptyLabel} />
          ) : (
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={d.collection}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  startAngle={90}
                  endAngle={-270}
                >
                  <Cell fill="hsl(var(--primary))" />
                  <Cell fill="#F43F5E" opacity={0.4} />
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => v.toLocaleString()}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(v) =>
                    v === "paid" ? (isAr ? "مدفوع" : "Paid") : isAr ? "متبقٍ" : "Outstanding"
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel
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
            <EmptyState label={loadingLabel} />
          ) : d.maintenance.length === 0 ? (
            <EmptyState label={emptyLabel} />
          ) : (
            <ResponsiveContainer>
              {maintView === "bar" ? (
                <BarChart data={d.maintenance} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} animationDuration={600}>
                    {d.maintenance.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie
                    data={d.maintenance}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {d.maintenance.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              )}
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel
          title={isAr ? "توقّعات الذكاء" : "AI Forecast"}
          subtitle={isAr ? "قريبًا" : "Coming soon"}
        >
          <div className="grid h-full place-items-center text-center">
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
        </Panel>
      </div>
    </div>
  );
}
