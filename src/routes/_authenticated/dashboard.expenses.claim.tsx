import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  Paperclip,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-current-org";
import {
  createReceiptUploadUrl,
  extractReceiptDetails,
  listMyRecentClaims,
  submitExpenseClaim,
} from "@/lib/expense-claims.functions";
import { evaluatePolicyDryRun } from "@/lib/policy-engine.functions";
import { PolicyViolationsPanel, toDisplay } from "@/components/policy-violations-panel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ReceiptCameraButton } from "@/components/receipt-camera-button";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/expenses/claim")({
  validateSearch: (search: Record<string, unknown>) => ({
    batch: typeof search.batch === "string" ? search.batch : undefined,
    amount: typeof search.amount === "string" ? search.amount : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
    title: typeof search.title === "string" ? search.title : undefined,
    notes: typeof search.notes === "string" ? search.notes : undefined,
    receipt: typeof search.receipt === "string" ? search.receipt : undefined,
    filename: typeof search.filename === "string" ? search.filename : undefined,
    step: search.step === "1" || search.step === "2" ? Number(search.step) as 1 | 2 : undefined,
  }),
  head: () => sectionHead({ section: "dashboard", entityAr: "مطالبة مصروفات", entityEn: "Expense Claim", path: "/dashboard/expenses/claim" }),
  component: ClaimWizard,
});

const CATS = [
  "marketing",
  "rent",
  "utilities",
  "salaries",
  "maintenance",
  "commissions",
  "office",
  "travel",
  "software",
  "other",
] as const;
type Cat = (typeof CATS)[number];

const CAT_KEY: Record<Cat, string> = {
  marketing: "expenses.catMarketing",
  rent: "expenses.catRent",
  utilities: "expenses.catUtilities",
  salaries: "expenses.catSalaries",
  maintenance: "expenses.catMaintenance",
  commissions: "expenses.catCommissions",
  office: "expenses.catOffice",
  travel: "expenses.catTravel",
  software: "expenses.catSoftware",
  other: "expenses.catOther",
};

// Very small keyword → category map used to smart-select a category from OCR
// merchant text so the user doesn't have to click one manually. Match is
// case-insensitive, first hit wins.
const CAT_KEYWORDS: Array<[Cat, RegExp]> = [
  ["travel", /uber|careem|taxi|airlines|airport|hotel|booking|airbnb|طيران|فندق|كريم|تاكسي/i],
  ["office", /office|jarir|extra|dammam|staples|papers|مكتب|جرير|قرطاسية/i],
  ["software", /google|microsoft|adobe|figma|github|openai|slack|zoom|notion|subscription|اشتراك/i],
  ["utilities", /stc|mobily|zain|electricity|water|internet|كهرباء|ماء|انترنت|اتصالات/i],
  ["marketing", /ads|google ads|meta|facebook|snapchat|tiktok|إعلان|تسويق/i],
  ["maintenance", /repair|maintenance|صيانة|إصلاح/i],
];
function guessCategoryFromText(text: string): Cat | null {
  for (const [cat, re] of CAT_KEYWORDS) if (re.test(text)) return cat;
  return null;
}

const MAX_BYTES = 10 * 1024 * 1024;

