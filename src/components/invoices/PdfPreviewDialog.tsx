import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X, FileDown, Eye, Loader2, QrCode, FileCode, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { QrImage } from "@/components/zatca/QrImage";
// Local mirror of types from src/lib/zatca/pdf-invoice.client.ts
// (that module is browser-only and blocked from the SSR graph).
type InvoicePdfInput = {
  invoice: {
    number: string;
    issue_date: string;
    due_date?: string | null;
    zatca_uuid?: string | null;
    zatca_counter?: number | null;
    subtotal: number;
    vat_amount: number;
    total: number;
    currency: string;
    qr_tlv?: string | null;
    xml_ubl?: string | null;
    notes?: string | null;
  };
  docKind?: "invoice" | "credit_note" | "debit_note";
  reference?: { number: string; issue_date?: string | null; reason?: string | null } | null;
  seller: {
    name_ar: string;
    name_en?: string;
    vat_number?: string;
    cr_number?: string;
    address?: string;
    logo_data_url?: string | null;
  };
  buyer: {
    name: string;
    vat_number?: string;
    address?: string;
    email?: string;
    phone?: string;
  };
  lines: Array<{
    description: string;
    qty: number;
    unit_price: number;
    vat_rate: number;
    amount: number;
  }>;
};
type PdfVerifyReport = {
  ok: boolean;
  sizeKb: number;
  pages: number;
  hasQr: boolean;
  hasXmlAttachment: boolean;
  attachments: string[];
  hasUuid: boolean;
  hasTotals: boolean;
  hasSeller: boolean;
  hasBuyer: boolean;
  hijriProducer: boolean;
  issues: string[];
};

type CacheEntry = { bytes: Uint8Array; report: PdfVerifyReport; input: InvoicePdfInput };
const PDF_CACHE = new Map<string, CacheEntry>();
const PDF_CACHE_MAX = 12;
function cacheGet(key: string): CacheEntry | undefined {
  const v = PDF_CACHE.get(key);
  if (!v) return undefined;
  PDF_CACHE.delete(key);
  PDF_CACHE.set(key, v);
  return v;
}
function cacheSet(key: string, entry: CacheEntry) {
  PDF_CACHE.set(key, entry);
  while (PDF_CACHE.size > PDF_CACHE_MAX) {
    const firstKey = PDF_CACHE.keys().next().value;
    if (firstKey === undefined) break;
    PDF_CACHE.delete(firstKey);
  }
}
/** Invalidate cached PDFs. Call after regenerate/seal/edit. */
export function invalidatePdfCache(prefix?: string) {
  if (!prefix) { PDF_CACHE.clear(); return; }
  for (const k of Array.from(PDF_CACHE.keys())) {
    if (k.startsWith(prefix)) PDF_CACHE.delete(k);
  }
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filename: string;
  /** Stable signature — same key ⇒ reuse cached PDF instead of rebuilding. */
  cacheKey?: string;
  /** Called lazily to build the PDF input when the dialog opens (cache miss only). */
  buildInput: () => Promise<InvoicePdfInput>;
};

