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
  FileDown,
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
  archiveFinanceExpense,
  createFinanceExpense,
  listExpenseCategories,
  listFinanceExpenses,
  updateFinanceExpense,
} from "@/lib/finance.functions";
import { listMyRecentClaims } from "@/lib/expense-claims.functions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReceiptCameraButton } from "@/components/receipt-camera-button";
import { ListState } from "@/components/common/ListState";
import type { AccountPdfProfile } from "@/lib/pdf/document-types";
import { renderVoucherPdf } from "@/lib/pdf/financial-documents";
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
import { redirect } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const expensesSearchSchema = z.object({
  correct: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/dashboard/expenses")({
  validateSearch: zodValidator(expensesSearchSchema),
  // When linked from a reminder with `?correct=<claim_id>`, forward to the
  // correction wizard so the user lands on the prefilled claim form under
  // /dashboard/expenses without a flash of the list page.
  beforeLoad: ({ search }) => {
    if (search.correct && /^[0-9a-f-]{36}$/i.test(search.correct)) {
      throw redirect({
        to: "/dashboard/expenses/claim/correct",
        search: { original: search.correct } as never,
      });
    }
  },
  head: () =>
    sectionHead({
      section: "dashboard",
      entityAr: "المصروفات",
      entityEn: "Expenses",
      path: "/dashboard/expenses",
    }),
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
  scope: "property" as "property" | "personal",
  spent_at: today(),
  category: "other" as Cat,
  category_id: "",
  vat_mode: "inclusive" as "inclusive" | "exclusive" | "exempt",
  payment_method: "bank_transfer" as "cash" | "bank_transfer" | "cheque" | "mada" | "other",
  vendor: "",
  description: "",
  amount: "",
  currency: "SAR",
  receipt_url: "",
});

