import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ShieldCheck, RefreshCw, Copy, Download, FileCode, QrCode, ChevronLeft, Lock, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { HijriDateBadge } from "@/components/ui/hijri-date-badge";
import { QrImage } from "@/components/zatca/QrImage";
import {
  generateZatcaInvoice,
  getZatcaBundle,
  getInvoicePartiesForPdf,
  sealZatcaInvoice,
} from "@/lib/invoices-zatca.functions";
import { InvoiceNotesSection } from "@/components/invoices/InvoiceNotesSection";
import { PdfPreviewDialog, invalidatePdfCache } from "@/components/invoices/PdfPreviewDialog";
import { FileDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/invoices/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الفاتورة — ZATCA" },
      { name: "description", content: "عرض بيانات فاتورة إلكترونية متوافقة مع هيئة الزكاة والضريبة والجمارك (Phase-2)." },
    ],
  }),
  component: InvoiceDetailPage,
});

type Bundle = Awaited<ReturnType<typeof getZatcaBundle>>;

const STATUS_LABEL: Record<string, { ar: string; en: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:    { ar: "مسودة",    en: "Draft",    variant: "secondary" },
  reported: { ar: "مُبلّغة",   en: "Reported", variant: "default"   },
  cleared:  { ar: "مُخلّصة",   en: "Cleared",  variant: "default"   },
  rejected: { ar: "مرفوضة",   en: "Rejected", variant: "destructive" },
};

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const [xmlOpen, setXmlOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const bundleQ = useQuery({
    queryKey: ["invoice-zatca", id],
    queryFn: () => getZatcaBundle({ data: { invoiceId: id } }),
  });

  const genMut = useMutation({
    mutationFn: () => generateZatcaInvoice({ data: { invoiceId: id } }),
    onSuccess: () => {
      toast.success(isAr ? "تم توليد بيانات ZATCA" : "ZATCA payload generated");
      invalidatePdfCache(`inv:${id}`);
      qc.invalidateQueries({ queryKey: ["invoice-zatca", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sealMut = useMutation({
    mutationFn: () => sealZatcaInvoice({ data: { invoiceId: id } }),
    onSuccess: (res) => {
      toast.success(
        isAr
          ? `تم ختم الفاتورة #${res.counter}`
          : `Invoice sealed #${res.counter}`,
      );
      invalidatePdfCache(`inv:${id}`);
      qc.invalidateQueries({ queryKey: ["invoice-zatca", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const b = bundleQ.data as Bundle | undefined;
  const status = STATUS_LABEL[b?.zatca_status ?? "draft"];
  const isSealed = !!b?.zatca_counter;

  const copy = (label: string, value?: string | null) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast.success(isAr ? `تم نسخ ${label}` : `Copied ${label}`);
  };

  const download = (name: string, mime: string, value?: string | null) => {
    if (!value) return;
    const blob = new Blob([value], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pdfMut = useMutation({
    mutationFn: async () => {
      if (!b) throw new Error("No invoice data");
      const parties = await getInvoicePartiesForPdf({ data: { invoiceId: id } });
      const { generateInvoicePdf, downloadPdfBlob } = await import("@/lib/zatca/pdf-invoice");
      const bytes = await generateInvoicePdf({
        invoice: {
          number: b.number ?? id,
          issue_date: b.issue_date ?? "",
          due_date: b.due_date ?? null,
          zatca_uuid: b.zatca_uuid,
          zatca_counter: b.zatca_counter,
          subtotal: Number(b.subtotal ?? 0),
          vat_amount: Number(b.vat_amount ?? 0),
          total: Number(b.total ?? 0),
          currency: b.currency ?? "SAR",
          qr_tlv: b.qr_tlv,
          xml_ubl: b.xml_ubl,
          notes: b.notes ?? null,
        },
        seller: parties.seller,
        buyer: parties.buyer,
        lines: [
          {
            description: b.description || (isAr ? "خدمة" : "Service"),
            qty: 1,
            unit_price: Number(b.subtotal ?? 0),
            vat_rate: Number(b.vat_rate ?? 15),
            amount: Number(b.subtotal ?? 0),
          },
        ],
      });
      downloadPdfBlob(bytes, `invoice-${b.number ?? id}.pdf`);
    },
    onError: (e: Error) => toast.error(e.message),
    onSuccess: () => toast.success(isAr ? "تم تنزيل PDF" : "PDF downloaded"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/dashboard" className="hover:underline inline-flex items-center gap-1">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          {isAr ? "لوحة التحكم" : "Dashboard"}
        </Link>
        <span>/</span>
        <span>{isAr ? "الفواتير" : "Invoices"}</span>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isAr ? "فاتورة" : "Invoice"} #{b?.number ?? "…"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {b?.issue_date} · {b?.total ?? 0} {b?.currency ?? "SAR"}
            {isSealed && (
              <> · <span className="font-mono">#{b?.zatca_counter}</span></>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            disabled={!b}
          >
            <Eye className="h-4 w-4 me-1" />
            {isAr ? "معاينة وتحقق" : "Preview & Verify"}
          </Button>
          <Button
            variant="outline"
            onClick={() => pdfMut.mutate()}
            disabled={pdfMut.isPending || !b}
          >
            <FileDown className={`h-4 w-4 me-1 ${pdfMut.isPending ? "animate-pulse" : ""}`} />
            {isAr ? "تنزيل PDF" : "Download PDF"}
          </Button>
          <Button
            variant="outline"
            onClick={() => genMut.mutate()}
            disabled={genMut.isPending || isSealed}
            title={isSealed ? (isAr ? "الفاتورة مختومة" : "Invoice sealed") : undefined}
          >
            <RefreshCw className={`h-4 w-4 me-1 ${genMut.isPending ? "animate-spin" : ""}`} />
            {isAr ? "توليد/تحديث" : "Generate"}
          </Button>
          <Button
            onClick={() => sealMut.mutate()}
            disabled={sealMut.isPending || !b?.zatca_hash || isSealed}
          >
            <Lock className={`h-4 w-4 me-1 ${sealMut.isPending ? "animate-pulse" : ""}`} />
            {isSealed
              ? (isAr ? "مختومة" : "Sealed")
              : (isAr ? "ختم نهائي" : "Seal")}
          </Button>
        </div>
      </header>

      <InvoiceDetailsCard bundle={b} isAr={isAr} />




      <Card className="p-4 md:p-6 space-y-4 border-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {isAr ? "بطاقة ZATCA — المرحلة الثانية" : "ZATCA Phase-2"}
            </h2>
          </div>
          <Badge variant={status.variant}>
            {isAr ? status.ar : status.en}
          </Badge>
        </div>

        {bundleQ.isLoading ? (
          <div className="text-sm text-muted-foreground p-6 text-center">
            {isAr ? "جارٍ التحميل…" : "Loading…"}
          </div>
        ) : !b?.zatca_uuid ? (
          <div className="text-sm text-muted-foreground p-6 text-center border rounded-md">
            {isAr
              ? "لم يتم توليد بيانات ZATCA بعد. اضغط \"توليد/تحديث\" لبناء XML و QR والهاش."
              : "No ZATCA payload yet. Click \"Generate\" to build XML, QR, and chained hash."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={isAr ? "المُعرّف (UUID)" : "UUID"} value={b.zatca_uuid} onCopy={() => copy("UUID", b.zatca_uuid)} />
              <Field label={isAr ? "النوع" : "Type"} value={b.invoice_type ?? "standard"} />
              <Field
                label={isAr ? "الهاش الحالي" : "Current hash"}
                value={b.zatca_hash}
                mono truncate
                onCopy={() => copy("hash", b.zatca_hash)}
              />
              <Field
                label={isAr ? "الهاش السابق" : "Previous hash"}
                value={b.previous_hash}
                mono truncate
                onCopy={() => copy("previous_hash", b.previous_hash)}
              />
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {isAr ? "تاريخ التبليغ" : "Reported at"}
                </div>
                {b.zatca_reported_at ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{new Date(b.zatca_reported_at).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>
                    <HijriDateBadge date={b.zatca_reported_at.slice(0, 10)} />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {isAr ? "لم يُبلَّغ بعد" : "Not reported"}
                  </span>
                )}
              </div>
            </div>

            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="h-4 w-4" /> {isAr ? "رمز QR (TLV — Base64)" : "QR TLV (Base64)"}
              </div>
              <div className="flex flex-col md:flex-row gap-4">
                {b.qr_tlv && (
                  <div className="shrink-0 self-center md:self-start">
                    <QrImage value={b.qr_tlv} size={200} alt={`Invoice ${b.number ?? ""} QR`} />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-2">
                  <pre className="text-xs font-mono bg-muted/40 p-2 rounded overflow-x-auto break-all whitespace-pre-wrap max-h-32">
                    {b.qr_tlv ?? "—"}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy("QR TLV", b.qr_tlv)} disabled={!b.qr_tlv}>
                      <Copy className="h-3.5 w-3.5 me-1" /> {isAr ? "نسخ" : "Copy"}
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => download(`invoice-${b.number}-qr.txt`, "text/plain", b.qr_tlv)}
                      disabled={!b.qr_tlv}
                    >
                      <Download className="h-3.5 w-3.5 me-1" /> {isAr ? "تنزيل TLV" : "Download TLV"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>


            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileCode className="h-4 w-4" /> {isAr ? "UBL 2.1 XML" : "UBL 2.1 XML"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Dialog open={xmlOpen} onOpenChange={setXmlOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" disabled={!b.xml_ubl}>
                      <FileCode className="h-3.5 w-3.5 me-1" /> {isAr ? "عرض XML" : "View XML"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>UBL 2.1 — {b.number}</DialogTitle>
                    </DialogHeader>
                    <pre className="text-xs font-mono bg-muted/40 p-3 rounded overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">
                      {b.xml_ubl ?? "—"}
                    </pre>
                  </DialogContent>
                </Dialog>
                <Button size="sm" variant="outline" onClick={() => copy("XML", b.xml_ubl)} disabled={!b.xml_ubl}>
                  <Copy className="h-3.5 w-3.5 me-1" /> {isAr ? "نسخ" : "Copy"}
                </Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => download(`invoice-${b.number}.xml`, "application/xml", b.xml_ubl)}
                  disabled={!b.xml_ubl}
                >
                  <Download className="h-3.5 w-3.5 me-1" /> {isAr ? "تنزيل XML" : "Download XML"}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {isAr
                ? "ملاحظة: الإرسال لهيئة الزكاة (Fatoora API) والتوقيع الرقمي (XAdES + CSID) سيُفعّل في مرحلة لاحقة."
                : "Note: Fatoora API submission and XAdES/CSID signing will be enabled in a later wave."}
            </p>
          </>
        )}
      </Card>

      <InvoiceNotesSection invoiceId={id} invoiceNumber={b?.number ?? id} />
    </div>
  );
}

function Field({
  label, value, onCopy, mono, truncate,
}: {
  label: string;
  value: string | null | undefined;
  onCopy?: () => void;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[24rem]" : ""}`}
          title={value ?? ""}
        >
          {value ?? "—"}
        </span>
        {onCopy && value && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function InvoiceDetailsCard({ bundle, isAr }: { bundle: Bundle | undefined; isAr: boolean }) {
  if (!bundle) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center">
        {isAr ? "جارٍ التحميل…" : "Loading…"}
      </Card>
    );
  }
  const b = bundle;
  const fmtMoney = (n: number | string | null | undefined) =>
    new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0));
  const invStatusMap: Record<string, { ar: string; en: string; cls: string }> = {
    draft:     { ar: "مسودة",    en: "Draft",     cls: "bg-muted text-foreground" },
    sent:      { ar: "مُرسلة",   en: "Sent",      cls: "bg-primary/15 text-primary" },
    paid:      { ar: "مدفوعة",   en: "Paid",      cls: "bg-emerald-500/15 text-emerald-600" },
    overdue:   { ar: "متأخرة",   en: "Overdue",   cls: "bg-amber-500/15 text-amber-600" },
    cancelled: { ar: "ملغاة",    en: "Cancelled", cls: "bg-destructive/15 text-destructive" },
  };
  const st = invStatusMap[(b.status as string) ?? "draft"] ?? invStatusMap.draft;
  const subtotal = Number(b.subtotal ?? 0);
  const vatAmount = Number(b.vat_amount ?? 0);
  const total = Number(b.total ?? 0);
  const cur = b.currency ?? "SAR";
  const buyer = b.buyer as null | { full_name: string | null; email: string | null; phone: string | null; vat_number: string | null };
  const isRejected = b.zatca_status === "rejected";

  return (
    <div className="space-y-4">
      {isRejected && (
        <Card className="p-4 border-destructive border-2 bg-destructive/5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-8 w-8 rounded-full bg-destructive/15 flex items-center justify-center text-destructive font-bold">!</div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-destructive">
                {isAr ? "الفاتورة مرفوضة من هيئة الزكاة" : "Invoice rejected by ZATCA"}
              </h3>
              <p className="mt-1 text-sm">
                {b.zatca_rejection_reason ?? (isAr ? "لم يُسجَّل سبب الرفض بعد." : "No rejection reason recorded yet.")}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{isAr ? "تفاصيل الفاتورة" : "Invoice details"}</h2>
          <span className={`text-xs px-2 py-1 rounded-md font-medium ${st.cls}`}>
            {isAr ? st.ar : st.en}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Meta label={isAr ? "رقم الفاتورة" : "Invoice #"} value={b.number} mono />
          <Meta label={isAr ? "تاريخ الإصدار" : "Issue date"} value={b.issue_date} />
          <Meta label={isAr ? "تاريخ الاستحقاق" : "Due date"} value={b.due_date ?? "—"} />
          <Meta label={isAr ? "تاريخ السداد" : "Paid at"} value={b.paid_at ?? "—"} />
          <Meta label={isAr ? "النوع (ZATCA)" : "Type"} value={b.invoice_type ?? "—"} />
          <Meta label={isAr ? "حالة ZATCA" : "ZATCA status"} value={b.zatca_status ?? "—"} />
          <Meta label={isAr ? "تاريخ الإرسال" : "Reported at"} value={b.zatca_reported_at ? new Date(b.zatca_reported_at).toLocaleString(isAr ? "ar-SA" : "en-US") : "—"} />
          <Meta label={isAr ? "تاريخ الختم" : "Sealed at"} value={b.zatca_sealed_at ? new Date(b.zatca_sealed_at).toLocaleString(isAr ? "ar-SA" : "en-US") : "—"} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border rounded-md p-3 space-y-1">
            <div className="text-xs text-muted-foreground">{isAr ? "العميل" : "Buyer"}</div>
            <div className="text-sm font-semibold">{buyer?.full_name ?? "—"}</div>
            {buyer?.vat_number && (
              <div className="text-xs">
                {isAr ? "الرقم الضريبي" : "VAT"}: <span className="font-mono">{buyer.vat_number}</span>
              </div>
            )}
            {(buyer?.email || buyer?.phone) && (
              <div className="text-xs text-muted-foreground">
                {[buyer?.email, buyer?.phone].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <div className="border rounded-md p-3 space-y-1">
            <div className="text-xs text-muted-foreground">{isAr ? "الوصف" : "Description"}</div>
            <div className="text-sm whitespace-pre-wrap">{b.description || (isAr ? "—" : "—")}</div>
            {b.notes && (
              <>
                <div className="text-xs text-muted-foreground mt-2">{isAr ? "ملاحظات" : "Notes"}</div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap">{b.notes}</div>
              </>
            )}
          </div>
        </div>

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-start p-2">{isAr ? "الوصف" : "Description"}</th>
                <th className="text-end p-2 w-16">{isAr ? "الكمية" : "Qty"}</th>
                <th className="text-end p-2 w-28">{isAr ? "السعر" : "Unit price"}</th>
                <th className="text-end p-2 w-20">{isAr ? "ض.ق.م" : "VAT %"}</th>
                <th className="text-end p-2 w-28">{isAr ? "الإجمالي" : "Total"}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-2">{b.description || (isAr ? "خدمة" : "Service")}</td>
                <td className="p-2 text-end">1</td>
                <td className="p-2 text-end font-mono">{fmtMoney(subtotal)}</td>
                <td className="p-2 text-end">{Number(b.vat_rate ?? 15)}%</td>
                <td className="p-2 text-end font-mono font-semibold">{fmtMoney(subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-full md:w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
              <span className="font-mono">{fmtMoney(subtotal)} {cur}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{isAr ? "الضريبة" : "VAT"} ({Number(b.vat_rate ?? 15)}%)</span>
              <span className="font-mono">{fmtMoney(vatAmount)} {cur}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-bold">
              <span>{isAr ? "الإجمالي" : "Total"}</span>
              <span className="font-mono">{fmtMoney(total)} {cur}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}
