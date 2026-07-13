import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { getAccountingSummary } from "@/lib/accounting.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { DATE_RANGE_MESSAGES_EN } from "@/lib/reports/date-range";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/accounting/pnl")({
  head: () => sectionHead({ section: "accounting", entityAr: "الأرباح والخسائر", entityEn: "Profit & Loss", path: "/accounting/pnl" }),
  component: PnlPage,
});

function firstOfYear() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function tenYearsAgo() {
  return new Date(new Date().getFullYear() - 10, 0, 1).toISOString().slice(0, 10);
}
function monthKey(d: string) {
  return d.slice(0, 7);
}

function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join(
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

function PnlPage() {
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id;
  const [from, setFrom] = useState(firstOfYear());
  const [to, setTo] = useState(today());
  const minISO = tenYearsAgo();
  const maxISO = today();

  const q = useQuery({
    queryKey: ["acct-summary", orgId, from, to],
    queryFn: () => getAccountingSummary({ data: { orgId: orgId!, from, to } }),
    enabled: !!orgId,
  });

  const { totals, monthly, byCategory } = useMemo(() => {
    const invoices = q.data?.invoices ?? [];
    const expenses = q.data?.expenses ?? [];
    const income = invoices
      .filter((r: any) => r.status !== "cancelled")
      .reduce((s: number, r: any) => s + Number(r.subtotal), 0);
    const spend = expenses.reduce(
      (s: number, r: any) => s + (Number(r.amount) - Number(r.vat_amount)),
      0,
    );
    const net = income - spend;

    const months = new Map<
      string,
      { month: string; income: number; expenses: number; net: number }
    >();
    const bump = (k: string) => {
      if (!months.has(k)) months.set(k, { month: k, income: 0, expenses: 0, net: 0 });
      return months.get(k)!;
    };
    invoices.forEach((r: any) => {
      if (r.status === "cancelled") return;
      const m = bump(monthKey(r.issue_date));
      m.income += Number(r.subtotal);
      m.net = m.income - m.expenses;
    });
    expenses.forEach((r: any) => {
      const m = bump(monthKey(r.spent_at));
      m.expenses += Number(r.amount) - Number(r.vat_amount);
      m.net = m.income - m.expenses;
    });
    const monthly = Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));

    const cats: Record<string, number> = {};
    expenses.forEach((r: any) => {
      cats[r.category] = (cats[r.category] ?? 0) + (Number(r.amount) - Number(r.vat_amount));
    });
    const byCategory = Object.entries(cats)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    return { totals: { income, spend, net }, monthly, byCategory };
  }, [q.data]);

  const exportCsv = () => {
    const rows = [
      { section: "Total income", period: `${from} → ${to}`, amount: totals.income.toFixed(2) },
      { section: "Total expenses", period: `${from} → ${to}`, amount: totals.spend.toFixed(2) },
      { section: "Net profit", period: `${from} → ${to}`, amount: totals.net.toFixed(2) },
      ...monthly.map((m) => ({
        section: `Month ${m.month}`,
        period: "",
        amount: `income=${m.income.toFixed(2)}; expenses=${m.expenses.toFixed(2)}; net=${m.net.toFixed(2)}`,
      })),
      ...byCategory.map((c) => ({
        section: `Expense: ${c.category}`,
        period: "",
        amount: c.amount.toFixed(2),
      })),
    ];
    download(`pnl-${from}_${to}.csv`, toCSV(rows));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <CardTitle>Profit & Loss</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeFilter
              from={from}
              to={to}
              minISO={minISO}
              maxISO={maxISO}
              isApplying={q.isFetching}
              messages={DATE_RANGE_MESSAGES_EN}
              labels={{
                from: "From",
                to: "To",
                apply: "Apply",
                applying: "Applying…",
                reset: "Reset range",
                errorToastTitle: "Cannot apply range",
                dirtyHint: "Unapplied changes — click Apply to refresh.",
              }}
              idPrefix="pnl-filter"
              draftStorageKey="reports:pnl:date-range-draft"
              onApply={({ from: f, to: t }) => {
                setFrom(f);
                setTo(t);
              }}
              onReset={() => {
                setFrom(firstOfYear());
                setTo(today());
              }}
            />
            <Button size="sm" variant="outline" className="gap-2" onClick={exportCsv}>
              <Download className="size-4" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <Row label="Income" value={totals.income} tone="pos" />
              <Row label="Expenses" value={totals.spend} tone="warn" />
              <Row label="Net profit" value={totals.net} tone={totals.net >= 0 ? "pos" : "neg"} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly P&L</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="hsl(160 60% 45%)" strokeWidth={2} />
                <Line type="monotone" dataKey="expenses" stroke="hsl(20 80% 55%)" strokeWidth={2} />
                <Line type="monotone" dataKey="net" stroke="hsl(220 70% 55%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expenses by category</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategory}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="category" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="amount" fill="hsl(280 60% 55%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "pos" | "warn" | "neg";
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div
        className={
          tone === "pos"
            ? "mt-1 text-2xl font-semibold text-success dark:text-success"
            : tone === "warn"
              ? "mt-1 text-2xl font-semibold text-warning dark:text-warning"
              : tone === "neg"
                ? "mt-1 text-2xl font-semibold text-destructive dark:text-destructive"
                : "mt-1 text-2xl font-semibold"
        }
      >
        ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
