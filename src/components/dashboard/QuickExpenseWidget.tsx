import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Upload, Paperclip, Loader2, Check, ArrowLeft, ArrowRight, Receipt, ExternalLink, Sparkles, FileText, X, AlertCircle } from "lucide-react";
import {
  createReceiptUploadUrl,
  extractReceiptDetails,
  submitExpenseClaim,
} from "@/lib/expense-claims.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ReceiptCameraButton } from "@/components/receipt-camera-button";

const CATS = [
  "office",
  "travel",
  "marketing",
  "utilities",
  "software",
  "maintenance",
  "other",
] as const;
type Cat = (typeof CATS)[number];

const CAT_KEY: Record<Cat, string> = {
  office: "expenses.catOffice",
  travel: "expenses.catTravel",
  marketing: "expenses.catMarketing",
  utilities: "expenses.catUtilities",
  software: "expenses.catSoftware",
  maintenance: "expenses.catMaintenance",
  other: "expenses.catOther",
};

const MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Upload a Blob via XHR so we can report progress (fetch has no upload progress). */
function xhrPut(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("network error during upload"));
    xhr.send(file);
  });
}

/** Build up to 4 sensible round-number amount suggestions from the currently typed value. */
function suggestAmounts(current: string): number[] {
  const n = Number(current);
  if (!Number.isFinite(n) || n <= 0) return [50, 100, 250, 500];
  const base = [n * 1.05, n * 1.15, Math.ceil(n / 10) * 10, Math.ceil(n / 50) * 50];
  const rounded = Array.from(
    new Set(base.map((v) => (v >= 100 ? Math.round(v / 10) * 10 : Math.round(v)))),
  ).filter((v) => v > n);
  return rounded.slice(0, 4);
}

