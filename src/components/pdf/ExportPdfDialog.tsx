import { useState } from "react";
import { FileDown, Loader2, Type } from "lucide-react";
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

interface ExportPdfDialogProps {
  triggerLabel?: string;
}

export function ExportPdfDialog({ triggerLabel = "تصدير PDF" }: ExportPdfDialogProps) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<PdfTemplateKey>("official");
  const [isTestingFont, setIsTestingFont] = useState(false);

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
          أول خطوة إلزامية في Phase 5 هي اختبار الخط العربي قبل بناء القوالب الحقيقية. استخدم الزر
          أدناه للتأكد من أن الحروف العربية متصلة والاتجاه صحيح داخل PDF.
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إغلاق
          </Button>
          <Button onClick={runFontTest} disabled={isTestingFont}>
            {isTestingFont ? (
              <Loader2 className="me-2 size-4 animate-spin" />
            ) : (
              <Type className="me-2 size-4" />
            )}
            اختبار الخط العربي
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
