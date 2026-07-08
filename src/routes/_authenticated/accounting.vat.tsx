import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { getAccountingSummary } from "@/lib/accounting.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { DATE_RANGE_MESSAGES_EN, DATE_RANGE_MESSAGES_AR } from "@/lib/reports/date-range";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/accounting/vat")({
  head: () => sectionHead({ section: "accounting", entityAr: "ضريبة القيمة المضافة", entityEn: "VAT", path: "/accounting/vat" }),
  component: VatPage,
});

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function tenYearsAgo() {
  return new Date(new Date().getFullYear() - 10, 0, 1).toISOString().slice(0, 10);
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

function VatPage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id;
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());

  const q = useQuery({
    queryKey: ["acct-summary", orgId, from, to],
    queryFn: () => getAccountingSummary({ data: { orgId: orgId!, from, to } }),
    enabled: !!orgId,
  });

  const summary = useMemo(() => {
    const invoices = q.data?.invoices ?? [];
    const expenses = q.data?.expenses ?? [];
    const outputVat = invoices.reduce((s: number, r: any) => s + Number(r.vat_amount), 0);
    const inputVat = expenses.reduce((s: number, r: any) => s + Number(r.vat_amount), 0);
    const taxableSales = invoices.reduce((s: number, r: any) => s + Number(r.subtotal), 0);
    const taxablePurchases = expenses.reduce(
      (s: number, r: any) => s + Number(r.amount) - Number(r.vat_amount),
      0,
    );
    return { outputVat, inputVat, net: outputVat - inputVat, taxableSales, taxablePurchases };
  }, [q.data]);

  const exportCsv = () => {
    const rows = [
      {
        section: t("vat.csvSection.sales"),
        period: `${from} → ${to}`,
        taxable_base: summary.taxableSales.toFixed(2),
        vat: summary.outputVat.toFixed(2),
      },
      {
        section: t("vat.csvSection.purchases"),
        period: `${from} → ${to}`,
        taxable_base: summary.taxablePurchases.toFixed(2),
        vat: summary.inputVat.toFixed(2),
      },
      {
        section: t("vat.csvSection.net"),
        period: `${from} → ${to}`,
        taxable_base: "",
        vat: summary.net.toFixed(2),
      },
    ];
    download(`vat-${from}_${to}.csv`, toCSV(rows));
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <CardTitle>{t("vat.title")}</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeFilter
              from={from}
              to={to}
              minISO={tenYearsAgo()}
              maxISO={today()}
              isApplying={q.isFetching}
              messages={ar ? DATE_RANGE_MESSAGES_AR : DATE_RANGE_MESSAGES_EN}
              labels={{
                from: t("vat.filter.from"),
                to: t("vat.filter.to"),
                apply: t("vat.filter.apply"),
                applying: t("vat.filter.applying"),
                reset: t("vat.filter.reset"),
                errorToastTitle: t("vat.filter.errorToastTitle"),
                dirtyHint: t("vat.filter.dirtyHint"),
              }}
              idPrefix="vat-filter"
              draftStorageKey="reports:vat:date-range-draft"
              onApply={({ from: f, to: t }) => {
                setFrom(f);
                setTo(t);
              }}
              onReset={() => {
                setFrom(firstOfMonth());
                setTo(today());
              }}
            />
            <Button size="sm" variant="outline" className="gap-2" onClick={exportCsv}>
              <Download className="size-4" /> {t("vat.csv")}
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
              <Row
                label={t("vat.outputVat")}
                value={summary.outputVat}
                sub={t("vat.taxableSalesSub", { amount: `$${summary.taxableSales.toLocaleString()}` })}
              />
              <Row
                label={t("vat.inputVat")}
                value={summary.inputVat}
                sub={t("vat.taxablePurchasesSub", { amount: `$${summary.taxablePurchases.toLocaleString()}` })}
              />
              <Row
                label={t("vat.netVat")}
                value={summary.net}
                tone={summary.net >= 0 ? "warn" : "pos"}
                sub={summary.net >= 0 ? t("vat.owedToAuthority") : t("vat.refundDue")}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "pos" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div
        className={
          tone === "pos"
            ? "mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400"
            : tone === "warn"
              ? "mt-1 text-2xl font-semibold text-amber-600 dark:text-amber-400"
              : "mt-1 text-2xl font-semibold"
        }
      >
        ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
