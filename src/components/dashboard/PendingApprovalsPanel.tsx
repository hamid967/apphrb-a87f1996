import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Check,
  X,
  MessageSquare,
  Search,
  Loader2,
  ShieldAlert,
  CalendarRange,
  Filter as FilterIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import {
  listClaimsForReview,
  decideClaim,
} from "@/lib/expense-claims-review.functions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { ADMIN_ROLES } from "@/lib/permissions";

type Claim = {
  id: string;
  claim_number: string | null;
  title: string | null;
  description: string | null;
  amount: number | string;
  currency: string | null;
  category: string | null;
  status: string;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string;
  submitter: { full_name: string | null } | null;
};

type ActionKind = "approve" | "reject" | "return";

const CAT_KEY: Record<string, { ar: string; en: string }> = {
  marketing: { ar: "تسويق", en: "Marketing" },
  rent: { ar: "إيجار", en: "Rent" },
  utilities: { ar: "خدمات", en: "Utilities" },
  salaries: { ar: "رواتب", en: "Salaries" },
  maintenance: { ar: "صيانة", en: "Maintenance" },
  commissions: { ar: "عمولات", en: "Commissions" },
  office: { ar: "مكتب", en: "Office" },
  travel: { ar: "سفر", en: "Travel" },
  software: { ar: "برامج", en: "Software" },
  other: { ar: "أخرى", en: "Other" },
};