export function QuickExpenseWidget({ orgId }: { orgId: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [dir, setDir] = useState<1 | -1>(1);

  function goStep(next: 0 | 1 | 2) {
    setDir(next >= step ? 1 : -1);
    setStep(next);
  }
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Cat>("office");
  const [notes, setNotes] = useState("");
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState("");
  const [ocrState, setOcrState] = useState<"idle" | "scanning" | "done" | "failed">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState<{ amount?: boolean; notes?: boolean; category?: boolean }>({});
  const [showAll, setShowAll] = useState(false);

  // Smart validation: amount must be > 0; category must be chosen; notes required
  // when the category is generic ("other") or when there's no merchant to identify
  // what the money was for.
  const errors = (() => {
    const errs: { amount?: string; category?: string; notes?: string } = {};
    const n = Number(amount);
    if (!(n > 0)) errs.amount = t("quickExpense.errAmount");
    if (!category) errs.category = t("quickExpense.errCategory");
    const trimmedNotes = notes.trim();
    if (category === "other" && !trimmedNotes) {
      errs.notes = t("quickExpense.errNotesOther");
    } else if (!merchant.trim() && !trimmedNotes) {
      errs.notes = t("quickExpense.errNotesNoMerchant");
    }
    return errs;
  })();
  const hasErrors = Object.keys(errors).length > 0;
  const showErr = (k: "amount" | "notes" | "category") =>
    (touched[k] || showAll) && errors[k];

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function buildPrefillSearch(targetStep: 1 | 2) {
    const descParts: string[] = [];
    if (notes.trim()) descParts.push(notes.trim());
    if (date) descParts.push(`${t("quickExpense.date")}: ${date}`);
    if (merchant.trim()) descParts.push(`${t("quickExpense.merchant")}: ${merchant.trim()}`);
    const n = Number(amount);
    const titleBase = merchant.trim() || t(CAT_KEY[category]);
    const fullTitle =
      n > 0 ? `${titleBase} — ${n.toLocaleString()} SAR` : titleBase;
    return {
      batch: undefined,
      amount: amount || undefined,
      category,
      title: fullTitle || undefined,
      notes: descParts.length ? descParts.join(" • ") : undefined,
      receipt: receiptPath ?? undefined,
      filename: fileName ?? undefined,
      step: targetStep as 1 | 2,
    };
  }

  function openFullPage() {
    void navigate({
      to: "/dashboard/expenses/claim",
      search: buildPrefillSearch(step === 0 ? 1 : (step as 1 | 2)),
    });
  }

  const submit = useMutation({
    mutationFn: submitExpenseClaim,
    onSuccess: () => {
      toast.success(t("quickExpense.submitted"));
      setDir(-1);
      setStep(0);
      setReceiptPath(null);
      setFileName(null);
      setAmount("");
      setNotes("");
      setCategory("office");
      setMerchant("");
      setDate("");
      setOcrState("idle");
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setFileType(null);
      setFileSize(null);
      setTouched({});
      setShowAll(false);
    },
    onError: (e: Error) => toast.error(e.message || t("quickExpense.failed")),
  });

  async function handleFile(file: File | undefined | null) {
    if (!file || !orgId) return;
    if (file.size > MAX_BYTES) {
      toast.error(t("expenseClaim.receiptHint"));
      return;
    }
    const type = file.type || "application/octet-stream";
    const isImage = type.startsWith("image/");
    const isPdf = type === "application/pdf";
    if (!isImage && !isPdf) {
      toast.error(t("expenseClaim.receiptHint"));
      return;
    }
    // Build a local preview immediately so the user sees feedback while uploading.
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setFileType(type);
    setFileSize(file.size);
    try {
      setUploading(true);
      setUploadPct(0);
      const toastId = toast.loading(t("quickExpense.uploading"), {
        description: `${file.name} · 0%`,
      });
      const { path, signedUrl } = await createReceiptUploadUrl({
        data: {
          filename: file.name,
          content_type: type,
        },
      });
      await xhrPut(signedUrl, file, type, (pct) => {
        setUploadPct(pct);
        toast.loading(t("quickExpense.uploading"), {
          id: toastId,
          description: `${file.name} · ${pct}%`,
        });
      });
      toast.success(t("quickExpense.uploaded"), {
        id: toastId,
        description: file.name,
      });
      setReceiptPath(path);
      setFileName(file.name);
      setStep(1);
      // Kick off OCR in the background — never block the flow.
      setOcrState("scanning");
      const ocrToast = toast.loading(t("quickExpense.ocrScanning"), {
        description: t("quickExpense.ocrHint"),
      });
      void extractReceiptDetails({ data: { path } })
        .then((r) => {
          let filled = false;
          if (r.amount != null) {
            setAmount(String(r.amount));
            filled = true;
          }
          if (r.merchant) {
            setMerchant(r.merchant);
            filled = true;
          }
          if (r.date) {
            setDate(r.date);
            filled = true;
          }
          setOcrState(filled ? "done" : "failed");
          if (filled) {
            const bits = [
              r.amount != null ? `${r.amount} SAR` : null,
              r.merchant,
              r.date,
            ].filter(Boolean);
            toast.success(t("quickExpense.ocrDone"), {
              id: ocrToast,
              description: bits.join(" · "),
            });
          } else {
            toast.warning(t("quickExpense.ocrFailed"), { id: ocrToast });
          }
        })
        .catch(() => {
          setOcrState("failed");
          toast.error(t("quickExpense.ocrFailed"), { id: ocrToast });
        });
    } catch (err) {
      toast.error(t("quickExpense.uploadFailed"), {
        description: (err as Error).message,
      });
    } finally {
      setUploading(false);
    }
  }

  function clearReceipt() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setReceiptPath(null);
    setFileName(null);
    setFileType(null);
    setFileSize(null);
    setOcrState("idle");
    if (fileInput.current) fileInput.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onSubmit() {
    if (!orgId) return;
    if (hasErrors) {
      setShowAll(true);
      toast.error(t("quickExpense.errFixBelow"));
      // Jump the user back to the step containing the first error.
      if (errors.amount || errors.category) goStep(1);
      else if (errors.notes) goStep(2);
      return;
    }
    const n = Number(amount);
    const titleBase = merchant.trim()
      ? merchant.trim()
      : t(CAT_KEY[category]);
    const descParts: string[] = [];
    if (notes.trim()) descParts.push(notes.trim());
    if (date) descParts.push(`${t("quickExpense.date")}: ${date}`);
    if (merchant.trim()) descParts.push(`${t("quickExpense.merchant")}: ${merchant.trim()}`);
    submit.mutate({
      data: {
        org_id: orgId,
        title: `${titleBase} — ${n.toLocaleString()} SAR`,
        amount: n,
        category,
        description: descParts.length ? descParts.join(" • ") : null,
        receipt_url: receiptPath,
        currency: "SAR",
        batch_id: null,
      },
    });
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4 text-primary" />
            {t("quickExpense.heading")}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("quickExpense.sub")}
          </p>
        </div>
        <button
          type="button"
          onClick={openFullPage}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t("quickExpense.openFull")}
        >
          <ExternalLink className="h-3 w-3" />
          <span className="hidden sm:inline">{t("quickExpense.openFull")}</span>
        </button>
      </div>

      {/* Stepper */}
      <div className="mb-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={false}
            animate={{
              backgroundColor:
                i <= step
                  ? "hsl(var(--primary))"
                  : "hsl(var(--muted))",
              scale: i === step ? 1.06 : 1,
            }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "h-1 flex-1 origin-center rounded-full",
            )}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          custom={dir}
          variants={{
            enter: (d: 1 | -1) => ({
              opacity: 0,
              x: prefersReducedMotion ? 0 : d * 24,
              filter: prefersReducedMotion ? "none" : "blur(4px)",
            }),
            center: {
              opacity: 1,
              x: 0,
              filter: "blur(0px)",
              transition: {
                duration: prefersReducedMotion ? 0 : 0.32,
                ease: [0.22, 1, 0.36, 1],
                when: "beforeChildren",
                staggerChildren: prefersReducedMotion ? 0 : 0.04,
              },
            },
            exit: (d: 1 | -1) => ({
              opacity: 0,
              x: prefersReducedMotion ? 0 : d * -24,
              filter: prefersReducedMotion ? "none" : "blur(4px)",
              transition: { duration: prefersReducedMotion ? 0 : 0.22, ease: [0.4, 0, 1, 1] },
            }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {step === 0 && (
            <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {previewUrl ? (
            <div
              className={cn(
                "group relative overflow-hidden rounded-xl border-2 transition",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border/70",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
            >
              {fileType?.startsWith("image/") ? (
                <img
                  src={previewUrl}
                  alt={fileName ?? ""}
                  className="h-32 w-full object-contain bg-muted/30"
                />
              ) : (
                <div className="flex h-32 w-full flex-col items-center justify-center gap-1 bg-muted/30 text-muted-foreground">
                  <FileText className="h-8 w-8 text-primary" />
                  <span className="text-[10px] uppercase tracking-wide">PDF</span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/75 backdrop-blur-sm">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="w-3/4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-[width] duration-150"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                    <div className="mt-1 text-center text-[10px] text-muted-foreground">
                      {uploadPct}%
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={clearReceipt}
                className="absolute end-1.5 top-1.5 rounded-full bg-background/80 p-1 text-muted-foreground shadow-sm ring-1 ring-border transition hover:bg-background hover:text-foreground"
                title={t("quickExpense.replace")}
                aria-label={t("quickExpense.replace")}
              >
                <X className="h-3 w-3" />
              </button>
              <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-background px-2 py-1.5 text-[11px]">
                <div className="flex min-w-0 items-center gap-1">
                  <Paperclip className="h-3 w-3 shrink-0 text-primary" />
                  <span className="line-clamp-1">{fileName}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  {fileSize != null && <span>{formatBytes(fileSize)}</span>}
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInput.current?.click()}
                    className="text-primary hover:underline disabled:opacity-50"
                  >
                    {t("quickExpense.replace")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-disabled={uploading || !orgId}
              onClick={() => !uploading && orgId && fileInput.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !uploading && orgId) {
                  e.preventDefault();
                  fileInput.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading && orgId) setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                if (uploading || !orgId) {
                  e.preventDefault();
                  return;
                }
                onDrop(e);
              }}
              className={cn(
                "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center text-sm transition",
                (uploading || !orgId) && "cursor-not-allowed opacity-60",
                dragActive
                  ? "border-primary bg-primary/10 text-primary"
                  : uploading
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-border/70 hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span className="text-xs font-medium">
                    {dragActive ? t("quickExpense.dropHere") : t("quickExpense.upload")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t("quickExpense.dragHint")}
                  </span>
                </>
              )}
            </div>
          )}
              <ReceiptCameraButton
                onCapture={(f) => void handleFile(f)}
                disabled={uploading || !orgId}
              />
              <button
            type="button"
            onClick={() => goStep(1)}
            className="w-full text-[11px] text-muted-foreground hover:text-foreground"
          >
            {t("quickExpense.skip")}
          </button>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
          {ocrState !== "idle" && (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
                ocrState === "scanning" && "border-primary/30 bg-primary/5 text-primary",
                ocrState === "done" && "border-success/30 bg-success/10 text-success dark:text-success",
                ocrState === "failed" && "border-muted bg-muted/40 text-muted-foreground",
              )}
            >
              {ocrState === "scanning" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              <span className="font-medium">{t("quickExpense.ocrBadge")}</span>
              <span>
                {ocrState === "scanning"
                  ? t("quickExpense.ocrScanning")
                  : ocrState === "done"
                    ? t("quickExpense.ocrDone")
                    : t("quickExpense.ocrFailed")}
              </span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="qx-amount" className="text-xs">
              {t("quickExpense.amount")}
            </Label>
            <Input
              id="qx-amount"
              inputMode="decimal"
              autoFocus
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
              aria-invalid={!!showErr("amount")}
              className={cn(
                "h-9",
                showErr("amount") && "border-destructive focus-visible:ring-destructive/40",
              )}
            />
            {showErr("amount") && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.amount}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground self-center">
                {t("quickExpense.suggest")}:
              </span>
              {suggestAmounts(amount).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/80 transition hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                >
                  {v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="qx-merchant" className="text-xs">
                {t("quickExpense.merchant")}
              </Label>
              <Input
                id="qx-merchant"
                placeholder={t("quickExpense.merchantPh")}
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qx-date" className="text-xs">
                {t("quickExpense.date")}
              </Label>
              <Input
                id="qx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("quickExpense.stepCategory")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c);
                    setTouched((t) => ({ ...t, category: true }));
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition",
                    category === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  {t(CAT_KEY[c])}
                </button>
              ))}
            </div>
            {category === "other" && !notes.trim() && (
              <p className="flex items-center gap-1 text-[11px] text-warning dark:text-warning">
                <AlertCircle className="h-3 w-3" />
                {t("quickExpense.errNotesOther")}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => goStep(0)}
              className="h-8 text-xs"
            >
              <ArrowLeft className="me-1 h-3.5 w-3.5" />
              {t("quickExpense.back")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setTouched((t) => ({ ...t, amount: true, category: true }));
                if (errors.amount || errors.category) {
                  toast.error(t("quickExpense.errFixBelow"));
                  return;
                }
                goStep(2);
              }}
              className="h-8 text-xs"
            >
              {t("quickExpense.next")}
              <ArrowRight className="ms-1 h-3.5 w-3.5" />
            </Button>
          </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qx-notes" className="text-xs">
              {t("quickExpense.notes")}
            </Label>
            <Textarea
              id="qx-notes"
              placeholder={t("quickExpense.notesPh")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, notes: true }))}
              rows={3}
              aria-invalid={!!showErr("notes")}
              className={cn(
                "text-sm",
                showErr("notes") && "border-destructive focus-visible:ring-destructive/40",
              )}
            />
            {showErr("notes") && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3" />
                {errors.notes}
              </p>
            )}
          </div>
          {showAll && hasErrors && (
            <div className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{t("quickExpense.errFixBelow")}</span>
            </div>
          )}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>{t("quickExpense.amount")}</span>
              <span className="font-medium text-foreground">
                {Number(amount || 0).toLocaleString()} SAR
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("quickExpense.stepCategory")}</span>
              <span className="font-medium text-foreground">
                {t(CAT_KEY[category])}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("quickExpense.stepReceipt")}</span>
              <span className="font-medium text-foreground">
                {receiptPath
                  ? t("quickExpense.receiptAttached")
                  : t("expenseClaim.receiptMissing")}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => goStep(1)}
              disabled={submit.isPending}
              className="h-8 text-xs"
            >
              <ArrowLeft className="me-1 h-3.5 w-3.5" />
              {t("quickExpense.back")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSubmit}
              disabled={submit.isPending || !orgId}
              className="h-8 text-xs"
            >
              {submit.isPending ? (
                <>
                  <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                  {t("quickExpense.submitting")}
                </>
              ) : (
                <>
                  <Check className="me-1 h-3.5 w-3.5" />
                  {t("quickExpense.submit")}
                </>
              )}
            </Button>
          </div>
          <button
            type="button"
            onClick={openFullPage}
            className="inline-flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            {t("quickExpense.openFull")}
          </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default QuickExpenseWidget;