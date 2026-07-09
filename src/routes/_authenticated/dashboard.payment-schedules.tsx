import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Ban, Check, RefreshCw, Receipt, Zap, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { HijriDateBadge } from "@/components/ui/hijri-date-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
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

  const exportCsv = async () => {
    if (rows.length === 0) {
      toast.info(isAr ? "لا توجد بيانات للتصدير" : "Nothing to export");
      return;
    }
    // Batch-fetch linked vouchers (payments) and commissions to enrich the
    // CSV. RLS on the browser client scopes results to the caller's orgs.
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
    const lines = [headers.join(",")];
    for (const r of rows) {
      const v = r.voucher_id ? vMap.get(r.voucher_id) : null;
      const c = r.commission_id ? cMap.get(r.commission_id) : null;
      lines.push([
        r.installment_no, r.due_date, r.source_type,
        r.amount, r.vat_amount, r.total_amount, r.status, r.notes,
        r.contract_id, r.deal_id, r.commission_id,
        r.voucher_id, v?.reference, v?.status,
        v?.paid_at, v?.amount, v?.currency_code,
        r.invoice_id,
        c?.percent, c?.amount,
        c?.status, c?.paid_at, c?.currency,
        c?.agent_id,
      ].map(csvCell).join(","));
    }

    // BOM so Excel opens Arabic notes/references in UTF-8 correctly.
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const scope = [
      source !== "all" ? source : null,
      status !== "all" ? status : null,
    ].filter(Boolean).join("-");
    a.download = `payment-schedules${scope ? `-${scope}` : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      isAr ? `تم تصدير ${rows.length} صفاً` : `Exported ${rows.length} rows`,
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isAr ? "جداول الأقساط" : "Payment Schedules"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "أقساط العقود والصفقات والعمولات مع دعم التقويم الهجري."
              : "Contract, deal, and commission installments with Hijri support."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => generateAllMut.mutate()}
            disabled={generateAllMut.isPending}
          >
            <Zap className="h-4 w-4 me-1" />
            {isAr ? "توليد سندات الأقساط المستحقة" : "Generate due vouchers"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 me-1" />
            {isAr ? "تصدير CSV" : "Export CSV"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">
            {isAr ? "إجمالي مستحق" : "Total due"}
          </div>
          <div className="text-2xl font-semibold">{summary.due.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">
            {isAr ? "مدفوع" : "Paid"}
          </div>
          <div className="text-2xl font-semibold text-primary">
            {summary.paid.toFixed(2)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">
            {isAr ? "متأخر" : "Overdue"}
          </div>
          <div className="text-2xl font-semibold text-destructive">
            {summary.overdue.toFixed(2)}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "كل المؤسسات" : "All organizations"}</SelectItem>
            {(orgsQ.data ?? []).map((o) => (
              <SelectItem key={o.org.id} value={o.org.id}>{o.org.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{isAr ? v.ar : v.en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
        >
          <RefreshCw className="h-4 w-4 me-1" />
          {isAr ? "تحديث" : "Refresh"}
        </Button>
      </div>

      <Card className="overflow-x-auto">
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
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">
                {isAr ? "جارٍ التحميل…" : "Loading…"}
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">
                {isAr ? "لا توجد أقساط." : "No installments yet."}
              </td></tr>
            ) : rows.map((r) => {
              const s = STATUS_LABEL[r.status ?? "pending"];
              const src = SOURCE_LABEL[r.source_type];
              const disabled = r.status === "paid" || r.status === "cancelled";
              return (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-mono">{r.installment_no}</td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <span>{r.due_date}</span>
                      <HijriDateBadge date={r.due_date} />
                    </div>
                  </td>
                  <td className="p-3">{isAr ? src?.ar : src?.en}</td>
                  <td className="p-3 text-end font-mono">{Number(r.amount).toFixed(2)}</td>
                  <td className="p-3 text-end font-mono">{Number(r.vat_amount).toFixed(2)}</td>
                  <td className="p-3 text-end font-mono font-semibold">
                    {Number(r.total_amount).toFixed(2)}
                  </td>
                  <td className="p-3">
                    <Badge variant={s?.variant ?? "outline"}>
                      {isAr ? s?.ar : s?.en}
                    </Badge>
                  </td>
                  <td className="p-3 text-end space-x-1 rtl:space-x-reverse">
                    <Button
                      size="sm" variant="outline"
                      disabled={disabled || Boolean(r.voucher_id) || voucherMut.isPending}
                      onClick={() => voucherMut.mutate(r.id)}
                      title={isAr ? "إنشاء سند" : "Create voucher"}
                    >
                      <Receipt className="h-3.5 w-3.5 me-1" />
                      {isAr ? "سند" : "Voucher"}
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      disabled={disabled || payMut.isPending}
                      onClick={() => payMut.mutate(r.id)}
                    >
                      <Check className="h-3.5 w-3.5 me-1" />
                      {isAr ? "دفع" : "Pay"}
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      disabled={disabled || cancelMut.isPending}
                      onClick={() => cancelMut.mutate(r.id)}
                    >
                      <Ban className="h-3.5 w-3.5 me-1" />
                      {isAr ? "إلغاء" : "Cancel"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Input
        type="hidden"
        aria-hidden
        readOnly
        value={rows.length}
      />
    </div>
  );
}
