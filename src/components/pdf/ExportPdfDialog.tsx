import { useState } from "react";
import { FileDown, Loader2, ReceiptText, Type, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PDF_TEMPLATES } from "@/lib/pdf/templates";
import type { PdfTemplateKey } from "@/lib/pdf/document-types";
import { renderArabicFontSmokeTestPdf } from "@/lib/pdf/document-engine";
import { renderSimplifiedTaxInvoicePdf, renderVoucherPdf } from "@/lib/pdf/financial-documents";

interface ExportPdfDialogProps {
  triggerLabel?: string;
}

export function ExportPdfDialog({ triggerLabel = "تصدير PDF" }: ExportPdfDialogProps) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<PdfTemplateKey>("official");
  const [isTestingFont, setIsTestingFont] = useState(false);
  const [isRenderingSample, setIsRenderingSample] = useState<"invoice" | "voucher" | null>(null);

  const runFontTest = async () => {
    setIsTestingFont(true);
    try {
      const result = await renderArabicFontSmokeTestPdf();
      result.open();
      toast.success("تم توليد PDF تجريبي لاختبار الخط العربي");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر توليد اختبار الخط العربي");
    } finally {
      setIsTestingFont(false);
    }
  };

  const account = {
    orgId: "sample",
    accountType: "business",
    name: "شركة أملاك HBSH",
    taxNumber: "300000000000003",
    commercialRegistration: "1010000000",
    nationalAddress: "جدة، المملكة العربية السعودية",
  };

  const runInvoiceSample = async () => {
    setIsRenderingSample("invoice");
    try {
      const result = await renderSimplifiedTaxInvoicePdf({
        account,
        templateKey: template,
        invoiceNumber: "INV-0001",
        description: "دفعة إيجار شهرية",
        subtotal: 1000,
        vatAmount: 150,
        totalWithVat: 1150,
        buyerName: "مستأجر تجريبي",
      });
      result.open();
      toast.success("تم توليد فاتورة ضريبية مبسطة تجريبية");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر توليد الفاتورة التجريبية");
    } finally {
      setIsRenderingSample(null);
    }
  };

  const runVoucherSample = async () => {
    setIsRenderingSample("voucher");
    try {
      const result = await renderVoucherPdf({
        account,
        templateKey: template,
        voucherType: "receipt",
        voucherNumber: "RV-0001",
        amount: 1150.75,
        partyName: "مستأجر تجريبي",
        statement: "سداد دفعة إيجار جزئية مع ضريبة قيمة مضافة",
        paymentMethod: "تحويل بنكي",
      });
      result.open();
      toast.success("تم توليد سند قبض تجريبي");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر توليد السند التجريبي");
    } finally {
      setIsRenderingSample(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileDown className="me-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>نافذة التصدير الموحدة</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          {Object.values(PDF_TEMPLATES).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTemplate(item.key)}
              className={[
                "rounded-lg border p-3 text-right transition",
                template === item.key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted",
              ].join(" ")}
            >
              <span
                className="mb-3 block h-2 rounded-full"
                style={{ backgroundColor: item.primary }}
                aria-hidden="true"
              />
              <span className="block text-sm font-semibold">{item.labelAr}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.labelEn}</span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          اختبر الخط العربي أولاً، ثم جرّب الفاتورة أو السند بالقالب المختار. العين هنا على اتصال
          الحروف، اتجاه RTL، QR، والتفقيط العربي قبل ربط الأزرار النهائية ببيانات الشاشات.
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إغلاق
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runFontTest} disabled={isTestingFont}>
              {isTestingFont ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Type className="me-2 size-4" />
              )}
              اختبار الخط العربي
            </Button>
            <Button
              variant="secondary"
              onClick={runInvoiceSample}
              disabled={isRenderingSample !== null}
            >
              {isRenderingSample === "invoice" ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <ReceiptText className="me-2 size-4" />
              )}
              فاتورة تجريبية
            </Button>
            <Button
              variant="secondary"
              onClick={runVoucherSample}
              disabled={isRenderingSample !== null}
            >
              {isRenderingSample === "voucher" ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <WalletCards className="me-2 size-4" />
              )}
              سند تجريبي
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
