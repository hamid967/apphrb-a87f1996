import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Ban, Check, RefreshCw, Receipt, Zap, FileSpreadsheet, FileText, X, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { HijriDateBadge } from "@/components/ui/hijri-date-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  listPaymentSchedules,
  markInstallmentPaid,
  cancelInstallment,
  createVoucherFromSchedule,
  generateDueVouchers,
} from "@/lib/payment-schedules.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard/payment-schedules")({
  head: () => ({
    meta: [
      { title: "جداول الأقساط — لوحة التحكم" },
      {
        name: "description",
        content:
          "إدارة أقساط العقود والصفقات والعمولات مع فوترة تلقائية وتقويم هجري.",
      },
    ],
  }),
  component: PaymentSchedulesPage,
});

type Row = Awaited<ReturnType<typeof listPaymentSchedules>>["items"][number];

const STATUS_LABEL: Record<string, { ar: string; en: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { ar: "معلّق",   en: "Pending",   variant: "secondary" },
  invoiced:  { ar: "فوترة",   en: "Invoiced",  variant: "outline" },
  paid:      { ar: "مدفوع",   en: "Paid",      variant: "default" },
  overdue:   { ar: "متأخر",   en: "Overdue",   variant: "destructive" },
  cancelled: { ar: "ملغى",    en: "Cancelled", variant: "outline" },
};

const SOURCE_LABEL: Record<string, { ar: string; en: string }> = {
  contract:   { ar: "عقد",    en: "Contract" },
  deal:       { ar: "صفقة",   en: "Deal" },
  commission: { ar: "عمولة",  en: "Commission" },
};

function PaymentSchedulesPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [orgId, setOrgId] = useState<string>("all");

  const orgsQ = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listMyOrganizations(),
  });

  const listQ = useQuery({
    queryKey: ["payment-schedules", status, source, orgId],
    queryFn: () =>
      listPaymentSchedules({
        data: {
          status: status === "all" ? undefined : (status as never),
          sourceType: source === "all" ? undefined : (source as never),
          orgId: orgId === "all" ? undefined : orgId,
        },
      }),
  });

  const payMut = useMutation({
    mutationFn: (id: string) => markInstallmentPaid({ data: { scheduleId: id } }),
    onSuccess: () => {
      toast.success(isAr ? "تم تسجيل الدفعة" : "Installment marked as paid");
      qc.invalidateQueries({ queryKey: ["payment-schedules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelInstallment({ data: { scheduleId: id } }),
    onSuccess: () => {
      toast.success(isAr ? "تم الإلغاء" : "Installment cancelled");
      qc.invalidateQueries({ queryKey: ["payment-schedules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voucherMut = useMutation({
    mutationFn: (id: string) => createVoucherFromSchedule({ data: { scheduleId: id } }),
    onSuccess: (res) => {
      toast.success(
        res.created
          ? (isAr ? "تم إنشاء سند الدفع" : "Voucher created")
          : (isAr ? "السند موجود مسبقاً" : "Voucher already exists"),
      );
      qc.invalidateQueries({ queryKey: ["payment-schedules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateAllMut = useMutation({
    mutationFn: () =>
      generateDueVouchers({
        data: { orgId: orgId === "all" ? undefined : orgId },
      }),
    onSuccess: (res) => {
      toast.success(
        isAr
          ? `تم إنشاء ${res.created} سند من أصل ${res.scanned}`
          : `Created ${res.created} of ${res.scanned} due vouchers`,
      );
      qc.invalidateQueries({ queryKey: ["payment-schedules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (listQ.data?.items ?? []) as Row[];

  const summary = useMemo(() => {
    let due = 0, paid = 0, overdue = 0;
    for (const r of rows) {
      const t = Number(r.total_amount ?? 0);
      if (r.status === "paid") paid += t;
      else if (r.status === "overdue") overdue += t;
      if (r.status !== "cancelled") due += t;
    }
    return { due, paid, overdue };
  }, [rows]);

  const csvCell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const buildExportData = async () => {
    const voucherIds = Array.from(
      new Set(rows.map((r) => r.voucher_id).filter((v): v is string => !!v)),
    );
    const commissionIds = Array.from(
      new Set(rows.map((r) => r.commission_id).filter((v): v is string => !!v)),
    );

    const [vRes, cRes] = await Promise.all([
      voucherIds.length
        ? supabase
            .from("payments")
            .select("id, reference, status, paid_at, amount, currency_code")
            .in("id", voucherIds)
        : Promise.resolve({ data: [] as never[], error: null }),
      commissionIds.length
        ? supabase
            .from("commissions")
            .select("id, deal_id, agent_id, percent, amount, status, paid_at, currency")
            .in("id", commissionIds)
        : Promise.resolve({ data: [] as never[], error: null }),
    ]);

    if (vRes.error) toast.warning(vRes.error.message);
    if (cRes.error) toast.warning(cRes.error.message);

    const vMap = new Map<string, any>((vRes.data ?? []).map((v: any) => [v.id, v]));
    const cMap = new Map<string, any>((cRes.data ?? []).map((c: any) => [c.id, c]));

    const headers = [
      "installment_no", "due_date", "source_type",
      "amount", "vat_amount", "total_amount", "status", "notes",
      "contract_id", "deal_id", "commission_id",
      "voucher_id", "voucher_reference", "voucher_status",
      "voucher_paid_at", "voucher_amount", "voucher_currency",
      "invoice_id",
      "commission_percent", "commission_amount",
      "commission_status", "commission_paid_at", "commission_currency",
      "commission_agent_id",
    ];
    const dataRows = rows.map((r) => {
      const v = r.voucher_id ? vMap.get(r.voucher_id) : null;
      const c = r.commission_id ? cMap.get(r.commission_id) : null;
      return [
        r.installment_no, r.due_date, r.source_type,
        r.amount, r.vat_amount, r.total_amount, r.status, r.notes,
        r.contract_id, r.deal_id, r.commission_id,
        r.voucher_id, v?.reference, v?.status,
        v?.paid_at, v?.amount, v?.currency_code,
        r.invoice_id,
        c?.percent, c?.amount,
        c?.status, c?.paid_at, c?.currency,
        c?.agent_id,
      ];
    });
    return { headers, dataRows };
  };

  const scopedFilename = (ext: string) => {
    const scope = [
      source !== "all" ? source : null,
      status !== "all" ? status : null,
    ].filter(Boolean).join("-");
    return `payment-schedules${scope ? `-${scope}` : ""}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  };

  const exportCsv = async () => {
    if (rows.length === 0) {
      toast.info(isAr ? "لا توجد بيانات للتصدير" : "Nothing to export");
      return;
    }
    const { headers, dataRows } = await buildExportData();
    const lines = [headers.join(",")];
    for (const row of dataRows) lines.push(row.map(csvCell).join(","));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = scopedFilename("csv");
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      isAr ? `تم تصدير ${rows.length} صفاً` : `Exported ${rows.length} rows`,
    );
  };

  const exportXlsx = async () => {
    if (rows.length === 0) {
      toast.info(isAr ? "لا توجد بيانات للتصدير" : "Nothing to export");
      return;
    }
    const { headers, dataRows } = await buildExportData();
    const aoa: unknown[][] = [headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map((h) => ({
      wch: Math.min(
        28,
        Math.max(
          h.length + 2,
          ...dataRows.map((r) => String(r[headers.indexOf(h)] ?? "").length + 2),
        ),
      ),
    }));
    if (isAr) ws["!views"] = [{ RTL: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "payment-schedules");
    XLSX.writeFile(wb, scopedFilename("xlsx"));
    toast.success(
      isAr ? `تم تصدير ${rows.length} صفاً` : `Exported ${rows.length} rows`,
    );
  };

  const exportPdf = async () => {
    if (rows.length === 0) {
      toast.info(isAr ? "لا توجد بيانات للتصدير" : "Nothing to export");
      return;
    }
    const { headers, dataRows } = await buildExportData();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
    const title = isAr ? "جداول الأقساط" : "Payment Schedules";
    const scopeBits = [
      orgId !== "all" &&
        `${isAr ? "المؤسسة" : "Org"}: ${
          (orgsQ.data ?? []).find((o) => o.org.id === orgId)?.org.name ?? orgId
        }`,
      status !== "all" && `${isAr ? "الحالة" : "Status"}: ${status}`,
      source !== "all" && `${isAr ? "المصدر" : "Source"}: ${source}`,
    ].filter(Boolean).join("   |   ") || (isAr ? "بدون فلاتر" : "No filters");

    doc.setFontSize(14);
    doc.text(title, 40, 32);
    doc.setFontSize(9);
    doc.text(scopeBits, 40, 48);
    doc.text(
      `${isAr ? "أُنشئ في" : "Generated"}: ${new Date().toLocaleString()}   ` +
      `|   ${isAr ? "إجمالي مستحق" : "Total due"}: ${summary.due.toFixed(2)}   ` +
      `|   ${isAr ? "مدفوع" : "Paid"}: ${summary.paid.toFixed(2)}   ` +
      `|   ${isAr ? "متأخر" : "Overdue"}: ${summary.overdue.toFixed(2)}`,
      40,
      62,
    );

    // Note: jsPDF's default fonts are Latin-only. All exported column values
    // (keys, IDs, ISO dates, numbers) are ASCII, so they render cleanly.
    // Free-form Arabic in `notes` may fall back to boxes — CSV/XLSX cover
    // that use case.
    const body = dataRows.map((r) => r.map((v) => (v == null ? "" : String(v))));
    autoTable(doc, {
      startY: 78,
      head: [headers],
      body,
      styles: { fontSize: 6, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 6 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 24, right: 24 },
      didDrawPage: (data) => {
        const page = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.text(
          `${isAr ? "صفحة" : "Page"} ${data.pageNumber} / ${page}`,
          doc.internal.pageSize.getWidth() - 80,
          doc.internal.pageSize.getHeight() - 16,
        );
      },
    });

    doc.save(scopedFilename("pdf"));
    toast.success(
      isAr ? `تم تصدير ${rows.length} صفاً` : `Exported ${rows.length} rows`,
    );
  };



  const activeFilters = [
    orgId !== "all" && {
      key: "org",
      label: (orgsQ.data ?? []).find((o) => o.org.id === orgId)?.org.name ?? orgId,
      clear: () => setOrgId("all"),
    },
    status !== "all" && {
      key: "status",
      label: isAr ? STATUS_LABEL[status]?.ar : STATUS_LABEL[status]?.en,
      clear: () => setStatus("all"),
    },
    source !== "all" && {
      key: "source",
      label: isAr ? SOURCE_LABEL[source]?.ar : SOURCE_LABEL[source]?.en,
      clear: () => setSource("all"),
    },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearAllFilters = () => {
    setOrgId("all");
    setStatus("all");
    setSource("all");
  };

  const isRefetching = listQ.isFetching && !listQ.isLoading;
  const busyRowId = (voucherMut.isPending && voucherMut.variables) ||
    (payMut.isPending && payMut.variables) ||
    (cancelMut.isPending && cancelMut.variables) || null;

  const btnPress = "transition-all duration-150 active:scale-[0.97] hover:-translate-y-0.5";

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in" dir={isAr ? "rtl" : "ltr"}>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:flex md:flex-wrap md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl sm:text-2xl font-bold">
            {isAr ? "جداول الأقساط" : "Payment Schedules"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {isAr
              ? "أقساط العقود والصفقات والعمولات مع دعم التقويم الهجري."
              : "Contract, deal, and commission installments with Hijri support."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            variant="default"
            size="sm"
            onClick={() => generateAllMut.mutate()}
            disabled={generateAllMut.isPending}
            className={btnPress}
          >
            {generateAllMut.isPending
              ? <Loader2 className="h-4 w-4 me-1 animate-spin" />
              : <Zap className="h-4 w-4 me-1" />}
            <span className="hidden sm:inline">
              {isAr ? "توليد سندات الأقساط المستحقة" : "Generate due vouchers"}
            </span>
            <span className="sm:hidden">{isAr ? "توليد" : "Generate"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} className={btnPress}>
            <Download className="h-4 w-4 me-1" />
            <span className="hidden sm:inline">{isAr ? "تصدير CSV" : "Export CSV"}</span>
            <span className="sm:hidden">CSV</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} className={btnPress}>
            <FileSpreadsheet className="h-4 w-4 me-1" />
            <span className="hidden sm:inline">{isAr ? "تصدير XLSX" : "Export XLSX"}</span>
            <span className="sm:hidden">XLSX</span>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: isAr ? "إجمالي مستحق" : "Total due", val: summary.due, tone: "" },
          { label: isAr ? "مدفوع" : "Paid", val: summary.paid, tone: "text-primary" },
          { label: isAr ? "متأخر" : "Overdue", val: summary.overdue, tone: "text-destructive" },
        ].map((c) => (
          <Card
            key={c.label}
            className="p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className={cn("text-2xl font-semibold tabular-nums tracking-tight", c.tone)}>
              {listQ.isLoading
                ? <Skeleton className="h-7 w-24 mt-1" />
                : c.val.toFixed(2)}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-full sm:w-52 transition-colors"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "كل المؤسسات" : "All organizations"}</SelectItem>
            {(orgsQ.data ?? []).map((o) => (
              <SelectItem key={o.org.id} value={o.org.id}>{o.org.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40 transition-colors"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{isAr ? v.ar : v.en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40 transition-colors"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "كل المصادر" : "All sources"}</SelectItem>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{isAr ? v.ar : v.en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["payment-schedules"] })}
          className={cn(btnPress, "ms-auto")}
          disabled={isRefetching}
          aria-label={isAr ? "تحديث" : "Refresh"}
        >
          <RefreshCw className={cn("h-4 w-4 me-1", isRefetching && "animate-spin")} />
          <span className="hidden sm:inline">{isAr ? "تحديث" : "Refresh"}</span>
        </Button>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 animate-fade-in">
          <span className="text-xs text-muted-foreground me-1">
            {isAr ? "فلاتر نشطة:" : "Active filters:"}
          </span>
          {activeFilters.map((f) => (
            <Badge
              key={f.key}
              variant="secondary"
              className="pe-1 gap-1 transition-transform hover:scale-105"
            >
              {f.label}
              <button
                type="button"
                onClick={f.clear}
                className="rounded-full p-0.5 hover:bg-background/60 transition-colors"
                aria-label={isAr ? "إزالة" : "Remove"}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={clearAllFilters}
          >
            {isAr ? "مسح الكل" : "Clear all"}
          </Button>
        </div>
      )}

      {/* Desktop table */}
      <Card className={cn(
        "overflow-x-auto hidden md:block transition-opacity",
        isRefetching && "opacity-70",
      )}>
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-start">#</th>
              <th className="p-3 text-start">{isAr ? "الاستحقاق" : "Due"}</th>
              <th className="p-3 text-start">{isAr ? "المصدر" : "Source"}</th>
              <th className="p-3 text-end">{isAr ? "المبلغ" : "Amount"}</th>
              <th className="p-3 text-end">{isAr ? "الضريبة" : "VAT"}</th>
              <th className="p-3 text-end">{isAr ? "الإجمالي" : "Total"}</th>
              <th className="p-3 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="p-3 text-end">{isAr ? "إجراءات" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="p-3"><Skeleton className="h-4 w-full max-w-24" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2 animate-fade-in">
                  <Receipt className="h-8 w-8 opacity-40" />
                  <span>{isAr ? "لا توجد أقساط." : "No installments yet."}</span>
                </div>
              </td></tr>
            ) : rows.map((r) => {
              const s = STATUS_LABEL[r.status ?? "pending"];
              const src = SOURCE_LABEL[r.source_type];
              const disabled = r.status === "paid" || r.status === "cancelled";
              const rowBusy = busyRowId === r.id;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/30",
                    rowBusy && "bg-muted/50 animate-pulse",
                  )}
                >
                  <td className="p-3 font-mono">{r.installment_no}</td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <span className="tabular-nums">{r.due_date}</span>
                      <HijriDateBadge date={r.due_date} />
                    </div>
                  </td>
                  <td className="p-3">{isAr ? src?.ar : src?.en}</td>
                  <td className="p-3 text-end font-mono tabular-nums">{Number(r.amount).toFixed(2)}</td>
                  <td className="p-3 text-end font-mono tabular-nums">{Number(r.vat_amount).toFixed(2)}</td>
                  <td className="p-3 text-end font-mono tabular-nums font-semibold">
                    {Number(r.total_amount).toFixed(2)}
                  </td>
                  <td className="p-3">
                    <Badge variant={s?.variant ?? "outline"} className="transition-transform">
                      {isAr ? s?.ar : s?.en}
                    </Badge>
                  </td>
                  <td className="p-3 text-end space-x-1 rtl:space-x-reverse">
                    <Button
                      size="sm" variant="outline"
                      disabled={disabled || Boolean(r.voucher_id) || rowBusy}
                      onClick={() => voucherMut.mutate(r.id)}
                      title={isAr ? "إنشاء سند" : "Create voucher"}
                      className={btnPress}
                    >
                      {voucherMut.isPending && voucherMut.variables === r.id
                        ? <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" />
                        : <Receipt className="h-3.5 w-3.5 me-1" />}
                      {isAr ? "سند" : "Voucher"}
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      disabled={disabled || rowBusy}
                      onClick={() => payMut.mutate(r.id)}
                      className={btnPress}
                    >
                      {payMut.isPending && payMut.variables === r.id
                        ? <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" />
                        : <Check className="h-3.5 w-3.5 me-1" />}
                      {isAr ? "دفع" : "Pay"}
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      disabled={disabled || rowBusy}
                      onClick={() => cancelMut.mutate(r.id)}
                      className={btnPress}
                    >
                      {cancelMut.isPending && cancelMut.variables === r.id
                        ? <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" />
                        : <Ban className="h-3.5 w-3.5 me-1" />}
                      {isAr ? "إلغاء" : "Cancel"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Mobile card list */}
      <div className={cn(
        "md:hidden space-y-2 transition-opacity",
        isRefetching && "opacity-70",
      )}>
        {listQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-3 space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-6 w-32" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
              </div>
            </Card>
          ))
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground animate-fade-in">
            <Receipt className="h-8 w-8 opacity-40 mx-auto mb-2" />
            {isAr ? "لا توجد أقساط." : "No installments yet."}
          </Card>
        ) : rows.map((r) => {
          const s = STATUS_LABEL[r.status ?? "pending"];
          const src = SOURCE_LABEL[r.source_type];
          const disabled = r.status === "paid" || r.status === "cancelled";
          const rowBusy = busyRowId === r.id;
          return (
            <Card
              key={r.id}
              className={cn(
                "p-3 space-y-2 transition-all duration-200 active:scale-[0.99]",
                rowBusy && "bg-muted/40 animate-pulse",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    #{r.installment_no}
                  </span>
                  <span className="text-sm truncate">{isAr ? src?.ar : src?.en}</span>
                </div>
                <Badge variant={s?.variant ?? "outline"} className="shrink-0">
                  {isAr ? s?.ar : s?.en}
                </Badge>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{r.due_date}</div>
                  <HijriDateBadge date={r.due_date} />
                </div>
                <div className="text-end">
                  <div className="text-lg font-semibold tabular-nums">
                    {Number(r.total_amount).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {isAr ? "شامل ضريبة" : "incl. VAT"} {Number(r.vat_amount).toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <Button
                  size="sm" variant="outline"
                  disabled={disabled || Boolean(r.voucher_id) || rowBusy}
                  onClick={() => voucherMut.mutate(r.id)}
                  className={btnPress}
                >
                  {voucherMut.isPending && voucherMut.variables === r.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Receipt className="h-3.5 w-3.5 me-1" />}
                  <span className="text-xs">{isAr ? "سند" : "Voucher"}</span>
                </Button>
                <Button
                  size="sm" variant="default"
                  disabled={disabled || rowBusy}
                  onClick={() => payMut.mutate(r.id)}
                  className={btnPress}
                >
                  {payMut.isPending && payMut.variables === r.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Check className="h-3.5 w-3.5 me-1" />}
                  <span className="text-xs">{isAr ? "دفع" : "Pay"}</span>
                </Button>
                <Button
                  size="sm" variant="ghost"
                  disabled={disabled || rowBusy}
                  onClick={() => cancelMut.mutate(r.id)}
                  className={btnPress}
                >
                  {cancelMut.isPending && cancelMut.variables === r.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Ban className="h-3.5 w-3.5 me-1" />}
                  <span className="text-xs">{isAr ? "إلغاء" : "Cancel"}</span>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Input type="hidden" aria-hidden readOnly value={rows.length} />
    </div>
  );
}