export function PdfPreviewDialog({ open, onOpenChange, filename, cacheKey, buildInput }: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [report, setReport] = useState<PdfVerifyReport | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [input, setInput] = useState<InvoicePdfInput | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [xmlOpen, setXmlOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let revoked: string | null = null;
    let cancelled = false;
    setError(null);

    const hit = cacheKey ? cacheGet(cacheKey) : undefined;
    if (hit) {
      const blob = new Blob([hit.bytes as BlobPart], { type: "application/pdf" });
      const u = URL.createObjectURL(blob);
      revoked = u;
      setBytes(hit.bytes);
      setUrl(u);
      setReport(hit.report);
      setInput(hit.input);
      setFromCache(true);
      setLoading(false);
    } else {
      setLoading(true);
      setReport(null);
      setUrl(null);
      setBytes(null);
      setInput(null);
      setFromCache(false);

      (async () => {
        try {
          const built = await buildInput();
          const { generateInvoicePdf, verifyInvoicePdf } = await import("@/lib/zatca/pdf-invoice");
          const b = await generateInvoicePdf(built);
          const r = await verifyInvoicePdf(b, built);
          if (cancelled) return;
          if (cacheKey) cacheSet(cacheKey, { bytes: b, report: r, input: built });
          const blob = new Blob([b as BlobPart], { type: "application/pdf" });
          const u = URL.createObjectURL(blob);
          revoked = u;
          setBytes(b);
          setUrl(u);
          setReport(r);
          setInput(built);
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cacheKey]);

  const qrTlv = input?.invoice.qr_tlv ?? null;
  const xmlUbl = input?.invoice.xml_ubl ?? null;

  const xmlBlobUrl = useMemo(() => {
    if (!xmlUbl) return null;
    return URL.createObjectURL(new Blob([xmlUbl], { type: "application/xml" }));
  }, [xmlUbl]);
  useEffect(() => () => { if (xmlBlobUrl) URL.revokeObjectURL(xmlBlobUrl); }, [xmlBlobUrl]);

  const copyText = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(isAr ? `تم نسخ ${label}` : `Copied ${label}`);
  };

  const downloadXml = () => {
    if (!xmlUbl) return;
    const a = document.createElement("a");
    a.href = xmlBlobUrl!;
    a.download = filename.replace(/\.pdf$/i, "") + ".xml";
    a.click();
  };


  const download = () => {
    if (!bytes) return;
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            {isAr ? "معاينة والتحقق من الفاتورة" : "Invoice Preview & Verify"}
            {report && (
              <Badge variant={report.ok ? "default" : "destructive"} className="ms-2">
                {report.ok
                  ? (isAr ? "متوافقة" : "Compliant")
                  : (isAr ? `${report.issues.length} تنبيه` : `${report.issues.length} issue(s)`)}
              </Badge>
            )}
            {fromCache && !loading && (
              <Badge variant="outline" className="ms-1 text-[10px]">
                {isAr ? "من الذاكرة المؤقتة" : "cached"}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 min-h-0">
          {/* Verification panel */}
          <aside className="md:col-span-1 border rounded-md p-3 overflow-auto space-y-2 bg-muted/20">
            <h3 className="text-sm font-semibold mb-1">
              {isAr ? "قائمة التحقق" : "Compliance checks"}
            </h3>
            {loading || !report ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isAr ? "جارٍ البناء والتحقق…" : "Building & verifying…"}
              </div>
            ) : (
              <>
                <CheckRow ok={report.hasQr}    label={isAr ? "رمز ZATCA QR" : "ZATCA QR code"} />
                <CheckRow ok={report.hasXmlAttachment} label={isAr ? "XML مضمّن (PDF/A-3)" : "Embedded UBL XML"} />
                <CheckRow ok={report.hasUuid}  label={isAr ? "معرّف ZATCA UUID" : "ZATCA UUID"} />
                <CheckRow ok={report.hasTotals} label={isAr ? "الإجماليات وضريبة القيمة المضافة" : "Totals & VAT"} />
                <CheckRow ok={report.hasSeller} label={isAr ? "بيانات البائع" : "Seller details"} />
                <CheckRow ok={report.hasBuyer}  label={isAr ? "بيانات العميل" : "Buyer details"} />

                <div className="pt-2 border-t mt-2 text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>{isAr ? "الحجم" : "Size"}</span>
                    <span className="font-mono">{report.sizeKb} KB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{isAr ? "الصفحات" : "Pages"}</span>
                    <span className="font-mono">{report.pages}</span>
                  </div>
                  {report.attachments.length > 0 && (
                    <div>
                      <div className="mb-1">{isAr ? "المرفقات" : "Attachments"}:</div>
                      <ul className="ps-3 list-disc space-y-0.5">
                        {report.attachments.map((n) => (
                          <li key={n} className="font-mono text-[11px] break-all">{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {report.issues.length > 0 && (
                  <div className="mt-2 p-2 border border-destructive/40 bg-destructive/5 rounded text-xs space-y-1">
                    <div className="font-semibold text-destructive">
                      {isAr ? "تنبيهات:" : "Issues:"}
                    </div>
                    <ul className="ps-3 list-disc">
                      {report.issues.map((i) => <li key={i}>{i}</li>)}
                    </ul>
                  </div>
                )}
              </>
            )}
          </aside>

          {/* PDF preview */}
          <div className="md:col-span-2 border rounded-md overflow-hidden bg-muted/30 min-h-[400px]">
            {error ? (
              <div className="p-6 text-sm text-destructive">{error}</div>
            ) : url ? (
              <iframe
                src={url}
                className="w-full h-full"
                title={filename}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin me-2" />
                {isAr ? "جارٍ التوليد…" : "Generating…"}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={!qrTlv}
              onClick={() => setQrOpen(true)}
              title={!qrTlv ? (isAr ? "لا يوجد QR" : "No QR") : undefined}
            >
              <QrCode className="h-4 w-4 me-1" />
              {isAr ? "معاينة QR" : "View QR"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!xmlUbl}
              onClick={() => setXmlOpen(true)}
              title={!xmlUbl ? (isAr ? "لا يوجد XML" : "No XML") : undefined}
            >
              <FileCode className="h-4 w-4 me-1" />
              {isAr ? "معاينة XML" : "View XML"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
            <Button onClick={download} disabled={!bytes}>
              <FileDown className="h-4 w-4 me-1" />
              {isAr ? "تنزيل PDF" : "Download PDF"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* QR sub-dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-md" dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              {isAr ? "رمز ZATCA QR" : "ZATCA QR"}
            </DialogTitle>
          </DialogHeader>
          {qrTlv ? (
            <div className="space-y-3">
              <div className="flex justify-center p-4 bg-white rounded-md">
                <QrImage value={qrTlv} size={260} alt="ZATCA QR" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {isAr ? "بيانات TLV (Base64)" : "TLV payload (Base64)"}
                </div>
                <textarea
                  readOnly
                  value={qrTlv}
                  className="w-full h-24 text-[11px] font-mono p-2 border rounded-md bg-muted/30 break-all"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => copyText("QR TLV", qrTlv)}>
                  <Copy className="h-4 w-4 me-1" />
                  {isAr ? "نسخ" : "Copy"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isAr ? "لا يوجد رمز QR." : "No QR available."}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* XML sub-dialog */}
      <Dialog open={xmlOpen} onOpenChange={setXmlOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col" dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              {isAr ? "XML (UBL 2.1)" : "UBL 2.1 XML"}
              {xmlUbl && (
                <Badge variant="outline" className="ms-1 text-[10px]">
                  {(new Blob([xmlUbl]).size / 1024).toFixed(1)} KB
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {xmlUbl && xmlBlobUrl ? (
            <>
              <pre className="flex-1 overflow-auto text-[11px] font-mono p-3 border rounded-md bg-muted/30 whitespace-pre-wrap break-all">
                {xmlUbl}
              </pre>
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => copyText("XML", xmlUbl)}>
                  <Copy className="h-4 w-4 me-1" />
                  {isAr ? "نسخ" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={xmlBlobUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 me-1" />
                    {isAr ? "فتح في نافذة" : "Open in tab"}
                  </a>
                </Button>
                <Button size="sm" onClick={downloadXml}>
                  <FileDown className="h-4 w-4 me-1" />
                  {isAr ? "تنزيل XML" : "Download XML"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isAr ? "لا يوجد XML متاح." : "No XML available."}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <Check className="h-4 w-4 text-success shrink-0" />
      ) : (
        <X className="h-4 w-4 text-destructive shrink-0" />
      )}
      <span className={ok ? "" : "text-destructive"}>{label}</span>
    </div>
  );
}
