import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Ban, Check, RefreshCw } from "lucide-react";
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
} from "@/lib/payment-schedules.functions";
import { listMyOrganizations } from "@/lib/organizations.functions";

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

  const exportCsv = () => {
    const headers = [
      "installment_no", "due_date", "amount", "vat_amount", "total_amount",
      "status", "source_type", "notes",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.installment_no, r.due_date, r.amount, r.vat_amount, r.total_amount,
        r.status, r.source_type, JSON.stringify(r.notes ?? ""),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-schedules-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4 me-1" />
          {isAr ? "تصدير CSV" : "Export CSV"}
        </Button>
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
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
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
