import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { getExecutiveAnalytics, getKpiRecords } from "@/lib/executive.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ArrowLeft,
  X,
} from "lucide-react";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Building2,
  Users,
  Sparkles,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RequireRole } from "@/components/auth/RequireRole";
import { ADMIN_ROLES } from "@/lib/permissions";
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

const searchSchema = z.object({
  months: fallback(z.number().int().min(3).max(24), 12).default(12),
  kpi: fallback(
    z
      .enum([
        "collectedTotal",
        "revenueTotal",
        "outstanding",
        "netTotal",
        "occupancyRate",
        "vacantUnits",
        "activeContracts",
        "pipelineValue",
        "commissionsPaid",
        "commissionsPending",
      ])
      .optional(),
    undefined,
  ),
  label: fallback(z.string().optional(), undefined),
  page: fallback(z.number().int().min(1), 1).default(1),
  dateFrom: fallback(z.string().optional(), undefined),
  dateTo: fallback(z.string().optional(), undefined),
  status: fallback(z.string().optional(), undefined),
  category: fallback(z.string().optional(), undefined),
  sortField: fallback(z.enum(["date", "amount", "status"]), "date").default("date"),
  sortDir: fallback(z.enum(["asc", "desc"]), "desc").default("desc"),
});

export const Route = createFileRoute("/_authenticated/reports/executive")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Executive Analytics 2026 — HBSpro" },
      {
        name: "description",
        content:
          "Live executive KPIs, revenue trends, occupancy heatmap, and forecast for real estate portfolio.",
      },
    ],
  }),
  component: () => (
    <RequireRole
      roles={ADMIN_ROLES}
      title="Executive analytics restricted"
      description="Cross-module KPIs and financial drill-downs are limited to owners and administrators."
    >
      <ExecutivePage />
    </RequireRole>
  ),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Error: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