function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const orgId = org?.id;
  const orgProfile = org as
    | (typeof org & {
        account_type?: string | null;
        tax_number?: string | null;
        commercial_registration?: string | null;
        national_address?: string | null;
      })
    | undefined;
  const pdfAccount: AccountPdfProfile | null = org
    ? {
        orgId: String(org.id),
        accountType: orgProfile?.account_type ?? null,
        name: (org.name as string) ?? "—",
        logoUrl: (org.logo_url as string | null) ?? null,
        taxNumber: orgProfile?.tax_number ?? null,
        commercialRegistration: orgProfile?.commercial_registration ?? null,
        nationalAddress: orgProfile?.national_address ?? null,
      }
    : null;

  const q = useQuery({
    queryKey: ["finance-expenses", orgId],
    queryFn: () => listFinanceExpenses({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });

  const catsQ = useQuery({
    queryKey: ["expense-categories", orgId],
    queryFn: () => listExpenseCategories({ data: { org_id: orgId! } }),
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
  const [scopeFilter, setScopeFilter] = useState<string>("property");

  const rows = useMemo<Row[]>(() => q.data ?? [], [q.data]);

  const months = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(monthKey(r.spent_at));
    return Array.from(s).sort().reverse();
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (scopeFilter !== "all" && r.scope !== scopeFilter) return false;
        const categoryName = r.category_ref?.name_en ?? r.category;
        if (catFilter !== "all" && String(r.category_id ?? categoryName) !== catFilter)
          return false;
        if (monthFilter !== "all" && monthKey(r.spent_at) !== monthFilter) return false;
        return true;
      }),
    [rows, catFilter, monthFilter, scopeFilter],
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
      scope: r.scope ?? "property",
      spent_at: r.spent_at,
      category: r.category,
      category_id: r.category_id ?? "",
      vat_mode: r.vat_mode ?? "inclusive",
      payment_method: r.payment_method ?? "bank_transfer",
      vendor: r.vendor ?? "",
      description: r.description ?? "",
      amount: String(r.gross_amount ?? r.amount),
      currency: r.currency ?? "SAR",
      receipt_url: r.receipt_url ?? "",
    });
    setOpen(true);
  };

  const create = useMutation({
    mutationFn: createFinanceExpense,
    onSuccess: () => {
      toast.success(t("expenses.saved"));
      qc.invalidateQueries({ queryKey: ["finance-expenses", orgId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: updateFinanceExpense,
    onSuccess: () => {
      toast.success(t("expenses.updated"));
      qc.invalidateQueries({ queryKey: ["finance-expenses", orgId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => archiveFinanceExpense({ data: { id } }),
    onSuccess: () => {
      toast.success(t("expenses.deleted"));
      qc.invalidateQueries({ queryKey: ["finance-expenses", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    const base = {
      spent_at: form.spent_at,
      category: form.category,
      category_id: form.category_id || null,
      scope: form.scope,
      vat_mode: form.vat_mode,
      payment_method: form.payment_method,
      vendor: form.vendor || null,
      description: form.description || null,
      amount: Number(form.amount),
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
  const label = (ar: string, en: string) => (isAr ? ar : en);
  const cats = catsQ.data ?? [];
  const visibleCats = cats.filter((c: Row) => scopeFilter === "all" || c.scope === scopeFilter);

  const goToClaim = () => navigate({ to: "/dashboard/expenses/claim", search: {} as never });
  const exportExpenseVoucher = async (row: Row) => {
    if (!pdfAccount) {
      toast.error(label("بيانات الحساب غير متاحة", "Account profile is unavailable"));
      return;
    }
    try {
      const party =
        row.vendor_ref?.name ??
        row.vendor ??
        (row.scope === "personal"
          ? label("مصروف شخصي", "Personal expense")
          : row.property?.title_ar ||
            row.property?.title_en ||
            label("مصروف عقاري", "Property expense"));
      const category = row.category_ref
        ? isAr
          ? row.category_ref.name_ar
          : row.category_ref.name_en
        : CAT_KEY[row.category as Cat]
          ? t(CAT_KEY[row.category as Cat])
          : row.category;
      const result = await renderVoucherPdf({
        account: pdfAccount,
        templateKey: "official",
        voucherType: "payment",
        voucherNumber: `EXP-${String(row.id).slice(0, 8).toUpperCase()}`,
        amount: Number(row.gross_amount ?? row.amount ?? 0),
        partyName: party,
        statement:
          row.description || `${label("مصروف", "Expense")} - ${category} - ${row.spent_at}`,
        paymentMethod: row.payment_method ?? label("غير محدد", "Unspecified"),
      });
      result.open();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : label("تعذر توليد سند PDF", "Could not generate PDF"),
      );
    }
  };
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
    navigate({ to: "/dashboard/expenses/claim", search: {} as never });
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
            className="bg-gradient-to-r from-warning to-warning text-white shadow-lg hover:from-warning hover:to-warning"
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
        <Link
          to="/dashboard/expenses/review"
          search={{} as never}
          className="text-sm text-primary hover:underline"
        >
          {t("claimsReview.linkFromExpenses")}
        </Link>
      </div>

      <QuickStartPanel isAr={isAr} onPick={onQuickReceiptPicked} onOpenWizard={goToClaim} />

      <MonthlySummaryPanel
        isAr={isAr}
        rows={rows}
        claims={claimsQ.data ?? []}
        loading={q.isLoading || claimsQ.isLoading}
      />

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <StatCard label={t("expenses.statCount")} value={String(filtered.length)} />
        <StatCard label={t("expenses.statTotal")} value={fmt(totals.total)} suffix="SAR" />
        <StatCard label={t("expenses.statVat")} value={fmt(totals.vat)} suffix="SAR" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger>
            <SelectValue placeholder={label("النطاق", "Scope")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{label("كل النطاقات", "All scopes")}</SelectItem>
            <SelectItem value="property">{label("عقارية", "Property")}</SelectItem>
            <SelectItem value="personal">{label("شخصية", "Personal")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t("expenses.catFilter")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("expenses.allCats")}</SelectItem>
            {visibleCats.map((c: Row) => (
              <SelectItem key={c.id} value={c.id}>
                {isAr ? c.name_ar : c.name_en}
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
            <ListState
              isLoading={q.isLoading}
              isError={q.isError}
              errorMessage={q.error instanceof Error ? q.error.message : null}
              isEmpty={filtered.length === 0}
              emptyText={t("expenses.empty")}
              onRetry={() => q.refetch()}
              className="rounded-none border-0 shadow-none"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("expenses.date")}</TableHead>
                    <TableHead>{label("النطاق", "Scope")}</TableHead>
                    <TableHead>{t("expenses.cat")}</TableHead>
                    <TableHead>{t("expenses.vendor")}</TableHead>
                    <TableHead className="text-end">{label("الصافي", "Net")}</TableHead>
                    <TableHead className="text-end">{label("الضريبة", "VAT")}</TableHead>
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
                        <Badge variant="outline">
                          {r.scope === "personal"
                            ? label("شخصي", "Personal")
                            : label("عقاري", "Property")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.category_ref
                          ? isAr
                            ? r.category_ref.name_ar
                            : r.category_ref.name_en
                          : CAT_KEY[r.category as Cat]
                            ? t(CAT_KEY[r.category as Cat])
                            : r.category}
                      </TableCell>
                      <TableCell>{r.vendor_ref?.name ?? r.vendor ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {fmt(Number(r.net_amount ?? r.amount))} {r.currency}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {fmt(Number(r.vat_amount ?? 0))} {r.currency}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {fmt(Number(r.gross_amount ?? r.amount))} {r.currency}
                      </TableCell>
                      <TableCell>
                        {r.receipt_url || r.receipt_path ? (
                          <a
                            href={r.receipt_url || "#"}
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
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={label("سند PDF", "PDF voucher")}
                          onClick={() => exportExpenseVoucher(r)}
                        >
                          <FileDown className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("common.edit") || "تعديل"}
                          onClick={() => openEdit(r)}
                        >
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
            </ListState>
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
              <Field label={label("النطاق", "Scope")}>
                <Select
                  value={form.scope}
                  onValueChange={(v) =>
                    setForm({ ...form, scope: v as "property" | "personal", category_id: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="property">{label("عقاري", "Property")}</SelectItem>
                    <SelectItem value="personal">{label("شخصي", "Personal")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("expenses.dateL")}>
                <Input
                  type="date"
                  value={form.spent_at}
                  onChange={(e) => setForm({ ...form, spent_at: e.target.value })}
                />
              </Field>
              <Field label={t("expenses.catL")}>
                <Select
                  value={form.category_id || "none"}
                  onValueChange={(v) => {
                    const selected = cats.find((c: Row) => c.id === v);
                    setForm({
                      ...form,
                      category_id: v === "none" ? "" : v,
                      category: selected?.name_en === "Maintenance" ? "maintenance" : "other",
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{label("بدون تصنيف", "No category")}</SelectItem>
                    {cats
                      .filter((c: Row) => c.scope === form.scope)
                      .map((c: Row) => (
                        <SelectItem key={c.id} value={c.id}>
                          {isAr ? c.name_ar : c.name_en}
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
              <Field label={label("الضريبة", "VAT")}>
                <Select
                  value={form.vat_mode}
                  onValueChange={(v) => setForm({ ...form, vat_mode: v as typeof form.vat_mode })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inclusive">{label("شامل 15%", "Inclusive 15%")}</SelectItem>
                    <SelectItem value="exclusive">
                      {label("غير شامل 15%", "Exclusive 15%")}
                    </SelectItem>
                    <SelectItem value="exempt">{label("معفى", "Exempt")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("expenses.currencyL")}>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                />
              </Field>
            </div>
            <Field label={label("طريقة الدفع", "Payment method")}>
              <Select
                value={form.payment_method}
                onValueChange={(v) =>
                  setForm({ ...form, payment_method: v as typeof form.payment_method })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{label("نقد", "Cash")}</SelectItem>
                  <SelectItem value="bank_transfer">{label("تحويل", "Bank transfer")}</SelectItem>
                  <SelectItem value="cheque">{label("شيك", "Cheque")}</SelectItem>
                  <SelectItem value="mada">{label("مدى", "Mada")}</SelectItem>
                  <SelectItem value="other">{label("أخرى", "Other")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
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
    <Card className="mt-6 overflow-hidden border-warning/20 bg-gradient-to-br from-warning/10 via-background to-info/5">
      <CardContent className="grid gap-4 p-5 md:grid-cols-[1.15fr_1fr] md:gap-6 md:p-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning dark:text-warning">
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
                <div className="flex items-center gap-2 text-warning dark:text-warning">
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
              className="bg-gradient-to-r from-warning to-warning text-white shadow-md hover:from-warning hover:to-warning"
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
              ? "border-warning bg-warning/10"
              : "border-border/60 bg-card/40 hover:border-warning/50 hover:bg-warning/5"
          }`}
        >
          <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-warning/20 to-info/10 text-warning dark:text-warning">
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

function MonthlySummaryPanel({
  isAr,
  rows,
  claims,
  loading,
}: {
  isAr: boolean;
  rows: Row[];
  claims: Array<{ status: string; amount: number | string }>;
  loading: boolean;
}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthLabel = new Date().toLocaleDateString(isAr ? "ar" : "en", {
    month: "long",
    year: "numeric",
  });
  const fmt = (n: number) => n.toLocaleString(isAr ? "ar" : "en", { maximumFractionDigits: 2 });

  const monthRows = rows.filter((r) => monthKey(r.spent_at) === currentMonth);
  const total = monthRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const byCat: Record<string, number> = {};
  monthRows.forEach((r) => {
    byCat[r.category] = (byCat[r.category] ?? 0) + Number(r.amount ?? 0);
  });
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = sortedCats[0]?.[1] ?? 0;

  const statusCounts = { approved: 0, rejected: 0, pending: 0 };
  claims.forEach((c) => {
    if (c.status === "approved") statusCounts.approved += 1;
    else if (c.status === "rejected") statusCounts.rejected += 1;
    else if (c.status === "submitted" || c.status === "in_review") statusCounts.pending += 1;
  });

  const t = (ar: string, en: string) => (isAr ? ar : en);

  return (
    <Card className="mt-6 overflow-hidden border-success/20 bg-gradient-to-br from-success/5 via-background to-warning/5">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success dark:text-success">
            <Wallet className="size-3.5" />
            {t("ملخص الشهر الحالي", "Current month summary")}
          </div>
          <CardTitle className="mt-2 text-lg sm:text-xl">{monthLabel}</CardTitle>
        </div>
        <div className="text-end">
          <div className="text-xs text-muted-foreground">
            {t("إجمالي الإنفاق", "Total spending")}
          </div>
          <div className="text-2xl font-semibold tabular-nums sm:text-3xl">
            {loading ? "—" : fmt(total)} <span className="text-sm text-muted-foreground">SAR</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {monthRows.length} {t("عملية", "entries")}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4 backdrop-blur">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Layers className="size-4 text-success dark:text-success" />
            {t("الإنفاق حسب الفئة", "Spending by category")}
          </div>
          {loading ? (
            <div className="grid place-items-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : sortedCats.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("لا توجد مصاريف هذا الشهر", "No expenses yet this month")}
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedCats.slice(0, 6).map(([cat, amt]) => {
                const pct = maxCat > 0 ? Math.round((amt / maxCat) * 100) : 0;
                const shareOfTotal = total > 0 ? Math.round((amt / total) * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        {CAT_KEY[cat as Cat]
                          ? isAr
                            ? {
                                marketing: "تسويق",
                                rent: "إيجار",
                                utilities: "خدمات",
                                salaries: "رواتب",
                                maintenance: "صيانة",
                                commissions: "عمولات",
                                office: "مكتب",
                                travel: "سفر",
                                software: "برامج",
                                other: "أخرى",
                              }[cat as Cat]
                            : cat.charAt(0).toUpperCase() + cat.slice(1)
                          : cat}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmt(amt)} SAR · {shareOfTotal}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-success to-success"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-3">
          <div className="text-sm font-semibold">{t("حالة طلباتي", "My claims status")}</div>
          <div className="grid grid-cols-3 gap-2">
            <StatusCard
              icon={CheckCircle2}
              tone="pos"
              label={t("مقبولة", "Approved")}
              value={statusCounts.approved}
              loading={loading}
            />
            <StatusCard
              icon={Clock}
              tone="warn"
              label={t("بانتظار الموافقة", "Pending")}
              value={statusCounts.pending}
              loading={loading}
            />
            <StatusCard
              icon={XCircle}
              tone="neg"
              label={t("مرفوضة", "Rejected")}
              value={statusCounts.rejected}
              loading={loading}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("يعرض حالة آخر 50 مطالبة قدمتها.", "Showing your last 50 submitted claims.")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusCard({
  icon: Icon,
  tone,
  label,
  value,
  loading,
}: {
  icon: typeof CheckCircle2;
  tone: "pos" | "warn" | "neg";
  label: string;
  value: number;
  loading: boolean;
}) {
  const toneCls =
    tone === "pos"
      ? "border-success/30 bg-success/10 text-success dark:text-success"
      : tone === "warn"
        ? "border-warning/30 bg-warning/10 text-warning dark:text-warning"
        : "border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive";
  return (
    <div className={`rounded-2xl border p-3 backdrop-blur ${toneCls}`} role="status">
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-90">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : value}</div>
    </div>
  );
}
