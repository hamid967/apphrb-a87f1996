import { createFileRoute, Link } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getAuditLogById, type AuditLogRow, type JsonValue } from "@/lib/audit-log.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowLeftRight, Eye, EyeOff, Loader2, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/audit/$id")({
  head: ({ params }) => detailHead({ entityAr: 'سجل تدقيق', entityEn: 'Audit Entry', id: String(params.id), path: `/dashboard/audit/${params.id}`, kind: 'docs' }),
  component: GlobalAuditDetail,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{String(error?.message ?? error)}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">غير موجود</div>
  ),
});

const ACTION_LABEL: Record<string, string> = {
  insert: "إنشاء",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  archive: "أرشفة",
  restore: "استعادة",
  publish: "نشر",
  cancel: "إلغاء",
  bid: "مزايدة",
  finalize: "إنهاء",
  win: "فوز",
};

// Arabic labels for common auditable fields across entities.
const FIELD_LABEL: Record<string, string> = {
  title_ar: "العنوان (عربي)",
  title_en: "العنوان (إنجليزي)",
  description: "الوصف",
  status: "الحالة",
  starting_price: "سعر البداية",
  reserve_price: "السعر الاحتياطي",
  min_increment: "الحد الأدنى للزيادة",
  current_high: "أعلى مزايدة حالية",
  currency: "العملة",
  start_at: "تاريخ البدء",
  end_at: "تاريخ الانتهاء",
  property_id: "العقار",
  amount: "المبلغ",
  price: "السعر",
  quantity: "الكمية",
  discount: "الخصم",
  tax_rate: "نسبة الضريبة",
  due_date: "تاريخ الاستحقاق",
  issue_date: "تاريخ الإصدار",
  paid_at: "تاريخ الدفع",
  method_id: "طريقة الدفع",
  bank_id: "البنك",
  tenant_id: "المستأجر",
  owner_id: "المالك",
  contact_id: "جهة الاتصال",
  contract_number: "رقم العقد",
  type: "النوع",
  notes: "ملاحظات",
  reason: "السبب",
  assigned_to: "المُسند إليه",
  priority: "الأولوية",
  category: "التصنيف",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  scheduled: "مجدول",
  live: "جارٍ",
  ended: "منتهي",
  finalized: "مُحسم",
  cancelled: "ملغى",
  cancel: "ملغى",
  active: "نشط",
  inactive: "غير نشط",
  pending: "بانتظار",
  paid: "مدفوع",
  unpaid: "غير مدفوع",
  overdue: "متأخر",
  open: "مفتوح",
  closed: "مغلق",
  in_progress: "قيد التنفيذ",
  resolved: "محلول",
  approved: "موافَق",
  rejected: "مرفوض",
};

function labelField(k: string): string {
  return FIELD_LABEL[k] ?? k;
}

function actionVariant(a: string): "default" | "secondary" | "destructive" | "outline" {
  if (a === "create" || a === "insert" || a === "restore") return "default";
  if (a === "delete" || a === "cancel" || a === "archive") return "destructive";
  if (a === "update") return "secondary";
  return "outline";
}

function fmt(v: unknown, field?: string): string {
  if (v == null || v === "") return "—";
  if (field === "status" && typeof v === "string" && STATUS_LABEL[v]) return STATUS_LABEL[v];
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString("ar");
    }
    return v;
  }
  return JSON.stringify(v);
}

function describeChange(field: string, before: unknown, after: unknown): string {
  const label = labelField(field);
  const b = fmt(before, field);
  const a = fmt(after, field);
  if (before == null || before === "") return `تم تعيين ${label} إلى ${a}`;
  if (after == null || after === "") return `تم إزالة قيمة ${label} (كانت ${b})`;
  if (field === "status") return `تغيّرت ${label} من ${b} إلى ${a}`;
  return `تغيّر ${label} من ${b} إلى ${a}`;
}

type Change = { field: string; before: unknown; after: unknown; changed: boolean };

function buildDiff(before: Record<string, unknown>, after: Record<string, unknown>): Change[] {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys.map((k) => {
    const b = before[k];
    const a = after[k];
    return { field: k, before: b, after: a, changed: JSON.stringify(b) !== JSON.stringify(a) };
  });
}

function GlobalAuditDetail() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { id } = Route.useParams();
  const get = useServerFn(getAuditLogById);
  const q = useQuery({
    queryKey: ["global-audit-entry", id],
    queryFn: () => get({ data: { id } }),
  });

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <ScrollText className="size-6 text-primary" />{" "}
            {isAr ? "تفاصيل سجل التدقيق" : "Audit log details"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAr
              ? "وصف مبسّط للإجراء مع مقارنة قبل/بعد."
              : "Plain-language summary with before/after diff."}
          </p>
        </div>
        <Button asChild variant="ghost" className="gap-2">
          <Link to="/dashboard/audit">
            <ArrowLeft className="size-4" /> {isAr ? "عودة للسجل" : "Back to log"}
          </Link>
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : q.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {String((q.error as Error)?.message ?? q.error)}
        </div>
      ) : !q.data ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {isAr
            ? "السجل غير موجود أو ليس لديك صلاحية للوصول إليه."
            : "This entry doesn't exist or you don't have permission to view it."}
        </div>
      ) : (
        <DetailBody row={q.data} isAr={isAr} />
      )}
    </div>
  );
}