const CURRENCY = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmt = (n: number) => CURRENCY.format(Math.round(n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

function ExecutivePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const months = search.months;
  const page = search.page;
  const drill = search.kpi
    ? { kpi: search.kpi as KpiKey, label: search.label ?? search.kpi }
    : null;
  const filters = {
    dateFrom: search.dateFrom ?? "",
    dateTo: search.dateTo ?? "",
    status: search.status ?? "",
    category: search.category ?? "",
    sortField: search.sortField,
    sortDir: search.sortDir,
  };

  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: any) => ({ ...prev, ...patch }), replace: true });
  const setMonths = (m: number) => setSearch({ months: m });
  const setPage = (p: number | ((prev: number) => number)) =>
    setSearch({ page: typeof p === "function" ? (p as any)(page) : p });
  const openDrill = (kpi: KpiKey, label: string) => setSearch({ kpi, label, page: 1 });
  const closeDrill = () =>
    navigate({
      search: (prev: any) => ({ months: prev.months, page: 1, sortField: "date", sortDir: "desc" }),
      replace: true,
    });
  const resetFilters = () =>
    setSearch({
      dateFrom: undefined,
      dateTo: undefined,
      status: undefined,
      category: undefined,
      sortField: "date",
      sortDir: "desc",
      page: 1,
    });
  const toggleSort = (field: "date" | "amount" | "status") => {
    if (filters.sortField === field)
      setSearch({ sortDir: filters.sortDir === "asc" ? "desc" : "asc", page: 1 });
    else setSearch({ sortField: field, sortDir: "desc", page: 1 });
  };
  const SortIcon = ({ field }: { field: "date" | "amount" | "status" }) =>
    filters.sortField !== field ? (
      <ArrowUpDown className="ms-1 inline size-3 opacity-50" />
    ) : filters.sortDir === "asc" ? (
      <ArrowUp className="ms-1 inline size-3" />
    ) : (
      <ArrowDown className="ms-1 inline size-3" />
    );

  const fetchExec = useServerFn(getExecutiveAnalytics);
  const fetchKpi = useServerFn(getKpiRecords);
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org.id;
  const pageSize = 25;

  const drillQ = useQuery({
    queryKey: ["kpi-records", orgId, drill?.kpi, months, page, pageSize, filters],
    queryFn: () =>
      fetchKpi({
        data: {
          orgId: orgId!,
          kpi: drill!.kpi,
          months,
          page,
          pageSize,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          status: filters.status || undefined,
          category: filters.category || undefined,
          sortField: filters.sortField,
          sortDir: filters.sortDir,
        },
      }),
    enabled: !!orgId && !!drill,
    placeholderData: (prev) => prev,
  });

  const q = useQuery({
    queryKey: ["exec-analytics", orgId, months],
    queryFn: () => fetchExec({ data: { orgId: orgId!, months } }),
    enabled: !!orgId,
  });

  const combined = useMemo(() => {
    if (!q.data) return [];
    return [
      ...q.data.monthly.map((m) => ({
        month: m.month,
        collected: m.collected,
        forecast: null as number | null,
      })),
      ...q.data.forecast.map((f) => ({
        month: f.month,
        collected: null as number | null,
        forecast: f.forecast,
      })),
    ];
  }, [q.data]);

  if (!orgId || q.isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (q.error) return <div className="p-6 text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!;
  const k = d.kpis;

  const dealsStatusData = Object.entries(d.dealsByStatus).map(([name, value]) => ({ name, value }));
  const expensesCatData = Object.entries(d.expensesByCategory).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            Executive Analytics 2026
          </h1>
          <p className="text-sm text-muted-foreground">
            Live pulse on revenue, occupancy, pipeline, and forecast.
          </p>
        </div>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
            <SelectItem value="24">Last 24 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Collected revenue"
          value={fmt(k.collectedTotal)}
          sub={`${fmt(k.revenueTotal)} invoiced`}
          icon={<Wallet className="size-4" />}
          tone="positive"
          onClick={() => openDrill("collectedTotal", "Collected revenue")}
        />
        <KpiCard
          label="Net profit"
          value={fmt(k.netTotal)}
          sub={k.netTotal >= 0 ? "Profitable" : "Loss"}
          icon={
            k.netTotal >= 0 ? (
              <TrendingUp className="size-4" />
            ) : (
              <TrendingDown className="size-4" />
            )
          }
          tone={k.netTotal >= 0 ? "positive" : "negative"}
          onClick={() => openDrill("netTotal", "Expenses affecting net profit")}
        />
        <KpiCard
          label="Outstanding"
          value={fmt(k.outstanding)}
          sub={`${pct(k.collectionRate)} collection rate`}
          icon={<AlertCircle className="size-4" />}
          tone="warning"
          onClick={() => openDrill("outstanding", "Outstanding invoices")}
        />
        <KpiCard
          label="Occupancy"
          value={pct(k.occupancyRate)}
          sub={`${k.occupiedUnits}/${k.totalUnits} units occupied`}
          icon={<Building2 className="size-4" />}
          tone="neutral"
          onClick={() => openDrill("occupancyRate", "All units")}
        />
        <KpiCard
          label="Active contracts"
          value={String(k.activeContracts)}
          sub={`${k.expiring30} expiring in 30 days`}
          icon={<Users className="size-4" />}
          tone={k.expiring30 > 0 ? "warning" : "neutral"}
          onClick={() => openDrill("activeContracts", "Active contracts")}
        />
        <KpiCard
          label="Pipeline value"
          value={fmt(k.pipelineValue)}
          sub={`${fmt(k.wonValue)} closed`}
          icon={<Sparkles className="size-4" />}
          tone="neutral"
          onClick={() => openDrill("pipelineValue", "Open deals in pipeline")}
        />
        <KpiCard
          label="Commissions paid"
          value={fmt(k.commissionsPaid)}
          sub={`${fmt(k.commissionsPending)} pending`}
          icon={<Wallet className="size-4" />}
          tone="neutral"
          onClick={() => openDrill("commissionsPaid", "Paid commissions")}
        />
        <KpiCard
          label="Vacant units"
          value={String(k.vacantUnits)}
          sub="Available inventory"
          icon={<Building2 className="size-4" />}
          tone="neutral"
          onClick={() => openDrill("vacantUnits", "Vacant units")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue trend + forecast */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue trend & 3-month forecast</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={combined}>
                <defs>
                  <linearGradient id="gCol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmt(Number(v))} />
                <Tooltip
                  formatter={(v: any) => fmt(Number(v))}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="collected"
                  stroke="#6366f1"
                  fill="url(#gCol)"
                  name="Collected"
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  stroke="#10b981"
                  strokeDasharray="6 4"
                  fill="url(#gFor)"
                  name="Forecast"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Occupancy gauge */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Portfolio health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Gauge label="Occupancy" value={k.occupancyRate} />
            <Gauge label="Collection rate" value={k.collectionRate} />
            <Gauge
              label="Net margin"
              value={k.revenueTotal > 0 ? Math.max(0, k.netTotal / k.revenueTotal) : 0}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Monthly revenue vs expense */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cash flow (collected vs expenses)</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmt(Number(v))} />
                <Tooltip
                  formatter={(v: any) => fmt(Number(v))}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Legend />
                <Bar dataKey="collected" fill="#6366f1" name="Collected" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expenses" fill="#f43f5e" name="Expenses" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expenses by category */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expenses by category</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {expensesCatData.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No expenses yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesCatData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {expensesCatData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => fmt(Number(v))}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Legend fontSize={11} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Deals by status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deals pipeline</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {dealsStatusData.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No deals yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dealsStatusData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={90} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Net trend line */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Net profit trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmt(Number(v))} />
                <Tooltip
                  formatter={(v: any) => fmt(Number(v))}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => q.refetch()}>
          {q.isFetching ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      <Dialog
        open={!!drill}
        onOpenChange={(open) => {
          if (!open) closeDrill();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 -ms-2 px-2"
                onClick={() => window.history.back()}
                aria-label="Back"
              >
                <ArrowLeft className="me-1 size-4" /> Back
              </Button>
              <DialogTitle className="flex-1">{drill?.label}</DialogTitle>
            </div>
            <DialogDescription>
              {drillQ.data
                ? `${fmt(drillQ.data.count)} total record${drillQ.data.count === 1 ? "" : "s"} · showing ${drillQ.data.records.length} on page ${drillQ.data.page}`
                : "Loading records…"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 md:grid-cols-5">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setSearch({ dateFrom: e.target.value || undefined, page: 1 })}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setSearch({ dateTo: e.target.value || undefined, page: 1 })}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Input
                placeholder="any"
                value={filters.status}
                onChange={(e) => setSearch({ status: e.target.value || undefined, page: 1 })}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Category / Type</Label>
              <Input
                placeholder="any"
                value={filters.category}
                onChange={(e) => setSearch({ category: e.target.value || undefined, page: 1 })}
                className="h-8"
              />
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="ghost" onClick={resetFilters} className="h-8 w-full">
                <X className="me-1 size-3" /> Clear
              </Button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            {drillQ.error ? (
              <div className="p-4 text-sm text-destructive">{(drillQ.error as Error).message}</div>
            ) : !drillQ.data && drillQ.isLoading ? (
              <SkeletonTable rows={8} />
            ) : !drillQ.data?.records.length ? (
              <div className="grid h-40 place-items-center text-sm text-muted-foreground">
                No records
              </div>
            ) : (
              <Table
                className={
                  drillQ.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
                }
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("date")}
                        className="inline-flex items-center hover:text-foreground"
                      >
                        Date
                        <SortIcon field="date" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => toggleSort("status")}
                        className="inline-flex items-center hover:text-foreground"
                      >
                        Status
                        <SortIcon field="status" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort("amount")}
                        className="inline-flex items-center hover:text-foreground"
                      >
                        Amount
                        <SortIcon field="amount" />
                      </button>
                    </TableHead>
                    <TableHead className="w-16 text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillQ.data.records.map((r) => (
                    <TableRow
                      key={r.id}
                      className={r.href ? "cursor-pointer hover:bg-muted/50" : undefined}
                    >
                      <TableCell className="font-medium">
                        {r.href ? (
                          <Link
                            to={r.href}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {r.primary}
                          </Link>
                        ) : (
                          r.primary
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.secondary ?? "—"}</TableCell>
                      <TableCell>{r.date ? String(r.date).slice(0, 10) : "—"}</TableCell>
                      <TableCell>
                        {r.status ? <Badge variant="outline">{r.status}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.amount != null ? fmt(r.amount) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.href ? (
                          <Link
                            to={r.href}
                            aria-label={`Open ${r.primary}`}
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <ExternalLink className="size-4" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {drillQ.data && drillQ.data.count > pageSize && (
            <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
              <span>
                Page {drillQ.data.page} of {Math.max(1, Math.ceil(drillQ.data.count / pageSize))}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || drillQ.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= Math.ceil(drillQ.data.count / pageSize) || drillQ.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-6 items-center gap-3">
          <Skeleton className="col-span-2 h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="ml-auto h-4 w-16" />
          <Skeleton className="ml-auto h-6 w-8" />
        </div>
      ))}
    </div>
  );
}

type KpiKey =
  | "collectedTotal"
  | "revenueTotal"
  | "outstanding"
  | "netTotal"
  | "occupancyRate"
  | "vacantUnits"
  | "activeContracts"
  | "pipelineValue"
  | "commissionsPaid"
  | "commissionsPending";

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: "positive" | "negative" | "warning" | "neutral";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "positive"
      ? "from-success/15 to-success/5 text-success"
      : tone === "negative"
        ? "from-destructive/15 to-destructive/5 text-destructive"
        : tone === "warning"
          ? "from-warning/15 to-warning/5 text-warning"
          : "from-primary/15 to-accent/5 text-primary";
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative overflow-hidden border-border/50 ${onClick ? "cursor-pointer transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" : ""}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${toneClass} opacity-60`}
      />
      <CardContent className="relative p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span
            className={`grid size-7 place-items-center rounded-lg bg-background/60 backdrop-blur ${toneClass.split(" ").pop()}`}
          >
            {icon}
          </span>
        </div>
        <div className="mt-2 text-display text-2xl">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{pct(v)}</span>
      </div>
      <Progress value={v * 100} className="h-2" />
    </div>
  );
}
