import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  XCircle,
  History,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listPendingSubscriptionPayments,
  reviewSubscriptionPayment,
  signReceiptUrl,
  getSubscriptionPaymentAudit,
  refundSubscriptionPayment,
} from "@/lib/billing.functions";
import { StatusBadge } from "./portal.billing";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/subscription-payments")({
  head: () => sectionHead({ section: "admin", entityAr: "مدفوعات الاشتراك", entityEn: "Subscription Payments", path: "/admin/subscription-payments" }),
  component: AdminSubscriptionPayments,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
});

const TABS = [
  { key: "pending", ar: "بانتظار المراجعة", en: "Pending" },
  { key: "approved", ar: "مقبولة", en: "Approved" },
  { key: "rejected", ar: "مرفوضة", en: "Rejected" },
  { key: "refunded", ar: "مستردة", en: "Refunded" },
  { key: "all", ar: "الكل", en: "All" },
];

function AdminSubscriptionPayments() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", {
    minimumFractionDigits: 2,
  });
  const [tab, setTab] = useState("pending");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [approveId, setApproveId] = useState<string | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [refundFor, setRefundFor] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [auditId, setAuditId] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSignError, setPreviewSignError] = useState<string | null>(null);
  const [previewFileLoading, setPreviewFileLoading] = useState(false);
  const [previewFileError, setPreviewFileError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pdfPage, setPdfPage] = useState(1);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === previewBoxRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (previewBoxRef.current) {
        await previewBoxRef.current.requestFullscreen();
      }
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    }
  };

  const { data } = useQuery({
    queryKey: ["admin", "sub-payments", tab, dateFrom, dateTo],
    queryFn: () =>
      listPendingSubscriptionPayments({
        data: {
          status: tab,
          from: dateFrom || undefined,
          to: dateTo || undefined,
        },
      }),
  });

  const auditQ = useQuery({
    queryKey: ["admin", "sub-payments", "audit", auditId],
    queryFn: () => getSubscriptionPaymentAudit({ data: { id: auditId! } }),
    enabled: !!auditId,
  });

  const mut = useMutation({
    mutationFn: (v: {
      id: string;
      decision: "approve" | "reject";
      reason?: string;
      note?: string;
    }) => reviewSubscriptionPayment({ data: v }),
    onSuccess: () => {
      toast.success(isAr ? "تم الحفظ" : "Saved");
      qc.invalidateQueries({ queryKey: ["admin", "sub-payments"] });
      setRejectId(null);
      setReason("");
      setApproveId(null);
      setApproveNote("");
      setRejectNote("");
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  const refundMut = useMutation({
    mutationFn: (v: { id: string; amount: number; reason: string; note?: string }) =>
      refundSubscriptionPayment({ data: v }),
    onSuccess: () => {
      toast.success(isAr ? "تم تسجيل الاسترداد" : "Refund recorded");
      qc.invalidateQueries({ queryKey: ["admin", "sub-payments"] });
      setRefundFor(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundNote("");
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  const openReceipt = async (path: string) => {
    try {
      const { url } = await signReceiptUrl({ data: { path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message ?? String(e));
    }
  };

  const openPreview = async (row: any) => {
    setPreviewFor(row);
    setPreviewUrl(null);
    setPreviewSignError(null);
    setPreviewFileError(false);
    setPreviewFileLoading(true);
    setPreviewLoading(true);
    setZoom(1);
    setPdfPage(1);
    try {
      const { url } = await signReceiptUrl({ data: { path: row.receipt_url } });
      setPreviewUrl(url);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setPreviewSignError(msg);
      toast.error(msg);
    } finally {
      setPreviewLoading(false);
    }
  };

  const retryPreview = () => {
    if (previewFor) openPreview(previewFor);
  };

  const [downloading, setDownloading] = useState(false);
  const downloadReceipt = async () => {
    if (!previewUrl || !previewFor) return;
    const path: string = previewFor.receipt_url ?? "";
    const ext = path.split(".").pop()?.split("?")[0] || "bin";
    const base = previewFor.organizations?.name?.replace(/\s+/g, "_") || "receipt";
    const filename = `${base}-${previewFor.id?.slice(0, 8) ?? "file"}.${ext}`;
    setDownloading(true);
    try {
      const res = await fetch(previewUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  };

  const isPdf = (u?: string | null) => !!u && /\.pdf($|\?)/i.test(u.split("?")[0]);

  return (
    <div
      data-testid="admin-subscription-payments"
      className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8"
    >
      <header className="mb-5 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">
            {isAr ? "طلبات دفع الاشتراكات" : "Subscription Payments"}
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {isAr
              ? "مراجعة إيصالات التحويل البنكي واعتماد الاشتراكات"
              : "Review bank transfer receipts and approve subscriptions"}
          </p>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-1 rounded-full border border-border/60 bg-card/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isAr ? t.ar : t.en}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border/60 bg-card/50 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            {isAr ? "من تاريخ" : "From date"}
          </label>
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-[160px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            {isAr ? "إلى تاريخ" : "To date"}
          </label>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-[160px]"
          />
        </div>
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="gap-1"
          >
            <X className="size-3.5" />
            {isAr ? "مسح" : "Clear"}
          </Button>
        )}
        <div className="ms-auto text-xs text-muted-foreground">
          {isAr ? "النتائج" : "Results"}: {(data?.items ?? []).length}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "المؤسسة" : "Org"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الباقة" : "Package"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المبلغ" : "Amount"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "البنك/المرجع" : "Bank / Ref"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الحالة" : "Status"}</th>
              <th className="px-4 py-2 text-end">{isAr ? "إجراء" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border/40 align-top">
                <td className="px-4 py-2 font-medium">{r.organizations?.name ?? "—"}</td>
                <td className="px-4 py-2 text-xs">{r.packages?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  {nf.format(Number(r.amount))} {r.currency}
                </td>
                <td className="px-4 py-2 text-xs">
                  <div>{r.bank_name}</div>
                  <div className="text-muted-foreground">{r.bank_reference ?? "—"}</div>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} isAr={!!isAr} />
                  {r.rejection_reason && (
                    <div className="mt-1 text-[11px] text-destructive">{r.rejection_reason}</div>
                  )}
                  {r.status === "refunded" && r.refund_amount != null && (
                    <div className="mt-1 text-[11px] text-warning">
                      {isAr ? "استرداد" : "Refunded"}: {nf.format(Number(r.refund_amount))} {r.currency}
                    </div>
                  )}
                  {r.refund_reason && (
                    <div className="text-[11px] text-muted-foreground">{r.refund_reason}</div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPreview(r)}
                      className="gap-1"
                    >
                      <Eye className="size-3.5" />
                      {isAr ? "معاينة" : "Preview"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openReceipt(r.receipt_url)}
                      className="gap-1"
                    >
                      <ExternalLink className="size-3.5" />
                      {isAr ? "فتح" : "Open"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAuditId(r.id)}
                      className="gap-1"
                    >
                      <History className="size-3.5" />
                      {isAr ? "السجل" : "History"}
                    </Button>
                    {r.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setApproveId(r.id);
                            setApproveNote("");
                          }}
                          disabled={mut.isPending}
                          className="gap-1"
                        >
                          <CheckCircle2 className="size-3.5" />
                          {isAr ? "اعتماد" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setRejectId(r.id);
                            setReason("");
                            setRejectNote("");
                          }}
                          className="gap-1"
                        >
                          <XCircle className="size-3.5" />
                          {isAr ? "رفض" : "Reject"}
                        </Button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRefundFor(r);
                          setRefundAmount(String(r.amount));
                          setRefundReason("");
                          setRefundNote("");
                        }}
                        className="gap-1 border-warning/50 text-warning hover:bg-warning/10"
                      >
                        <Undo2 className="size-3.5" />
                        {isAr ? "استرداد" : "Refund"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(data?.items ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  {isAr ? "لا توجد طلبات" : "No payments"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!refundFor} onOpenChange={(o) => !o && setRefundFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isAr ? "تسجيل استرداد" : "Record refund"}
              {refundFor?.organizations?.name ? ` — ${refundFor.organizations.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
              {isAr ? "المبلغ الأصلي" : "Original amount"}:{" "}
              <span className="font-semibold">
                {refundFor ? `${nf.format(Number(refundFor.amount))} ${refundFor.currency}` : ""}
              </span>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {isAr ? "مبلغ الاسترداد (إلزامي)" : "Refund amount (required)"}
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={refundFor?.amount ?? undefined}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {isAr
                  ? "يجب أن يكون أقل من أو يساوي المبلغ الأصلي"
                  : "Must be less than or equal to the original amount"}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {isAr ? "سبب الاسترداد (إلزامي)" : "Refund reason (required)"}
              </label>
              <Textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={
                  isAr ? "سبب واضح يظهر في سجل التدقيق" : "Clear reason kept in the audit log"
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {isAr ? "ملاحظات داخلية (اختياري)" : "Internal note (optional)"}
              </label>
              <Textarea
                value={refundNote}
                onChange={(e) => setRefundNote(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundFor(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={
                refundMut.isPending ||
                !refundReason.trim() ||
                !(Number(refundAmount) > 0) ||
                (refundFor && Number(refundAmount) > Number(refundFor.amount))
              }
              onClick={() =>
                refundFor &&
                refundMut.mutate({
                  id: refundFor.id,
                  amount: Number(refundAmount),
                  reason: refundReason.trim(),
                  note: refundNote.trim() || undefined,
                })
              }
              className="bg-warning hover:bg-warning/90"
            >
              {isAr ? "تأكيد الاسترداد" : "Confirm refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectId} onOpenChange={(o) => !o && setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "سبب الرفض" : "Rejection reason"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium">
                {isAr ? "السبب (إلزامي)" : "Reason (required)"}
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={
                  isAr
                    ? "اكتب سبباً واضحاً يظهر للمرسل"
                    : "Write a clear reason visible to the sender"
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {isAr ? "ملاحظات داخلية (اختياري)" : "Internal note (optional)"}
              </label>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={isAr ? "ملاحظات للسجل فقط" : "Kept in the audit log"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || mut.isPending}
              onClick={() =>
                rejectId &&
                mut.mutate({
                  id: rejectId,
                  decision: "reject",
                  reason: reason.trim(),
                  note: rejectNote.trim() || undefined,
                })
              }
            >
              {isAr ? "تأكيد الرفض" : "Confirm reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approveId} onOpenChange={(o) => !o && setApproveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "اعتماد الطلب" : "Approve payment"}</DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-xs font-medium">
              {isAr ? "ملاحظات (اختياري)" : "Note (optional)"}
            </label>
            <Textarea
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={isAr ? "تظهر في سجل التدقيق فقط" : "Stored in the audit log"}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveId(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={mut.isPending}
              onClick={() =>
                approveId &&
                mut.mutate({
                  id: approveId,
                  decision: "approve",
                  note: approveNote.trim() || undefined,
                })
              }
            >
              {isAr ? "تأكيد الاعتماد" : "Confirm approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!auditId} onOpenChange={(o) => !o && setAuditId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isAr ? "سجل تدقيق الطلب" : "Payment audit log"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-auto text-xs">
            {auditQ.isLoading && (
              <div className="text-muted-foreground">{isAr ? "جارٍ التحميل..." : "Loading..."}</div>
            )}
            {(auditQ.data?.items ?? []).map((row: any) => (
              <div key={row.id} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{row.action}</span>
                  <span className="text-muted-foreground">
                    {new Date(row.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {isAr ? "الحالة" : "Status"}: {row.from_status ?? "—"} → {row.to_status ?? "—"}
                </div>
                {row.note && (
                  <div className="mt-1 text-destructive">
                    {isAr ? "ملاحظة" : "Note"}: {row.note}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {isAr ? "المستخدم" : "Actor"}: {row.actor ?? "—"}
                </div>
              </div>
            ))}
            {!auditQ.isLoading && (auditQ.data?.items ?? []).length === 0 && (
              <div className="py-6 text-center text-muted-foreground">
                {isAr ? "لا توجد سجلات" : "No entries"}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditId(null)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet
        open={!!previewFor}
        onOpenChange={(o) => {
          if (!o) {
            setPreviewFor(null);
            setPreviewUrl(null);
            setPreviewSignError(null);
            setPreviewFileError(false);
            setPreviewFileLoading(false);
          }
        }}
      >
        <SheetContent
          side={isAr ? "left" : "right"}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <SheetHeader className="border-b border-border/60 px-5 py-4">
            <SheetTitle className="text-base">
              {isAr ? "معاينة الإيصال" : "Receipt preview"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {previewFor?.organizations?.name ?? ""}
              {previewFor
                ? ` · ${nf.format(Number(previewFor.amount))} ${previewFor.currency}`
                : ""}
            </SheetDescription>
          </SheetHeader>
          <div ref={previewBoxRef} className="relative flex-1 overflow-auto bg-muted/30">
            {previewLoading && (
              <div className="space-y-3 p-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-[60vh] w-full" />
              </div>
            )}

            {!previewLoading && previewSignError && (
              <div className="grid h-full place-items-center p-6">
                <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                  <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" />
                  <div className="text-sm font-medium text-destructive">
                    {isAr ? "تعذّر تحميل الإيصال" : "Could not load receipt"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground break-words">
                    {previewSignError}
                  </div>
                  <Button size="sm" variant="outline" onClick={retryPreview} className="mt-3 gap-1">
                    <RefreshCw className="size-3.5" />
                    {isAr ? "إعادة المحاولة" : "Retry"}
                  </Button>
                </div>
              </div>
            )}

            {!previewLoading && previewUrl && !previewSignError && (
              <>
                {previewFileLoading && !previewFileError && (
                  <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/60 backdrop-blur-sm">
                    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground shadow">
                      <Loader2 className="size-3.5 animate-spin" />
                      {isAr ? "جارٍ تحميل الملف..." : "Loading file..."}
                    </div>
                  </div>
                )}

                {previewFileError ? (
                  <div className="grid h-full place-items-center p-6">
                    <div className="max-w-sm rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                      <AlertTriangle className="mx-auto mb-2 size-6 text-destructive" />
                      <div className="text-sm font-medium text-destructive">
                        {isAr
                          ? "فشل عرض الملف داخل المتصفح"
                          : "Failed to display the file in the browser"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {isAr
                          ? "قد يكون الملف محذوفاً أو غير مدعوم للمعاينة."
                          : "The file may be missing or unsupported for inline preview."}
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={retryPreview}
                          className="gap-1"
                        >
                          <RefreshCw className="size-3.5" />
                          {isAr ? "إعادة" : "Retry"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                          className="gap-1"
                        >
                          <ExternalLink className="size-3.5" />
                          {isAr ? "فتح في تبويب" : "Open in tab"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : isPdf(previewFor?.receipt_url) ? (
                  <iframe
                    key={`${previewUrl}#p${pdfPage}`}
                    src={`${previewUrl}#page=${pdfPage}&view=FitH`}
                    title={isAr ? "الإيصال" : "Receipt"}
                    className="h-full min-h-[70vh] w-full border-0"
                    onLoad={() => setPreviewFileLoading(false)}
                    onError={() => {
                      setPreviewFileLoading(false);
                      setPreviewFileError(true);
                    }}
                  />
                ) : (
                  <div
                    className="min-h-[70vh] overflow-auto p-4"
                    onWheel={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        setZoom((z) =>
                          Math.min(5, Math.max(0.25, z + (e.deltaY < 0 ? 0.1 : -0.1))),
                        );
                      }
                    }}
                  >
                    <div className="grid min-h-full place-items-center">
                      <img
                        key={previewUrl}
                        src={previewUrl}
                        alt={
                          isAr
                            ? `إيصال ${previewFor.organizations?.name ?? ""} — مرجع ${previewFor.bank_reference ?? previewFor.id?.slice(0, 8) ?? ""}`
                            : `Receipt ${previewFor.organizations?.name ?? ""} — ref ${previewFor.bank_reference ?? previewFor.id?.slice(0, 8) ?? ""}`
                        }
                        style={{
                          transform: `scale(${zoom})`,
                          transformOrigin: "center center",
                          transition: "transform 120ms ease-out",
                        }}
                        className="max-h-none max-w-none rounded-lg shadow"
                        onLoad={() => setPreviewFileLoading(false)}
                        onError={() => {
                          setPreviewFileLoading(false);
                          setPreviewFileError(true);
                        }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {previewUrl && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
              <div className="flex items-center gap-1">
                {isPdf(previewFor?.receipt_url) ? (
                  <>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-8"
                      onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                      disabled={pdfPage <= 1}
                      aria-label={isAr ? "السابقة" : "Previous"}
                    >
                      <ChevronLeft className="size-3.5" />
                    </Button>
                    <input
                      type="number"
                      min={1}
                      value={pdfPage}
                      onChange={(e) => setPdfPage(Math.max(1, Number(e.target.value) || 1))}
                      className="h-8 w-14 rounded-md border border-border/60 bg-background px-2 text-center text-xs"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-8"
                      onClick={() => setPdfPage((p) => p + 1)}
                      aria-label={isAr ? "التالية" : "Next"}
                    >
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-8"
                      onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                      aria-label={isAr ? "تصغير" : "Zoom out"}
                    >
                      <ZoomOut className="size-3.5" />
                    </Button>
                    <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-8"
                      onClick={() => setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)))}
                      aria-label={isAr ? "تكبير" : "Zoom in"}
                    >
                      <ZoomIn className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-8"
                      onClick={() => setZoom(1)}
                      aria-label={isAr ? "إعادة الضبط" : "Reset zoom"}
                    >
                      <Maximize2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadReceipt}
                  disabled={downloading}
                  className="gap-1"
                >
                  {downloading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  {isAr ? "تنزيل" : "Download"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="gap-1"
                  aria-label={
                    isFullscreen
                      ? isAr
                        ? "خروج من ملء الشاشة"
                        : "Exit fullscreen"
                      : isAr
                        ? "ملء الشاشة"
                        : "Fullscreen"
                  }
                >
                  {isFullscreen ? (
                    <Minimize className="size-3.5" />
                  ) : (
                    <Maximize className="size-3.5" />
                  )}
                  {isFullscreen ? (isAr ? "خروج" : "Exit") : isAr ? "ملء الشاشة" : "Fullscreen"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                  className="gap-1"
                >
                  <ExternalLink className="size-3.5" />
                  {isAr ? "فتح في تبويب" : "Open in tab"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
