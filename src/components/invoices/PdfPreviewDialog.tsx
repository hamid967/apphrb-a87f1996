import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X, FileDown, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
// Types are duplicated here (not imported) because pdf-invoice.client.ts
// is a browser-only module blocked from the SSR module graph.
type InvoicePdfInput = Parameters<
  typeof import("@/lib/zatca/pdf-invoice.client")["generateInvoicePdf"]
>[0];
type PdfVerifyReport = Awaited<
  ReturnType<typeof import("@/lib/zatca/pdf-invoice.client")["verifyInvoicePdf"]>
>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filename: string;
  /** Called lazily to build the PDF input when the dialog opens. */
  buildInput: () => Promise<InvoicePdfInput>;
};

export function PdfPreviewDialog({ open, onOpenChange, filename, buildInput }: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [report, setReport] = useState<PdfVerifyReport | null>(null);

  useEffect(() => {
    if (!open) return;
    let revoked: string | null = null;
    setLoading(true);
    setError(null);
    setReport(null);
    setUrl(null);
    setBytes(null);

    (async () => {
      try {
        const input = await buildInput();
        const { generateInvoicePdf, verifyInvoicePdf } = await import("@/lib/zatca/pdf-invoice.client");
        const b = await generateInvoicePdf(input);
        const r = await verifyInvoicePdf(b, input);
        const blob = new Blob([b as BlobPart], { type: "application/pdf" });
        const u = URL.createObjectURL(blob);
        revoked = u;
        setBytes(b);
        setUrl(u);
        setReport(r);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
          <Button onClick={download} disabled={!bytes}>
            <FileDown className="h-4 w-4 me-1" />
            {isAr ? "تنزيل" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <X className="h-4 w-4 text-destructive shrink-0" />
      )}
      <span className={ok ? "" : "text-destructive"}>{label}</span>
    </div>
  );
}
