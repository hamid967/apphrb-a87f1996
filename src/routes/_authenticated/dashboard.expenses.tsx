import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Receipt as ReceiptIcon,
  Sparkles,
  Upload,
  ScanLine,
  CheckCircle2,
  ArrowRight,
  Paperclip,
  XCircle,
  Clock,
  Wallet,
  Layers,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from "@/lib/accounting.functions";
import { listMyRecentClaims } from "@/lib/expense-claims.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReceiptCameraButton } from "@/components/receipt-camera-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/expenses")({
  head: () => sectionHead({ section: "dashboard", entityAr: "المصروفات", entityEn: "Expenses", path: "/dashboard/expenses" }),
  component: ExpensesPage,
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

const today = () => new Date().toISOString().slice(0, 10);
const monthKey = (d: string) => d.slice(0, 7);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const emptyForm = () => ({
  spent_at: today(),
  category: "other" as Cat,
  vendor: "",
  description: "",
  amount: "",
  vat_amount: "0",
  currency: "SAR",
  receipt_url: "",
});

function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const orgId = orgsQ.data?.[0]?.org?.id;

  const q = useQuery({
    queryKey: ["expenses", orgId],
    queryFn: () => listExpenses({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const claimsQ = useQuery({
    queryKey: ["my-recent-claims", orgId],
    queryFn: () => listMyRecentClaims({ data: { org_id: orgId!, limit: 50 } }),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(emptyForm());

  const [catFilter, setCatFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const rows: Row[] = q.data ?? [];

  const months = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(monthKey(r.spent_at));
    return Array.from(s).sort().reverse();
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (catFilter !== "all" && r.category !== catFilter) return false;
        if (monthFilter !== "all" && monthKey(r.spent_at) !== monthFilter) return false;
        return true;
      }),
    [rows, catFilter, monthFilter],
  );

  const totals = useMemo(() => {
    const total = filtered.reduce((s: number, r: Row) => s + Number(r.amount), 0);
    const vat = filtered.reduce((s: number, r: Row) => s + Number(r.vat_amount), 0);
    const byCat: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    filtered.forEach((r: Row) => {
      byCat[r.category] = (byCat[r.category] ?? 0) + Number(r.amount);
      const m = monthKey(r.spent_at);
      byMonth[m] = (byMonth[m] ?? 0) + Number(r.amount);
    });
    return { total, vat, byCat, byMonth };
  }, [filtered]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      spent_at: r.spent_at,
      category: r.category,
      vendor: r.vendor ?? "",
      description: r.description ?? "",
      amount: String(r.amount),
      vat_amount: String(r.vat_amount ?? 0),
      currency: r.currency ?? "SAR",
      receipt_url: r.receipt_url ?? "",
    });
    setOpen(true);
  };

  const create = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      toast.success(t("expenses.saved"));
      qc.invalidateQueries({ queryKey: ["expenses", orgId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: updateExpense,
    onSuccess: () => {
      toast.success(t("expenses.updated"));
      qc.invalidateQueries({ queryKey: ["expenses", orgId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteExpense({ data: { id } }),
    onSuccess: () => {
      toast.success(t("expenses.deleted"));
      qc.invalidateQueries({ queryKey: ["expenses", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    const base = {
      spent_at: form.spent_at,
      category: form.category,
      vendor: form.vendor || null,
      description: form.description || null,
      amount: Number(form.amount),
      vat_amount: Number(form.vat_amount || 0),
      currency: form.currency,
      receipt_url: form.receipt_url || null,
    };
    if (editing) {
      update.mutate({ data: { id: editing.id, patch: base } });
    } else {
      create.mutate({ data: { org_id: orgId!, ...base } });
    }
  };

  const fmt = (n: number) => `${n.toLocaleString(isAr ? "ar" : "en")}`;

  const goToClaim = () => navigate({ to: "/dashboard/expenses/claim", search: {} });
  const onQuickReceiptPicked = (file: File | null) => {
    if (!file) return;
    // Hand off to the full wizard where OCR + policy checks run.
    // Persist a lightweight hint so the wizard can surface a "start with this
    // file" affordance without needing to marshal the file across a route.
    try {
      sessionStorage.setItem(
        "expense-quickstart",
        JSON.stringify({ name: file.name, size: file.size, at: Date.now() }),
      );
    } catch {
      /* storage may be unavailable in private mode */
    }
    navigate({ to: "/dashboard/expenses/claim", search: {} });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("expenses.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("expenses.sub")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={openCreate}>
            <Plus className="me-2 size-4" /> {t("expenses.new")}
          </Button>
          <Button
            onClick={goToClaim}
            className="bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg hover:from-amber-400 hover:to-amber-500"
          >
            <Sparkles className="me-2 size-4" />
            {isAr ? "طلب سريع" : "Quick Claim"}
          </Button>
        </div>
      </div>
      <div className="mt-2">
        <Link to="/dashboard/expenses/batches" className="text-sm text-primary hover:underline">
          {t("expenseBatches.goToBatches")}
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link to="/dashboard/expenses/review" className="text-sm text-primary hover:underline">
          {t("claimsReview.linkFromExpenses")}
        </Link>
      </div>

      <QuickStartPanel
        isAr={isAr}
        onPick={onQuickReceiptPicked}
        onOpenWizard={goToClaim}
      />

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <StatCard label={t("expenses.statCount")} value={String(filtered.length)} />
        <StatCard label={t("expenses.statTotal")} value={fmt(totals.total)} suffix="SAR" />
        <StatCard label={t("expenses.statVat")} value={fmt(totals.vat)} suffix="SAR" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t("expenses.catFilter")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("expenses.allCats")}</SelectItem>
            {CATS.map((c) => (
              <SelectItem key={c} value={c}>
                {t(CAT_KEY[c])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t("expenses.monthFilter")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("expenses.allMonths")}</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("expenses.logTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {q.isLoading ? (
              <div className="grid place-items-center p-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                {t("expenses.empty")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("expenses.date")}</TableHead>
                    <TableHead>{t("expenses.cat")}</TableHead>
                    <TableHead>{t("expenses.vendor")}</TableHead>
                    <TableHead className="text-end">{t("expenses.amount")}</TableHead>
                    <TableHead>{t("expenses.receipt")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm text-muted-foreground">{r.spent_at}</TableCell>
                      <TableCell>
                        {CAT_KEY[r.category as Cat] ? t(CAT_KEY[r.category as Cat]) : r.category}
                      </TableCell>
                      <TableCell>{r.vendor ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {fmt(Number(r.amount))} {r.currency}
                      </TableCell>
                      <TableCell>
                        {r.receipt_url ? (
                          <a
                            href={r.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ReceiptIcon className="size-4" /> {t("expenses.view")}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button size="icon" variant="ghost" aria-label={t("common.edit") || "تعديل"} onClick={() => openEdit(r)}>
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("common.delete") || "حذف"}
                          onClick={() => {
                            if (confirm(t("expenses.confirmDel"))) del.mutate(r.id);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("expenses.monthlyTotal")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.keys(totals.byMonth).length === 0 ? (
                <div className="text-muted-foreground">—</div>
              ) : (
                Object.entries(totals.byMonth)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([m, v]) => (
                    <div
                      key={m}
                      className="flex justify-between border-b border-border/30 pb-1 last:border-0"
                    >
                      <span className="text-muted-foreground">{m}</span>
                      <span className="tabular-nums font-medium">{fmt(v)}</span>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("expenses.byCat")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.keys(totals.byCat).length === 0 ? (
                <div className="text-muted-foreground">—</div>
              ) : (
                Object.entries(totals.byCat)
                  .sort((a, b) => b[1] - a[1])
                  .map(([c, v]) => (
                    <div
                      key={c}
                      className="flex justify-between border-b border-border/30 pb-1 last:border-0"
                    >
                      <span className="text-muted-foreground">
                        {CAT_KEY[c as Cat] ? t(CAT_KEY[c as Cat]) : c}
                      </span>
                      <span className="tabular-nums font-medium">{fmt(v)}</span>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("expenses.editTitle") : t("expenses.newTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("expenses.dateL")}>
                <Input
                  type="date"
                  value={form.spent_at}
                  onChange={(e) => setForm({ ...form, spent_at: e.target.value })}
                />
              </Field>
              <Field label={t("expenses.catL")}>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as Cat })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(CAT_KEY[c])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label={t("expenses.vendorL")}>
              <Input
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              />
            </Field>
            <Field label={t("expenses.descL")}>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("expenses.amountL")}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
              <Field label={t("expenses.vatL")}>
                <Input
                  type="number"
                  step="0.01"
                  value={form.vat_amount}
                  onChange={(e) => setForm({ ...form, vat_amount: e.target.value })}
                />
              </Field>
              <Field label={t("expenses.currencyL")}>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                />
              </Field>
            </div>
            <Field label={t("expenses.receiptUrl")}>
              <Input
                type="url"
                placeholder="https://…"
                value={form.receipt_url}
                onChange={(e) => setForm({ ...form, receipt_url: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("expenses.cancel")}
            </Button>
            <Button
              disabled={create.isPending || update.isPending || !form.amount}
              onClick={submit}
            >
              {(create.isPending || update.isPending) && (
                <Loader2 className="me-2 size-4 animate-spin" />
              )}{" "}
              {t("expenses.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function QuickStartPanel({
  isAr,
  onPick,
  onOpenWizard,
}: {
  isAr: boolean;
  onPick: (file: File | null) => void;
  onOpenWizard: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const steps = isAr
    ? [
        { icon: Upload, title: "ارفع الإيصال", body: "صورة أو PDF من هاتفك" },
        { icon: ScanLine, title: "قراءة تلقائية", body: "نستخرج المبلغ والتاجر" },
        { icon: CheckCircle2, title: "أرسل للاعتماد", body: "خطوة واحدة وينتهي" },
      ]
    : [
        { icon: Upload, title: "Upload receipt", body: "Photo or PDF from your device" },
        { icon: ScanLine, title: "Auto-read", body: "We extract vendor & amount" },
        { icon: CheckCircle2, title: "Submit", body: "One click to send for approval" },
      ];

  return (
    <Card className="mt-6 overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-background to-blue-500/5">
      <CardContent className="grid gap-4 p-5 md:grid-cols-[1.15fr_1fr] md:gap-6 md:p-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            <Sparkles className="size-3.5" />
            {isAr ? "بدء سريع" : "Quick start"}
          </div>
          <h2 className="mt-3 text-lg font-semibold sm:text-xl">
            {isAr ? "طلب مصروف جديد خلال دقيقة" : "New expense claim in under a minute"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr
              ? "ارفع صورة الإيصال وسنملأ لك الحقول تلقائيًا."
              : "Drop a receipt and we auto-fill the details for you."}
          </p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={i}
                className="rounded-xl border border-border/50 bg-card/60 p-3 text-xs backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <s.icon className="size-4" />
                  <span className="font-semibold text-foreground">{s.title}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{s.body}</div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={onOpenWizard}
              className="bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md hover:from-amber-400 hover:to-amber-500"
            >
              {isAr ? "ابدأ الآن" : "Start now"}
              <ArrowRight className="ms-2 size-4 rtl:rotate-180" />
            </Button>
            <Button variant="ghost" onClick={() => inputRef.current?.click()}>
              <Paperclip className="me-2 size-4" />
              {isAr ? "اختر ملفًا" : "Pick a file"}
            </Button>
          </div>
        </div>

        <label
          htmlFor="quick-receipt"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0] ?? null;
            onPick(f);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
            dragOver
              ? "border-amber-500 bg-amber-500/10"
              : "border-border/60 bg-card/40 hover:border-amber-500/50 hover:bg-amber-500/5"
          }`}
        >
          <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-blue-500/10 text-amber-600 dark:text-amber-400">
            <Upload className="size-6" />
          </div>
          <div className="mt-3 text-sm font-medium">
            {isAr ? "اسحب الإيصال هنا" : "Drop your receipt here"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {isAr ? "JPG، PNG، أو PDF — حتى 10MB" : "JPG, PNG, or PDF — up to 10MB"}
          </div>
          <input
            id="quick-receipt"
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className="mt-3">
          <ReceiptCameraButton onCapture={(f) => onPick(f ?? null)} />
        </div>
      </CardContent>
    </Card>
  );
}


function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {value} {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