function ClaimWizard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { orgId, ready } = useCurrentOrg();
  const { batch: batchIdParam } = Route.useSearch();
  const prefill = Route.useSearch();

  const [step, setStep] = useState<0 | 1 | 2>(
    prefill.step ?? (prefill.receipt || prefill.amount ? 1 : 0),
  );
  const [receiptPath, setReceiptPath] = useState<string | null>(prefill.receipt ?? null);
  const [fileName, setFileName] = useState<string | null>(prefill.filename ?? null);
  const [uploading, setUploading] = useState(false);
  const [amount, setAmount] = useState(prefill.amount ?? "");
  const [category, setCategory] = useState<Cat>(
    (CATS as readonly string[]).includes(prefill.category ?? "")
      ? (prefill.category as Cat)
      : "other",
  );
  const [title, setTitle] = useState(prefill.title ?? "");
  const [notes, setNotes] = useState(prefill.notes ?? "");
  const [ocrBusy, setOcrBusy] = useState(false);
  // Track which fields we auto-filled so we don't overwrite a user's edits
  // when they re-scan the same receipt.
  const [ocrFilled, setOcrFilled] = useState<{
    amount?: boolean;
    title?: boolean;
    notes?: boolean;
    category?: boolean;
  }>({});
  const fileInput = useRef<HTMLInputElement>(null);

  // Recent claims → suggestion chips for title & category on the details step.
  const recent = useQuery({
    queryKey: ["expense-recent-suggestions", orgId],
    enabled: !!orgId,
    queryFn: () => listMyRecentClaims({ data: { org_id: orgId!, limit: 20 } }),
    staleTime: 60_000,
  });
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ title: string; category: Cat; amount: number }> = [];
    for (const r of recent.data ?? []) {
      const key = (r.title ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cat = r.category ?? "";
      out.push({
        title: r.title!,
        category: (CATS as readonly string[]).includes(cat) ? (cat as Cat) : "other",
        amount: Number(r.amount) || 0,
      });
      if (out.length >= 4) break;
    }
    return out;
  }, [recent.data]);

  const submit = useMutation({
    mutationFn: submitExpenseClaim,
    onSuccess: () => {
      toast.success(t("expenseClaim.submitted"));
      if (batchIdParam) {
        navigate({ to: "/dashboard/expenses/batches/$batchId", params: { batchId: batchIdParam } });
      } else {
        navigate({ to: "/dashboard/expenses" });
      }
    },
    onError: (e: Error) => toast.error(e.message || t("expenseClaim.failed")),
  });

  // Live policy check on the Review step. Runs only once the form is
  // reachable-review so we don't hammer the server while the user is still
  // filling numbers.
  const policyQ = useQuery({
    queryKey: [
      "policy-dry-run",
      orgId,
      Number(amount) || 0,
      category,
      title.trim(),
      notes.trim(),
      !!receiptPath,
    ],
    enabled: step === 2 && !!orgId && Number(amount) > 0,
    queryFn: () =>
      evaluatePolicyDryRun({
        data: {
          org_id: orgId!,
          amount: Number(amount) || 0,
          category,
          currency: "SAR",
          title: title.trim(),
          description: notes.trim(),
          has_receipt: !!receiptPath,
        },
      }),
    staleTime: 15_000,
  });
  const violations = useMemo(
    () => (policyQ.data ?? []).map((v) => toDisplay(v, i18n.language)),
    [policyQ.data, i18n.language],
  );
  const isBlocked = violations.some((v) => v.severity === "block");

  const canSubmit =
    ready &&
    !!orgId &&
    Number(amount) > 0 &&
    title.trim().length >= 2 &&
    !isBlocked &&
    !policyQ.isFetching;

  async function runOcr(path: string) {
    setOcrBusy(true);
    try {
      const res = await extractReceiptDetails({ data: { path } });
      const updates: typeof ocrFilled = {};
      // Only fill fields the user hasn't already touched (or that we filled last time).
      if (res.amount !== null && (amount === "" || ocrFilled.amount)) {
        setAmount(String(res.amount));
        updates.amount = true;
      }
      if (res.merchant && (title.trim() === "" || ocrFilled.title)) {
        setTitle(res.merchant);
        updates.title = true;
      }
      if (res.date) {
        const line = `${res.date}${res.merchant ? ` · ${res.merchant}` : ""}`;
        if (notes.trim() === "" || ocrFilled.notes) {
          setNotes(line);
          updates.notes = true;
        }
      }
      // Smart category selection based on merchant text.
      const guessed = guessCategoryFromText([res.merchant ?? "", fileName ?? ""].join(" "));
      if (guessed && (category === "other" || ocrFilled.category)) {
        setCategory(guessed);
        updates.category = true;
      }
      setOcrFilled((prev) => ({ ...prev, ...updates }));
      // If OCR nailed amount + merchant, jump straight to Review — minimal clicks.
      const nailedIt = res.amount !== null && !!res.merchant;
      if (nailedIt) {
        toast.success(t("expenseClaim.smartSkip"));
        setStep(2);
      } else if (Object.keys(updates).length > 0) {
        toast.success(t("expenseClaim.ocrFilled"));
      } else if (res.amount === null && !res.merchant && !res.date) {
        toast.message(t("expenseClaim.ocrNothing"));
      }
    } catch (err) {
      // OCR is optional — never block submission.
      console.error(err);
    } finally {
      setOcrBusy(false);
    }
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t("expenseClaim.receiptHint"));
      return;
    }
    try {
      setUploading(true);
      const { path, signedUrl } = await createReceiptUploadUrl({
        data: { filename: file.name, content_type: file.type || "application/octet-stream" },
      });
      const res = await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      setReceiptPath(path);
      setFileName(file.name);
      // Reset previous OCR bookkeeping when the file is replaced.
      setOcrFilled({});
      // auto-advance to keep clicks minimal
      setStep(1);
      // Kick off OCR in the background; the details step will show progress.
      void runOcr(path);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function goNext() {
    if (step === 1) {
      if (!(Number(amount) > 0)) return toast.error(t("expenseClaim.amountRequired"));
      // pre-fill title with a sensible default
      if (!title.trim())
        setTitle(`${t(CAT_KEY[category])} — ${Number(amount).toLocaleString()} SAR`);
      setStep(2);
    } else if (step === 0) {
      setStep(1);
    }
  }

  // Enter-to-advance keyboard shortcut. Ignored inside multiline notes so
  // users can still type paragraphs, and ignored while a mutation is running.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.getAttribute("contenteditable") === "true"))
        return;
      if (uploading || submit.isPending) return;
      if (step < 2) {
        e.preventDefault();
        goNext();
      } else if (canSubmit) {
        e.preventDefault();
        onSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, amount, title, category, notes, canSubmit, uploading, submit.isPending]);

  function onSubmit() {
    if (!orgId) return toast.error(t("expenseClaim.noOrg"));
    if (!canSubmit) return toast.error(t("expenseClaim.titleRequired"));
    submit.mutate({
      data: {
        org_id: orgId,
        title: title.trim(),
        amount: Number(amount),
        category,
        description: notes.trim() || null,
        receipt_url: receiptPath,
        currency: "SAR",
        batch_id: batchIdParam ?? null,
      },
    });
  }

  const steps = useMemo(
    () => [
      t("expenseClaim.stepReceipt"),
      t("expenseClaim.stepDetails"),
      t("expenseClaim.stepReview"),
    ],
    [t],
  );

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">{t("expenseClaim.title")}</CardTitle>
          <CardDescription>{t("expenseClaim.sub")}</CardDescription>
          <Stepper labels={steps} current={step} />
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 && (
            <ReceiptStep
              uploading={uploading}
              fileName={fileName}
              onPick={() => fileInput.current?.click()}
              onDrop={(f) => handleFile(f)}
              onCapture={(f) => handleFile(f)}
              onSkip={() => setStep(1)}
            />
          )}

          {step === 1 && (
            <div className="space-y-5">
              {(ocrBusy || ocrFilled.amount || ocrFilled.title || ocrFilled.notes) && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                    ocrBusy
                      ? "border-primary/30 bg-primary/5 text-primary"
                      : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
                  )}
                  role="status"
                  aria-live="polite"
                >
                  {ocrBusy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{t("expenseClaim.ocrScanning")}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{t("expenseClaim.ocrFilled")}</span>
                      {receiptPath && (
                        <button
                          type="button"
                          onClick={() => void runOcr(receiptPath)}
                          className="ms-auto underline underline-offset-2 hover:opacity-80"
                        >
                          {t("expenseClaim.ocrRerun")}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("expenseClaim.suggestions")}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setTitle(s.title);
                          setCategory(s.category);
                          if (!amount) setAmount(String(s.amount || ""));
                          setOcrFilled((p) => ({ ...p, title: false, category: false }));
                        }}
                        className="rounded-full border border-dashed border-primary/40 bg-primary/5 px-3 py-1 text-xs text-primary hover:bg-primary/10"
                        title={t(CAT_KEY[s.category])}
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="space-y-2">
                  <Label htmlFor="claim-amount" className="flex items-center gap-2">
                    {t("expenseClaim.amount")}
                    {ocrFilled.amount && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {t("expenseClaim.ocrBadge")}
                      </span>
                    )}
                  </Label>
                  <Input
                    id="claim-amount"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value.replace(/[^\d.]/g, ""));
                      if (ocrFilled.amount) setOcrFilled((p) => ({ ...p, amount: false }));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("expenseClaim.currency")}</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                    SAR
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  {t("expenseClaim.category")}
                  {ocrFilled.category && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {t("expenseClaim.ocrBadge")}
                    </span>
                  )}
                </Label>
                <div className="flex flex-wrap gap-2">
                  {CATS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCategory(c);
                        if (ocrFilled.category) setOcrFilled((p) => ({ ...p, category: false }));
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition",
                        category === c
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      {t(CAT_KEY[c])}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("expenseClaim.keyboardHint")}</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="claim-title">{t("expenseClaim.titleField")}</Label>
                <Input
                  id="claim-title"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("expenseClaim.titlePlaceholder")}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="claim-notes">{t("expenseClaim.notes")}</Label>
                <Textarea
                  id="claim-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("expenseClaim.notesPlaceholder")}
                  rows={4}
                  maxLength={2000}
                />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                <div className="font-medium">{t("expenseClaim.summary")}</div>
                <SummaryRow
                  label={t("expenseClaim.amount")}
                  value={`${Number(amount || 0).toLocaleString()} SAR`}
                />
                <SummaryRow label={t("expenseClaim.category")} value={t(CAT_KEY[category])} />
                <SummaryRow
                  label={t("expenseClaim.stepReceipt")}
                  value={
                    receiptPath ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Paperclip className="h-3.5 w-3.5" />{" "}
                        {fileName ?? t("expenseClaim.receiptAttached")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("expenseClaim.receiptMissing")}
                      </span>
                    )
                  }
                />
              </div>

              <PolicyViolationsPanel
                loading={policyQ.isFetching}
                violations={violations}
              />
              {isBlocked && (
                <p className="text-xs text-destructive">{t("policyEngine.blockedSubmit")}</p>
              )}
            </div>
          )}

          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              disabled={step === 0 || submit.isPending}
              onClick={() => setStep((s) => (s > 0 ? ((s - 1) as 0 | 1) : s))}
            >
              <ArrowLeft className="h-4 w-4 me-1" /> {t("expenseClaim.back")}
            </Button>

            {step < 2 ? (
              <Button onClick={goNext} disabled={uploading}>
                {t("expenseClaim.next")} <ArrowRight className="h-4 w-4 ms-1" />
              </Button>
            ) : (
              <Button onClick={onSubmit} disabled={!canSubmit || submit.isPending}>
                {submit.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 me-2 animate-spin" /> {t("expenseClaim.submitting")}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 me-2" /> {t("expenseClaim.submit")}
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stepper({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2 pt-2" aria-label="progress">
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold shrink-0",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-xs md:text-sm",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < labels.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function ReceiptStep({
  uploading,
  fileName,
  onPick,
  onDrop,
  onCapture,
  onSkip,
}: {
  uploading: boolean;
  fileName: string | null;
  onPick: () => void;
  onDrop: (f: File | undefined | null) => void;
  onCapture: (f: File | undefined | null) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onPick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onDrop(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
        )}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm">{t("expenseClaim.uploading")}</span>
          </>
        ) : fileName ? (
          <>
            <FileText className="h-8 w-8 text-primary" />
            <span className="text-sm font-medium">{fileName}</span>
            <span className="text-xs text-muted-foreground">{t("expenseClaim.replace")}</span>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">{t("expenseClaim.dropReceipt")}</span>
            <span className="text-xs text-muted-foreground">{t("expenseClaim.receiptHint")}</span>
          </>
        )}
      </button>
      <ReceiptCameraButton onCapture={onCapture} disabled={uploading} />
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          disabled={uploading}
        >
          {t("expenseClaim.skipReceipt")}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