function DetailBody({ row, isAr }: { row: AuditLogRow; isAr: boolean }) {
  const d = (row.diff ?? {}) as Record<string, unknown>;
  const isUpdate =
    row.action === "update" &&
    d.before &&
    typeof d.before === "object" &&
    d.after &&
    typeof d.after === "object";
  const changes: Change[] = isUpdate
    ? buildDiff(d.before as Record<string, unknown>, d.after as Record<string, unknown>)
    : [];
  const changedOnly = changes.filter((c) => c.changed);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const visible = showUnchanged ? changes : changedOnly;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={actionVariant(row.action)}>
              {ACTION_LABEL[row.action] ?? row.action}
            </Badge>
            <span className="text-xs text-muted-foreground">{row.entity}</span>
          </div>
          <CardTitle className="mt-2 text-lg">
            {row.action} {isAr ? "على" : "on"} {row.entity}
          </CardTitle>
          <CardDescription>
            {new Date(row.created_at).toLocaleString(isAr ? "ar" : "en")} ·{" "}
            {isAr ? "فاعل:" : "Actor:"}{" "}
            <span dir="ltr" className="font-mono">
              {row.actor ? row.actor.slice(0, 8) + "…" : isAr ? "نظام" : "system"}
            </span>
            {isAr ? " · معرّف الكيان: " : " · Entity ID: "}
            <span dir="ltr" className="font-mono">
              {row.entity_id.slice(0, 8)}…
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      {isUpdate ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {isAr ? "ملخّص التغييرات" : "Change summary"}
                  </CardTitle>
                  <CardDescription>
                    {changedOnly.length > 0
                      ? isAr
                        ? `${changedOnly.length} حقل تغيّر من أصل ${changes.length}`
                        : `${changedOnly.length} of ${changes.length} fields changed`
                      : isAr
                        ? "لا توجد فروقات فعلية بين الحالتين"
                        : "No effective differences between states"}
                  </CardDescription>
                </div>
                {changes.length > changedOnly.length && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setShowUnchanged((v) => !v)}
                  >
                    {showUnchanged ? (
                      <>
                        <EyeOff className="size-4" />{" "}
                        {isAr ? "أخفِ غير المتغيّر" : "Hide unchanged"}
                      </>
                    ) : (
                      <>
                        <Eye className="size-4" />{" "}
                        {isAr
                          ? `أظهر كل الحقول (${changes.length})`
                          : `Show all fields (${changes.length})`}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            {changedOnly.length > 0 && (
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {changedOnly.map((c) => (
                    <li
                      key={c.field}
                      className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5"
                    >
                      <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{describeChange(c.field, c.before, c.after)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>

          {visible.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {isAr ? "مقارنة قبل / بعد" : "Before / after"}
                </CardTitle>
                <CardDescription>
                  {showUnchanged
                    ? isAr
                      ? "جميع الحقول — المتغيّرة مُظلَّلة"
                      : "All fields — changed rows highlighted"
                    : isAr
                      ? "الحقول المتغيّرة فقط"
                      : "Changed fields only"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-start text-xs text-muted-foreground">
                        <th className="py-2 pl-3 font-medium">{isAr ? "الحقل" : "Field"}</th>
                        <th className="py-2 pl-3 font-medium">{isAr ? "قبل" : "Before"}</th>
                        <th className="py-2 font-medium">{isAr ? "بعد" : "After"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((c) => (
                        <tr
                          key={c.field}
                          className={`border-b last:border-0 ${c.changed ? "bg-primary/5" : ""}`}
                        >
                          <td className="py-2 pl-3 align-top">
                            <div className="font-medium">{labelField(c.field)}</div>
                            {labelField(c.field) !== c.field && (
                              <div
                                dir="ltr"
                                className="font-mono text-[10px] text-muted-foreground"
                              >
                                {c.field}
                              </div>
                            )}
                          </td>
                          <td className="py-2 pl-3 align-top">
                            <span
                              className={
                                c.changed
                                  ? "rounded bg-destructive/10 px-1.5 py-0.5 text-destructive line-through decoration-destructive/60"
                                  : "text-muted-foreground"
                              }
                            >
                              {fmt(c.before, c.field)}
                            </span>
                          </td>
                          <td className="py-2 align-top">
                            <span
                              className={
                                c.changed
                                  ? "rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400"
                                  : "text-muted-foreground"
                              }
                            >
                              {fmt(c.after, c.field)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isAr ? "تفاصيل الإجراء" : "Action details"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(d)
                .filter(([k]) => k !== "org_id")
                .map(([k, v]) => (
                  <div key={k} className="rounded-md border bg-muted/30 p-3">
                    <dt className="text-xs text-muted-foreground">{labelField(k)}</dt>
                    <dd className="mt-1 break-words text-sm">{fmt(v, k)}</dd>
                  </div>
                ))}
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "JSON الخام" : "Raw JSON"}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre dir="ltr" className="max-h-96 overflow-auto rounded bg-muted p-3 text-[11px]">
            {JSON.stringify(row.diff as JsonValue, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}
