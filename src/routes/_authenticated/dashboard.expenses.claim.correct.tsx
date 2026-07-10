import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, FileText, Loader2, Paperclip, Upload } from "lucide-react";
import { z } from "zod";
import { useCurrentOrg } from "@/hooks/use-current-org";
import {
  createReceiptUploadUrl,
  listMyRecentClaims,
  submitCorrectedExpenseClaim,
} from "@/lib/expense-claims.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VoiceTextarea } from "@/components/voice/VoiceTextarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ReceiptCameraButton } from "@/components/receipt-camera-button";

import { sectionHead } from "@/lib/section-og-head";
const searchSchema = z.object({
  original: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard/expenses/claim/correct")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => sectionHead({ section: "dashboard", entityAr: "تصحيح مطالبة مصروفات", entityEn: "Correct Expense Claim", path: "/dashboard/expenses/claim/correct" }),
  component: CorrectionWizard,
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

const MAX_BYTES = 10 * 1024 * 1024;

type ClaimRow = Awaited<ReturnType<typeof listMyRecentClaims>>[number];

function normalizeCat(v: string | null | undefined): Cat {
  return (CATS as readonly string[]).includes(v ?? "") ? (v as Cat) : "other";
}

function CorrectionWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { original: initialOriginal } = Route.useSearch();
  const { orgId, ready } = useCurrentOrg();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [originalId, setOriginalId] = useState<string | null>(initialOriginal ?? null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Cat>("other");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const claimsQuery = useQuery({
    queryKey: ["my-recent-claims", orgId],
    queryFn: () => listMyRecentClaims({ data: { org_id: orgId!, limit: 25 } }),
    enabled: ready && !!orgId,
  });

  const original = useMemo<ClaimRow | null>(() => {
    if (!originalId || !claimsQuery.data) return null;
    return claimsQuery.data.find((c) => c.id === originalId) ?? null;
  }, [originalId, claimsQuery.data]);

  // Prefill form fields from the selected original the first time it's known.
  useEffect(() => {
    if (!original || prefilled) return;
    setAmount(String(original.amount ?? ""));
    setCategory(normalizeCat(original.category));
    setTitle(original.title ?? "");
    setNotes(original.description ?? "");
    setPrefilled(true);
  }, [original, prefilled]);

  const submit = useMutation({
    mutationFn: submitCorrectedExpenseClaim,
    onSuccess: () => {
      toast.success(t("expenseClaimCorrection.submitted"));
      navigate({ to: "/dashboard/expenses" });
    },
    onError: (e: Error) => toast.error(e.message || t("expenseClaimCorrection.failed")),
  });

  const canSubmit =
    ready &&
    !!orgId &&
    !!originalId &&
    Number(amount) > 0 &&
    title.trim().length >= 2 &&
    reason.trim().length >= 4;

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
      setStep(3);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function goNext() {
    if (step === 0) {
      if (!originalId) return toast.error(t("expenseClaimCorrection.originalRequired"));
      setStep(1);
    } else if (step === 1) {
      if (!(Number(amount) > 0)) return toast.error(t("expenseClaim.amountRequired"));
      if (title.trim().length < 2) return toast.error(t("expenseClaim.titleRequired"));
      setStep(2);
    } else if (step === 2) {
      if (reason.trim().length < 4) return toast.error(t("expenseClaimCorrection.reasonRequired"));
      setStep(3);
    }
  }

  function onSubmit() {
    if (!orgId || !originalId) return;
    if (!canSubmit) return;
    submit.mutate({
      data: {
        org_id: orgId,
        original_claim_id: originalId,
        title: title.trim(),
        amount: Number(amount),
        category,
        correction_reason: reason.trim(),
        description: notes.trim() || null,
        receipt_url: receiptPath,
        currency: "SAR",
      },
    });
  }

  const steps = useMemo(
    () => [
      t("expenseClaimCorrection.stepOriginal"),
      t("expenseClaimCorrection.stepDetails"),
      t("expenseClaimCorrection.stepReason"),
      t("expenseClaimCorrection.stepReview"),
    ],
    [t],
  );

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <Card className="border-border/60 shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">{t("expenseClaimCorrection.title")}</CardTitle>
          <CardDescription>{t("expenseClaimCorrection.sub")}</CardDescription>
          <Stepper labels={steps} current={step} />
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 && (
            <OriginalPicker
              loading={claimsQuery.isLoading}
              rows={claimsQuery.data ?? []}
              selectedId={originalId}
              onSelect={(id) => {
                setOriginalId(id);
                setPrefilled(false);
              }}
            />
          )}

          {step === 1 && (
            <div className="space-y-5">
              {original && <OriginalSummary row={original} />}

              <div className="space-y-2">
                <Label htmlFor="c-title">{t("expenseClaim.titleField")}</Label>
                <Input
                  id="c-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="space-y-2">
                  <Label htmlFor="c-amount">{t("expenseClaim.amount")}</Label>
                  <Input
                    id="c-amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
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
                <Label>{t("expenseClaim.category")}</Label>
                <div className="flex flex-wrap gap-2">
                  {CATS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
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
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="c-reason">{t("expenseClaimCorrection.reasonLabel")}</Label>
                <VoiceTextarea
                  id="c-reason"
                  autoFocus
                  value={reason}
                  onChange={setReason}
                  placeholder={t("expenseClaimCorrection.reasonPlaceholder")}
                  rows={4}
                  maxLength={1000}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("expenseClaimCorrection.newReceipt")}</Label>
                <ReceiptDrop
                  uploading={uploading}
                  fileName={fileName}
                  onPick={() => fileInput.current?.click()}
                  onDrop={(f) => handleFile(f)}
                  onCapture={(f) => handleFile(f)}
                  hint={t("expenseClaimCorrection.replaceReceiptHint")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="c-notes">{t("expenseClaim.notes")}</Label>
                <VoiceTextarea
                  id="c-notes"
                  value={notes}
                  onChange={setNotes}
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </div>
          )}

          {step === 3 && original && (
            <div className="space-y-4">
              <OriginalSummary row={original} />
              <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
                <div className="font-medium">{t("expenseClaimCorrection.changeSummary")}</div>
                <DiffRow
                  label={t("expenseClaim.titleField")}
                  before={original.title}
                  after={title}
                />
                <DiffRow
                  label={t("expenseClaim.amount")}
                  before={`${Number(original.amount).toLocaleString()} SAR`}
                  after={`${Number(amount || 0).toLocaleString()} SAR`}
                />
                <DiffRow
                  label={t("expenseClaim.category")}
                  before={t(CAT_KEY[normalizeCat(original.category)])}
                  after={t(CAT_KEY[category])}
                />
                <DiffRow
                  label={t("expenseClaim.stepReceipt")}
                  before={
                    original.receipt_url
                      ? (t("expenseClaim.receiptAttached") as string)
                      : (t("expenseClaim.receiptMissing") as string)
                  }
                  after={
                    receiptPath
                      ? (t("expenseClaim.receiptAttached") as string)
                      : (t("expenseClaim.receiptMissing") as string)
                  }
                  afterIcon={receiptPath ? <Paperclip className="h-3.5 w-3.5" /> : null}
                />
                <div className="pt-2 border-t border-border/50">
                  <div className="text-muted-foreground">
                    {t("expenseClaimCorrection.reasonLabel")}
                  </div>
                  <div className="font-medium whitespace-pre-wrap">{reason.trim() || "—"}</div>
                </div>
              </div>
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
              onClick={() => setStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2 | 3) : s))}
            >
              <ArrowLeft className="h-4 w-4 me-1" /> {t("expenseClaim.back")}
            </Button>

            {step < 3 ? (
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
                    <Check className="h-4 w-4 me-2" /> {t("expenseClaimCorrection.submit")}
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

function OriginalPicker({
  loading,
  rows,
  selectedId,
  onSelect,
}: {
  loading: boolean;
  rows: ClaimRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("expenseClaimCorrection.loadingClaims")}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("expenseClaimCorrection.noClaims")}</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t("expenseClaimCorrection.pickOriginal")}</p>
      <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
        {rows.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={cn(
                "w-full text-start rounded-lg border p-3 transition",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.claim_number} · {r.category ?? "—"}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="font-semibold">
                    {Number(r.amount).toLocaleString()} {r.currency}
                  </div>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {r.status}
                  </Badge>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OriginalSummary({ row }: { row: ClaimRow }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            {t("expenseClaimCorrection.original")}
          </div>
          <div className="font-medium truncate">{row.title}</div>
          <div className="text-xs text-muted-foreground">{row.claim_number}</div>
        </div>
        <div className="text-end">
          <div className="font-semibold">
            {Number(row.amount).toLocaleString()} {row.currency}
          </div>
          <Badge variant="outline" className="mt-1 text-[10px]">
            {row.status}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function DiffRow({
  label,
  before,
  after,
  afterIcon,
}: {
  label: string;
  before: React.ReactNode;
  after: React.ReactNode;
  afterIcon?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const changed = String(before ?? "") !== String(after ?? "");
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-end">
        <span
          className={cn("truncate max-w-[10rem]", changed && "line-through text-muted-foreground")}
        >
          {before || "—"}
        </span>
        <span className="text-muted-foreground">→</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 font-medium truncate max-w-[12rem]",
            changed && "text-primary",
          )}
        >
          {afterIcon} {after || "—"}
        </span>
        <Badge variant={changed ? "default" : "outline"} className="text-[10px]">
          {changed ? t("expenseClaimCorrection.changed") : t("expenseClaimCorrection.unchanged")}
        </Badge>
      </span>
    </div>
  );
}

function ReceiptDrop({
  uploading,
  fileName,
  onPick,
  onDrop,
  onCapture,
  hint,
}: {
  uploading: boolean;
  fileName: string | null;
  onPick: () => void;
  onDrop: (f: File | undefined | null) => void;
  onCapture: (f: File | undefined | null) => void;
  hint: string;
}) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="space-y-2">
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
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 transition",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/30",
        )}
        disabled={uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm">{t("expenseClaim.uploading")}</span>
          </>
        ) : fileName ? (
          <>
            <FileText className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">{fileName}</span>
            <span className="text-xs text-muted-foreground">{t("expenseClaim.replace")}</span>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">{t("expenseClaim.dropReceipt")}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </>
        )}
      </button>
      <ReceiptCameraButton onCapture={onCapture} disabled={uploading} />
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