export function PendingApprovalsPanel() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { orgId, role } = useCurrentOrg();
  const qc = useQueryClient();

  const isReviewer = !!role && ADMIN_ROLES.includes(role);

  const q = useQuery({
    queryKey: ["claims-for-review", orgId, "pending"],
    queryFn: () =>
      listClaimsForReview({
        data: { org_id: orgId!, status: "submitted", limit: 100 },
      }),
    enabled: !!orgId && isReviewer,
    staleTime: 30_000,
  });

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [dialogFor, setDialogFor] = useState<{
    claim: Claim;
    kind: ActionKind;
  } | null>(null);
  const [reason, setReason] = useState("");

  const rows: Claim[] = (q.data ?? []) as Claim[];

  const categories = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.category && s.add(r.category));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (catFilter !== "all" && r.category !== catFilter) return false;
      const day = (r.submitted_at ?? r.created_at)?.slice(0, 10) ?? "";
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (!needle) return true;
      const hay = `${r.claim_number ?? ""} ${r.title ?? ""} ${r.description ?? ""} ${
        r.submitter?.full_name ?? ""
      }`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, search, catFilter, dateFrom, dateTo]);

  const decide = useMutation({
    mutationFn: decideClaim,
    onSuccess: (_res, vars) => {
      const label =
        vars.data.decision === "approve"
          ? isAr
            ? "تم اعتماد الطلب"
            : "Claim approved"
          : vars.data.decision === "reject"
            ? isAr
              ? "تم رفض الطلب"
              : "Claim rejected"
            : isAr
              ? "تم إعادة الطلب مع تعليق"
              : "Claim returned with a comment";
      toast.success(label);
      qc.invalidateQueries({ queryKey: ["claims-for-review", orgId] });
      qc.invalidateQueries({ queryKey: ["request-badge-counts", orgId] });
      setDialogFor(null);
      setReason("");
    },
    onError: (e: Error) => {
      const msg =
        e.message === "reason_required"
          ? isAr
            ? "السبب مطلوب للرفض أو التعليق"
            : "A reason is required to reject or comment"
          : e.message;
      toast.error(msg);
    },
  });

  const openAction = (claim: Claim, kind: ActionKind) => {
    setReason("");
    setDialogFor({ claim, kind });
  };

  const submitAction = () => {
    if (!dialogFor) return;
    const { claim, kind } = dialogFor;
    if ((kind === "reject" || kind === "return") && !reason.trim()) {
      toast.error(
        isAr ? "يرجى كتابة السبب" : "Please provide a reason",
      );
      return;
    }
    decide.mutate({
      data: {
        claim_id: claim.id,
        decision: kind,
        reason: reason.trim() || null,
      },
    });
  };

  const fmtAmt = (n: number | string, cur: string | null) =>
    `${Number(n).toLocaleString(isAr ? "ar" : "en", { maximumFractionDigits: 2 })} ${cur ?? "SAR"}`;

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(isAr ? "ar" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso.slice(0, 10);
    }
  };

  const catLabel = (c: string | null) => {
    if (!c) return "—";
    const k = CAT_KEY[c];
    return k ? (isAr ? k.ar : k.en) : c;
  };

  if (!isReviewer) {
    return null;
  }

  const dialogTitle = dialogFor
    ? dialogFor.kind === "approve"
      ? isAr
        ? "اعتماد الطلب"
        : "Approve claim"
      : dialogFor.kind === "reject"
        ? isAr
          ? "رفض الطلب"
          : "Reject claim"
        : isAr
          ? "إعادة مع تعليق"
          : "Return with comment"
    : "";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-amber-500" aria-hidden />
            {isAr ? "الموافقات المعلقة" : "Pending approvals"}
            {filtered.length > 0 && (
              <Badge variant="secondary" className="ms-1">
                {filtered.length}
              </Badge>
            )}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "مطالبات المصاريف بانتظار قرارك — قبول أو رفض أو إعادة مع تعليق."
              : "Expense claims awaiting your decision — approve, reject, or return with a comment."}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isAr ? "ابحث برقم/عنوان/مقدّم الطلب" : "Search # / title / submitter"
              }
              className="ps-9"
              aria-label={isAr ? "بحث" : "Search"}
            />
          </div>
          <div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger aria-label={isAr ? "المشروع / الفئة" : "Project / category"}>
                <FilterIcon className="me-2 size-4" aria-hidden />
                <SelectValue
                  placeholder={isAr ? "المشروع / الفئة" : "Project / category"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {isAr ? "كل الفئات" : "All categories"}
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {catLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Label
              htmlFor="approvals-from"
              className="sr-only"
            >
              {isAr ? "من" : "From"}
            </Label>
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
            <Input
              id="approvals-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label={isAr ? "من تاريخ" : "From date"}
            />
          </div>
          <div>
            <Label htmlFor="approvals-to" className="sr-only">
              {isAr ? "إلى" : "To"}
            </Label>
            <Input
              id="approvals-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label={isAr ? "إلى تاريخ" : "To date"}
            />
          </div>
        </div>

        {q.isLoading ? (
          <div className="grid place-items-center p-8">
            <Loader2
              className="size-5 animate-spin text-muted-foreground"
              aria-label={isAr ? "جارٍ التحميل" : "Loading"}
            />
          </div>
        ) : q.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {isAr
              ? "تعذّر تحميل الموافقات المعلقة."
              : "Could not load pending approvals."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? isAr
                ? "لا توجد طلبات بانتظار المراجعة."
                : "No claims awaiting review."
              : isAr
                ? "لا توجد نتائج مطابقة للفلاتر الحالية."
                : "No results match the current filters."}
          </div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-xl border">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-mono">
                      {r.claim_number ?? r.id.slice(0, 6)}
                    </span>
                    <span className="truncate font-medium">
                      {r.title ?? (isAr ? "بدون عنوان" : "Untitled")}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {catLabel(r.category)}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {isAr ? "المُقدّم:" : "By:"}{" "}
                      <span className="text-foreground">
                        {r.submitter?.full_name ?? "—"}
                      </span>
                    </span>
                    <span>
                      {isAr ? "المبلغ:" : "Amount:"}{" "}
                      <span className="tabular-nums text-foreground">
                        {fmtAmt(r.amount, r.currency)}
                      </span>
                    </span>
                    <span>
                      {isAr ? "التاريخ:" : "Date:"}{" "}
                      {fmtDate(r.submitted_at ?? r.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-emerald-600 hover:bg-emerald-500"
                    disabled={decide.isPending}
                    onClick={() => openAction(r, "approve")}
                  >
                    <Check className="me-1 size-4" aria-hidden />
                    {isAr ? "قبول" : "Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={decide.isPending}
                    onClick={() => openAction(r, "reject")}
                  >
                    <X className="me-1 size-4" aria-hidden />
                    {isAr ? "رفض" : "Reject"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => openAction(r, "return")}
                  >
                    <MessageSquare className="me-1 size-4" aria-hidden />
                    {isAr ? "تعليق" : "Comment"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={!!dialogFor}
        onOpenChange={(o) => {
          if (!o) setDialogFor(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          {dialogFor && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="font-medium">
                  {dialogFor.claim.title ?? (isAr ? "بدون عنوان" : "Untitled")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {dialogFor.claim.claim_number ?? dialogFor.claim.id.slice(0, 6)} ·{" "}
                  {fmtAmt(dialogFor.claim.amount, dialogFor.claim.currency)}
                </div>
              </div>
              {dialogFor.kind !== "approve" && (
                <div>
                  <Label htmlFor="approval-reason" className="text-xs">
                    {dialogFor.kind === "reject"
                      ? isAr
                        ? "سبب الرفض"
                        : "Rejection reason"
                      : isAr
                        ? "التعليق"
                        : "Comment"}
                  </Label>
                  <Textarea
                    id="approval-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    placeholder={
                      isAr
                        ? "اكتب سببًا واضحًا سيصل إلى مقدّم الطلب…"
                        : "Write a clear message the submitter will receive…"
                    }
                    autoFocus
                  />
                </div>
              )}
              {dialogFor.kind === "approve" && (
                <p className="text-sm text-muted-foreground">
                  {isAr
                    ? "سيتم اعتماد الطلب وإشعار مقدّمه."
                    : "The claim will be approved and the submitter notified."}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogFor(null)}
              disabled={decide.isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={submitAction}
              disabled={decide.isPending}
              variant={
                dialogFor?.kind === "reject" ? "destructive" : "default"
              }
              className={
                dialogFor?.kind === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : undefined
              }
            >
              {decide.isPending && (
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden />
              )}
              {dialogFor?.kind === "approve"
                ? isAr
                  ? "اعتماد"
                  : "Approve"
                : dialogFor?.kind === "reject"
                  ? isAr
                    ? "رفض"
                    : "Reject"
                  : isAr
                    ? "إرسال التعليق"
                    : "Send comment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
