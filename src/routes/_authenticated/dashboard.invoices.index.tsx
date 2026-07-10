import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Receipt,
  Search,
  Filter,
  Download,
  ArrowRight,
  Loader2,
  FileDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { listInvoices, type InvoiceListRow } from "@/lib/invoices.functions";
import { exportRows } from "@/lib/export-rows";

export const Route = createFileRoute("/_authenticated/dashboard/invoices/")({
  head: () => ({
    meta: [
      { title: "الفواتير — بوابة الفوترة" },
      {
        name: "description",
        content:
          "بوابة الفوترة الداخلية: قائمة الفواتير مع فلاتر البحث والحالة وملخصات سريعة متوافقة مع ZATCA.",
      },
    ],
  }),
  component: InvoicesListPage,
});

const STATUS_TABS: Array<{ key: string; ar: string; en: string }> = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "draft", ar: "مسودة", en: "Draft" },
  { key: "sent", ar: "مُرسلة", en: "Sent" },
  { key: "paid", ar: "مدفوعة", en: "Paid" },
  { key: "overdue", ar: "متأخرة", en: "Overdue" },
  { key: "cancelled", ar: "ملغاة", en: "Cancelled" },
];

const ZATCA_OPTS: Array<{ key: string; ar: string; en: string }> = [
  { key: "all", ar: "كل حالات ZATCA", en: "All ZATCA" },
  { key: "draft", ar: "مسودة", en: "Draft" },
  { key: "reported", ar: "مُبلّغة", en: "Reported" },
  { key: "cleared", ar: "مُخلّصة", en: "Cleared" },
  { key: "rejected", ar: "مرفوضة", en: "Rejected" },
];

function statusBadge(status: string | null, isAr: boolean) {
  const map: Record<
    string,
    { ar: string; en: string; cls: string }
  > = {
    draft: { ar: "مسودة", en: "Draft", cls: "bg-muted text-muted-foreground" },
    sent: { ar: "مُرسلة", en: "Sent", cls: "bg-primary/15 text-primary" },
    paid: { ar: "مدفوعة", en: "Paid", cls: "bg-success/15 text-success" },
    overdue: {
      ar: "متأخرة",
      en: "Overdue",
      cls: "bg-destructive/15 text-destructive",
    },
    cancelled: {
      ar: "ملغاة",
      en: "Cancelled",
      cls: "bg-muted text-muted-foreground line-through",
    },
  };
  const s = map[status ?? ""] ?? {
    ar: status ?? "—",
    en: status ?? "—",
    cls: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      {isAr ? s.ar : s.en}
    </span>
  );
}

function InvoicesListPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const nf = useMemo(
    () =>
      new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [isAr],
  );

  const [status, setStatus] = useState<string>("all");
  const [zatca, setZatca] = useState<string>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = useQuery({
    queryKey: ["dashboard-invoices", { status, zatca, q, from, to }],
    queryFn: () =>
      listInvoices({
        data: {
          status,
          zatca_status: zatca,
          q: q || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    staleTime: 20_000,
  });

  const items = query.data?.items ?? [];
  const totals = query.data?.totals;

  const handleExport = () => {
    const rows = items.map((r) => ({
      number: r.number ?? "",
      issue_date: r.issue_date ?? "",
      due_date: r.due_date ?? "",
      contact: r.contact_name ?? "",
      subtotal: r.subtotal ?? 0,
      vat: r.vat_amount ?? 0,
      total: r.total ?? 0,
      currency: r.currency ?? "SAR",
      status: r.status ?? "",
      zatca_status: r.zatca_status ?? "",
    }));
    exportRows(`invoices-${new Date().toISOString().slice(0, 10)}`, rows, "csv");
  };

  return (
    <div className="space-y-4 p-4 md:space-y-6 md:p-6" dir={isAr ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <Receipt className="size-5 shrink-0 text-primary" />
            <span className="truncate">
              {isAr ? "الفواتير" : "Invoices"}
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr
              ? "بوابة الفوترة الداخلية — ZATCA Phase 2"
              : "Internal invoicing portal — ZATCA Phase 2"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={items.length === 0}
        >
          <FileDown className="me-1 size-4" />
          {isAr ? "تصدير CSV" : "Export CSV"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label={isAr ? "عدد الفواتير" : "Invoices"}
          value={String(totals?.count ?? 0)}
          hint={isAr ? "ضمن الفلاتر" : "in filters"}
        />
        <SummaryCard
          label={isAr ? "الإجمالي" : "Total"}
          value={`${nf.format(totals?.total ?? 0)} ${isAr ? "ر.س" : "SAR"}`}
        />
        <SummaryCard
          label={isAr ? "المستحق" : "Outstanding"}
          value={`${nf.format(totals?.outstanding ?? 0)} ${isAr ? "ر.س" : "SAR"}`}
          tone="warning"
        />
        <SummaryCard
          label={isAr ? "المدفوع" : "Paid"}
          value={`${nf.format(totals?.paid ?? 0)} ${isAr ? "ر.س" : "SAR"}`}
          tone="success"
        />
      </div>

      {/* Filters + tabs */}
      <Card>
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="size-4" />
              {isAr ? "الفلاتر" : "Filters"}
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setStatus(t.key)}
                  className={
                    "rounded-full px-3 py-1 text-xs font-semibold transition " +
                    (status === t.key
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground")
                  }
                >
                  {isAr ? t.ar : t.en}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-2" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  isAr ? "بحث برقم أو وصف…" : "Search number / description…"
                }
                className="ps-8"
              />
            </div>
            <Select value={zatca} onValueChange={setZatca}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZATCA_OPTS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {isAr ? o.ar : o.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label={isAr ? "من تاريخ" : "From"}
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label={isAr ? "إلى تاريخ" : "To"}
            />
          </div>
        </CardHeader>

        <CardContent>
          {query.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : query.isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              {(query.error as Error).message}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد فواتير مطابقة" : "No matching invoices"}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{isAr ? "الإصدار" : "Issued"}</TableHead>
                      <TableHead>{isAr ? "الاستحقاق" : "Due"}</TableHead>
                      <TableHead>{isAr ? "العميل" : "Customer"}</TableHead>
                      <TableHead className="text-end">
                        {isAr ? "الإجمالي" : "Total"}
                      </TableHead>
                      <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                      <TableHead>ZATCA</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((row) => (
                      <InvoiceRow key={row.id} row={row} isAr={isAr} nf={nf} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-2 md:hidden">
                {items.map((row) => (
                  <MobileCard key={row.id} row={row} isAr={isAr} nf={nf} />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "warning";
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-lg font-bold tabular-nums sm:text-xl ${toneCls}`}>
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function InvoiceRow({
  row,
  isAr,
  nf,
}: {
  row: InvoiceListRow;
  isAr: boolean;
  nf: Intl.NumberFormat;
}) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        {row.number ?? row.id.slice(0, 8)}
      </TableCell>
      <TableCell className="text-muted-foreground">{row.issue_date ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{row.due_date ?? "—"}</TableCell>
      <TableCell className="max-w-[14rem] truncate">
        {row.contact_name ?? "—"}
      </TableCell>
      <TableCell className="text-end font-semibold tabular-nums">
        {nf.format(Number(row.total ?? 0))} {row.currency ?? "SAR"}
      </TableCell>
      <TableCell>{statusBadge(row.status, isAr)}</TableCell>
      <TableCell>
        <Badge variant={row.zatca_counter ? "default" : "secondary"} className="text-[10px]">
          {row.zatca_status ?? "—"}
          {row.zatca_counter ? ` · #${row.zatca_counter}` : ""}
        </Badge>
      </TableCell>
      <TableCell className="text-end">
        <Button asChild size="sm" variant="ghost">
          <Link to="/dashboard/invoices/$id" params={{ id: row.id }}>
            {isAr ? "فتح" : "Open"}
            <ArrowRight className="ms-1 size-3.5 rtl:rotate-180" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function MobileCard({
  row,
  isAr,
  nf,
}: {
  row: InvoiceListRow;
  isAr: boolean;
  nf: Intl.NumberFormat;
}) {
  return (
    <Link
      to="/dashboard/invoices/$id"
      params={{ id: row.id }}
      className="block rounded-lg border border-border/60 bg-card p-3 transition hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted-foreground">
            {row.number ?? row.id.slice(0, 8)}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium">
            {row.contact_name ?? (isAr ? "بدون عميل" : "No customer")}
          </div>
        </div>
        <div className="text-end">
          <div className="font-semibold tabular-nums">
            {nf.format(Number(row.total ?? 0))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {row.currency ?? "SAR"}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {isAr ? "إصدار" : "Issued"}: {row.issue_date ?? "—"}
        </span>
        <span>
          {isAr ? "استحقاق" : "Due"}: {row.due_date ?? "—"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {statusBadge(row.status, isAr)}
        <Badge variant={row.zatca_counter ? "default" : "secondary"} className="text-[10px]">
          {row.zatca_status ?? "—"}
          {row.zatca_counter ? ` · #${row.zatca_counter}` : ""}
        </Badge>
      </div>
    </Link>
  );
}
