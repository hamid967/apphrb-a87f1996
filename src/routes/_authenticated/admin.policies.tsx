import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireRole } from "@/components/auth/RequireRole";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { ADMIN_ROLES } from "@/lib/permissions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader, AdminPageLoading } from "@/components/admin/AdminPageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, Plus, Save, Trash2, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Sparkles, Wand2, FlaskConical, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { generatePoliciesFromDescription, type AiPolicyDraft } from "@/lib/ai-policies.functions";
import { evaluateDraftPolicy, type DraftEvalResult } from "@/lib/policy-engine.functions";
import { Can } from "@/components/auth/Can";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/policies")({
  head: () => sectionHead({ section: "admin", entityAr: "السياسات", entityEn: "Policies", path: "/admin/policies" }),
  component: () => (
    <RequireRole roles={ADMIN_ROLES}>
      <RequirePermission permission="screen.admin.view">
        <PoliciesAdmin />
      </RequirePermission>
    </RequireRole>
  ),
});

type Policy = {
  id: string;
  org_id: string;
  category: string;
  max_amount: number | null;
  currency: string;
  note: string | null;
  active: boolean;
  updated_at: string;
  rule_type: RuleType;
  keywords: string[];
  period_days: number | null;
  severity: "warn" | "block";
};

type RuleType =
  | "max_amount"
  | "requires_receipt"
  | "requires_description"
  | "forbidden_keywords"
  | "max_per_period";

const RULE_TYPES: { value: RuleType; ar: string; en: string }[] = [
  { value: "max_amount", ar: "حد أقصى لكل مطالبة", en: "Max amount per claim" },
  { value: "max_per_period", ar: "حد إجمالي خلال فترة (أيام)", en: "Max total over N days" },
  { value: "requires_receipt", ar: "يتطلب إيصالاً", en: "Requires receipt" },
  { value: "requires_description", ar: "يتطلب وصفاً", en: "Requires description" },
  { value: "forbidden_keywords", ar: "كلمات محظورة", en: "Forbidden keywords" },
];

type Violation = {
  id: string;
  claim_id: string;
  rule_type: string;
  severity: string;
  category: string | null;
  reason: string;
  amount: number | null;
  limit_amount: number | null;
  currency: string | null;
  created_at: string;
  claim?: { claim_number: string; title: string; status: string } | null;
};

const CATEGORIES = [
  "maintenance",
  "utilities",
  "marketing",
  "salaries",
  "supplies",
  "travel",
  "general",
  "*",
];
const CURRENCIES = ["SAR", "AED", "USD", "EUR"];

function PoliciesAdmin() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || "ar").startsWith("ar");
  const { orgId, ready } = useCurrentOrg();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["spending_policies", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spending_policies")
        .select("*")
        .eq("org_id", orgId!)
        .order("category");
      if (error) throw error;
      return (data ?? []) as Policy[];
    },
  });

  const [form, setForm] = useState({
    category: "maintenance",
    rule_type: "max_amount" as RuleType,
    max_amount: "1000",
    currency: "SAR",
    note: "",
    keywords: "",
    period_days: "30",
    severity: "warn" as "warn" | "block",
    active: true,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error(isAr ? "لا توجد مؤسسة" : "No organization");
      if (!form.category.trim()) throw new Error(isAr ? "الفئة مطلوبة" : "Category is required");
      const needsAmount = form.rule_type === "max_amount" || form.rule_type === "max_per_period";
      const amount = needsAmount ? Number(form.max_amount) : null;
      if (needsAmount && (!Number.isFinite(amount as number) || (amount as number) <= 0)) {
        throw new Error(isAr ? "يجب أن يكون الحد الأقصى أكبر من صفر" : "Max amount must be > 0");
      }
      const kw =
        form.rule_type === "forbidden_keywords"
          ? form.keywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean)
          : [];
      if (form.rule_type === "forbidden_keywords" && kw.length === 0) {
        throw new Error(isAr ? "أضف كلمة مفتاحية واحدة على الأقل" : "Add at least one keyword");
      }
      const { error } = await supabase.from("spending_policies").insert({
        org_id: orgId,
        category: form.category.trim(),
        rule_type: form.rule_type,
        max_amount: amount,
        currency: form.currency,
        note: form.note.trim() || null,
        keywords: kw,
        period_days: form.rule_type === "max_per_period" ? Number(form.period_days) || 30 : null,
        severity: form.severity,
        active: form.active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isAr ? "تم إنشاء السياسة" : "Policy created");
      qc.invalidateQueries({ queryKey: ["spending_policies", orgId] });
      setForm((f) => ({ ...f, note: "" }));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل الإنشاء" : "Failed to create"),
  });

  const update = useMutation({
    mutationFn: async (p: Partial<Policy> & { id: string }) => {
      const { id, ...rest } = p;
      const { error } = await supabase.from("spending_policies").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spending_policies", orgId] }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل التحديث" : "Update failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("spending_policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isAr ? "تم الحذف" : "Deleted");
      qc.invalidateQueries({ queryKey: ["spending_policies", orgId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل الحذف" : "Delete failed"),
  });

  const [testResult, setTestResult] = useState<null | {
    policies: number;
    claims_created: number;
    total_violations_logged: number;
  }>(null);
  const runTest = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("seed_spending_policies");
      if (error) throw error;
      return data as { policies: number; claims_created: number; total_violations_logged: number };
    },
    onSuccess: (data) => {
      setTestResult(data);
      toast.success(
        isAr
          ? `اكتمل الاختبار — تسجيل ${data.total_violations_logged} مخالفة`
          : `Test complete — ${data.total_violations_logged} violation(s) logged`,
      );
      qc.invalidateQueries({ queryKey: ["spending_policies", orgId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشل الاختبار" : "Test failed"),
  });

  const activeCount = useMemo(() => (list.data ?? []).filter((p) => p.active).length, [list.data]);

  const violations = useQuery({
    queryKey: ["policy_violations", orgId],
    enabled: !!orgId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("policy_violations")
        .select(
          "id, claim_id, rule_type, severity, category, reason, amount, limit_amount, currency, created_at, claim:expense_claims!inner(claim_number, title, status)",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Violation[];
    },
  });

  if (!ready) {
    return (
      <AdminPageLoading
        ar="سياسات الإنفاق"
        en="Spending Policies"
        icon={ShieldCheck}
        descriptionAr="أنشئ حدودًا للإنفاق لكل فئة؛ تُسجَّل المخالفات تلقائيًا في سجل التدقيق."
        descriptionEn="Create per-category spending caps. Violations are logged automatically to the audit log."
      />
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <AdminPageHeader
        ar="سياسات الإنفاق"
        en="Spending Policies"
        icon={ShieldCheck}
        descriptionAr="أنشئ حدودًا للإنفاق لكل فئة؛ تُسجَّل المخالفات تلقائيًا في سجل التدقيق."
        descriptionEn="Create per-category spending caps. Violations are logged automatically to the audit log."
        actions={
          <>
            <Badge variant="secondary">
              {activeCount} {isAr ? "نشطة" : "active"}
            </Badge>
            <Can permission="button.expense.approve">
              <AiGenerateDialog
                orgId={orgId}
                isAr={isAr}
                onCreated={() => {
                  qc.invalidateQueries({ queryKey: ["spending_policies", orgId] });
                  runTest.mutate();
                }}
              />
            </Can>
            <Can permission="button.expense.approve">
              <Button
                onClick={() => runTest.mutate()}
                disabled={runTest.isPending}
                className="gap-2"
              >
                {runTest.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isAr ? "تشغيل اختبار سريع" : "Run quick test"}
              </Button>
            </Can>
          </>
        }
      />

      {testResult && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />{" "}
              {isAr ? "نتيجة الاختبار" : "Test result"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <Stat label={isAr ? "السياسات المتاحة" : "Policies present"} value={testResult.policies} />
            <Stat label={isAr ? "مطالبات اختبار أُنشئت" : "Test claims created"} value={testResult.claims_created} />
            <Stat label={isAr ? "مخالفات مسجّلة" : "Violations logged"} value={testResult.total_violations_logged} highlight />
          </CardContent>
        </Card>
      )}

      <ViolationsCard v={violations.data ?? []} loading={violations.isLoading} isAr={isAr} />

      <Can permission="button.expense.approve">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-4 w-4" /> {isAr ? "سياسة جديدة" : "New policy"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="md:col-span-2 space-y-1.5">
                <Label>{isAr ? "نوع القاعدة" : "Rule type"}</Label>
                <Select
                  value={form.rule_type}
                  onValueChange={(v) => setForm({ ...form, rule_type: v as RuleType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {isAr ? r.ar : r.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>{isAr ? "الفئة" : "Category (name)"}</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(form.rule_type === "max_amount" || form.rule_type === "max_per_period") && (
                <div className="space-y-1.5">
                  <Label>{isAr ? "الحد الأقصى" : "Max amount"}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.max_amount}
                    onChange={(e) => setForm({ ...form, max_amount: e.target.value })}
                  />
                </div>
              )}
              {form.rule_type === "max_per_period" && (
                <div className="space-y-1.5">
                  <Label>{isAr ? "الفترة (أيام)" : "Period (days)"}</Label>
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={form.period_days}
                    onChange={(e) => setForm({ ...form, period_days: e.target.value })}
                  />
                </div>
              )}
              {form.rule_type === "forbidden_keywords" && (
                <div className="md:col-span-2 space-y-1.5">
                  <Label>{isAr ? "الكلمات (مفصولة بفواصل)" : "Keywords (comma-separated)"}</Label>
                  <Input
                    value={form.keywords}
                    onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                    placeholder={isAr ? "كحول، بطاقة هدية، شخصي" : "alcohol, gift card, personal"}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{isAr ? "العملة" : "Currency"}</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? "الشدّة" : "Severity"}</Label>
                <Select
                  value={form.severity}
                  onValueChange={(v) => setForm({ ...form, severity: v as "warn" | "block" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warn">{isAr ? "تحذير (تعليم)" : "Warn (flag)"}</SelectItem>
                    <SelectItem value="block">{isAr ? "حظر (يتطلب مراجعة)" : "Block (require review)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>{isAr ? "ملاحظة" : "Note"}</Label>
                <Textarea
                  rows={1}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder={isAr ? "وصف اختياري…" : "Optional description…"}
                />
              </div>
              <div className="md:col-span-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.active}
                    onCheckedChange={(v) => setForm({ ...form, active: v })}
                  />
                  <Label className="cursor-pointer">{isAr ? "تفعيل عند الإنشاء" : "Active on create"}</Label>
                </div>
                <Button
                  onClick={() => create.mutate()}
                  disabled={create.isPending}
                  className="gap-2"
                >
                  {create.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {isAr ? "إنشاء سياسة" : "Create policy"}
                </Button>
              </div>
              <div className="md:col-span-6">
                <DraftPolicyTester form={form} isAr={isAr} />
              </div>
            </div>
          </CardContent>
        </Card>
      </Can>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isAr ? "السياسات الحالية" : "Existing policies"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {isAr ? "جارٍ التحميل…" : "Loading…"}
            </div>
          ) : (list.data ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {isAr
                ? "لا توجد سياسات بعد. أنشئ واحدة أعلاه أو شغّل الاختبار السريع لبثّ القيم الافتراضية."
                : "No policies yet. Create one above or run the quick test to seed defaults."}
            </div>
          ) : (
            <div className="divide-y">
              {list.data!.map((p) => (
                <PolicyRow
                  key={p.id}
                  p={p}
                  onUpdate={update.mutate}
                  onDelete={remove.mutate}
                  saving={update.isPending}
                  isAr={isAr}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"text-2xl font-semibold " + (highlight ? "text-amber-600" : "")}>{value}</div>
    </div>
  );
}

function ViolationsCard({ v, loading, isAr }: { v: Violation[]; loading: boolean; isAr: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {isAr ? "المطالبات المُعلَّمة" : "Flagged submissions"}
          <Badge variant="secondary" className="ml-2">
            {v.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> {isAr ? "جارٍ تحميل المخالفات…" : "Loading violations…"}
          </div>
        ) : v.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {isAr
              ? "لا توجد مخالفات سياسة. ستظهر هنا تلقائياً أي مطالبات جديدة تخالف القواعد النشطة."
              : "No policy violations. New expense submissions that break active rules will appear here automatically."}
          </div>
        ) : (
          <div className="divide-y max-h-80 overflow-auto">
            {v.map((row) => (
              <div key={row.id} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                <Badge
                  className={
                    row.severity === "block"
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                  }
                >
                  {row.severity}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to="/dashboard/expenses/review"
                      search={{ claim: row.claim_id }}
                      className="font-medium truncate text-primary hover:underline"
                      title={isAr ? "فتح المطالبة" : "Open claim"}
                    >
                      {row.claim?.claim_number ?? row.claim_id.slice(0, 8)}
                    </Link>
                    <span className="text-muted-foreground truncate">{row.claim?.title ?? ""}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {row.rule_type}
                    </Badge>
                    {row.category && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {row.category}
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs mt-0.5">{row.reason}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PolicyRow({
  p,
  onUpdate,
  onDelete,
  saving,
  isAr,
}: {
  p: Policy;
  onUpdate: (v: Partial<Policy> & { id: string }) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  isAr: boolean;
}) {
  const [amount, setAmount] = useState(p.max_amount == null ? "" : String(p.max_amount));
  const [note, setNote] = useState(p.note ?? "");
  const dirty =
    amount !== (p.max_amount == null ? "" : String(p.max_amount)) || note !== (p.note ?? "");
  const needsAmount = p.rule_type === "max_amount" || p.rule_type === "max_per_period";

  return (
    <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
      <Badge
        variant={p.active ? "default" : "outline"}
        className="capitalize min-w-24 justify-center"
      >
        {p.category}
      </Badge>
      <Badge variant="outline" className="text-[10px]">
        {p.rule_type}
      </Badge>
      {p.severity === "block" && (
        <Badge className="bg-destructive text-destructive-foreground text-[10px]">block</Badge>
      )}
      {needsAmount ? (
        <div className="flex items-center gap-2">
          <Input
            className="w-32"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            {p.currency}
            {p.rule_type === "max_per_period" && p.period_days ? ` / ${p.period_days}d` : ""}
          </span>
        </div>
      ) : p.rule_type === "forbidden_keywords" ? (
        <span className="text-xs text-muted-foreground truncate max-w-40">
          {(p.keywords ?? []).join(", ") || "—"}
        </span>
      ) : null}
      <Input
        className="flex-1 min-w-56"
        placeholder={isAr ? "ملاحظة" : "Note"}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Switch checked={p.active} onCheckedChange={(v) => onUpdate({ id: p.id, active: v })} />
        <span className="text-xs text-muted-foreground w-14">
          {p.active ? (isAr ? "نشط" : "Active") : isAr ? "متوقّف" : "Off"}
        </span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        disabled={!dirty || saving}
        onClick={() =>
          onUpdate({
            id: p.id,
            max_amount: needsAmount ? Number(amount) : null,
            note: note.trim() || null,
          })
        }
        className="gap-1"
      >
        <Save className="h-3.5 w-3.5" /> {isAr ? "حفظ" : "Save"}
      </Button>
      <Can permission="button.expense.approve">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(p.id)}
          className="gap-1 text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </Can>
    </div>
  );
}

const EXAMPLE_PROMPT =
  "Cap maintenance at 1500 SAR per claim, utilities at 800, marketing at 2000, office supplies at 500. Allow salary advances up to 5000.";

function AiGenerateDialog({
  orgId,
  onCreated,
  isAr,
}: {
  orgId: string | undefined;
  onCreated: () => void;
  isAr: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [drafts, setDrafts] = useState<AiPolicyDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const generate = useServerFn(generatePoliciesFromDescription);

  async function onGenerate() {
    if (desc.trim().length < 4)
      return toast.error(isAr ? "صف القواعد أولاً" : "Describe the rules first");
    setBusy(true);
    try {
      const res = await generate({ data: { description: desc.trim(), defaultCurrency: "SAR" } });
      setDrafts(
        res.policies.map((p) => ({ ...p, note: p.note ?? null, active: p.active ?? true })),
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : isAr ? "فشل التوليد بالذكاء الاصطناعي" : "AI generation failed");
    } finally {
      setBusy(false);
    }
  }

  function patch(i: number, v: Partial<AiPolicyDraft>) {
    setDrafts((prev) => prev?.map((d, idx) => (idx === i ? { ...d, ...v } : d)) ?? prev);
  }

  async function onSave() {
    if (!orgId || !drafts?.length) return;
    for (const d of drafts) {
      if (!d.category.trim())
        return toast.error(isAr ? "أصلح الصفوف غير الصالحة قبل الحفظ" : "Fix invalid rows before saving");
      const needsAmount =
        (d.rule_type ?? "max_amount") === "max_amount" ||
        (d.rule_type ?? "max_amount") === "max_per_period";
      if (needsAmount && !(typeof d.max_amount === "number" && d.max_amount > 0)) {
        return toast.error(
          isAr
            ? `"${d.category}" تحتاج قيمة حد أقصى موجبة`
            : `"${d.category}" needs a positive max amount`,
        );
      }
    }
    setSaving(true);
    const { error } = await supabase.from("spending_policies").insert(
      drafts.map((d) => {
        const rt = d.rule_type ?? "max_amount";
        return {
          org_id: orgId,
          category: d.category.trim(),
          rule_type: rt,
          max_amount:
            rt === "max_amount" || rt === "max_per_period" ? (d.max_amount ?? null) : null,
          currency: d.currency,
          note: d.note?.trim() || null,
          active: d.active,
          keywords: d.keywords ?? [],
          period_days: rt === "max_per_period" ? (d.period_days ?? 30) : null,
          severity: d.severity ?? "warn",
        };
      }),
    );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isAr ? `تم حفظ ${drafts.length} سياسة` : `Saved ${drafts.length} policies`);
    onCreated();
    setOpen(false);
    setDrafts(null);
    setDesc("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <Sparkles className="h-4 w-4" /> {isAr ? "توليد بالذكاء الاصطناعي" : "Generate with AI"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> {isAr ? "مسوّدة السياسات بالذكاء الاصطناعي" : "AI policy drafter"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Label>{isAr ? "صِف قواعد الإنفاق" : "Describe the spending rules"}</Label>
          <Textarea
            rows={4}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={EXAMPLE_PROMPT}
            maxLength={2000}
          />
          <div className="flex justify-between items-center">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setDesc(EXAMPLE_PROMPT)}
            >
              {isAr ? "استخدم المثال" : "Use example"}
            </button>
            <Button onClick={onGenerate} disabled={busy} className="gap-2">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isAr ? "توليد" : "Generate"}
            </Button>
          </div>
        </div>

        {drafts && (
          <div className="space-y-2 max-h-[45vh] overflow-auto border rounded-md p-2">
            <div className="text-xs text-muted-foreground px-1">
              {isAr
                ? `راجع وعدّل قبل الحفظ — ${drafts.length} مسوّدة سياسة`
                : `Review and edit before saving — ${drafts.length} draft policies`}
            </div>
            {drafts.map((d, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap border rounded p-2">
                <Input
                  className="w-40"
                  value={d.category}
                  onChange={(e) => patch(i, { category: e.target.value })}
                />
                <Badge variant="outline" className="text-xs">
                  {d.rule_type ?? "max_amount"}
                </Badge>
                <Input
                  className="w-28"
                  type="number"
                  min="0"
                  step="0.01"
                  value={d.max_amount ?? ""}
                  onChange={(e) => patch(i, { max_amount: Number(e.target.value) })}
                />
                <Input
                  className="w-20"
                  value={d.currency}
                  onChange={(e) => patch(i, { currency: e.target.value.toUpperCase() })}
                />
                <Input
                  className="flex-1 min-w-40"
                  placeholder={isAr ? "ملاحظة" : "Note"}
                  value={d.note ?? ""}
                  onChange={(e) => patch(i, { note: e.target.value })}
                />
                {d.severity === "block" && (
                  <Badge className="bg-destructive text-destructive-foreground">block</Badge>
                )}
                <Switch checked={d.active} onCheckedChange={(v) => patch(i, { active: v })} />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDrafts((prev) => prev?.filter((_, idx) => idx !== i) ?? prev)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={onSave} disabled={!drafts?.length || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isAr ? "حفظ" : "Save"} {drafts?.length ? `(${drafts.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DraftForm = {
  category: string;
  rule_type: RuleType;
  max_amount: string;
  currency: string;
  keywords: string;
  period_days: string;
  severity: "warn" | "block";
  active: boolean;
};

function DraftPolicyTester({ form, isAr }: { form: DraftForm; isAr: boolean }) {
  const { orgId } = useCurrentOrg();
  const evaluate = useServerFn(evaluateDraftPolicy);
  const [sample, setSample] = useState({
    amount: "100",
    category: form.category === "*" ? "general" : form.category,
    title: "",
    description: "",
    has_receipt: true,
  });
  const [result, setResult] = useState<DraftEvalResult | null>(null);
  const run = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error(isAr ? "لا توجد مؤسسة" : "No organization");
      const amt = Number(sample.amount);
      if (!Number.isFinite(amt) || amt < 0) {
        throw new Error(isAr ? "أدخل مبلغاً صالحاً" : "Enter a valid amount");
      }
      const cap = Number(form.max_amount);
      const needsAmount = form.rule_type === "max_amount" || form.rule_type === "max_per_period";
      return await evaluate({
        data: {
          org_id: orgId,
          policy: {
            rule_type: form.rule_type,
            severity: form.severity,
            max_amount: needsAmount && Number.isFinite(cap) ? cap : null,
            keywords:
              form.rule_type === "forbidden_keywords"
                ? form.keywords.split(",").map((k) => k.trim()).filter(Boolean)
                : [],
            period_days:
              form.rule_type === "max_per_period" ? Number(form.period_days) || 30 : null,
            currency: form.currency,
            category: form.category,
          },
          claim: {
            amount: amt,
            category: sample.category,
            currency: form.currency,
            title: sample.title,
            description: sample.description,
            has_receipt: sample.has_receipt,
          },
        },
      });
    },
    onSuccess: (r) => setResult(r),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : isAr ? "فشل الاختبار" : "Test failed"),
  });

  return (
    <div className="mt-4 rounded-lg border border-dashed p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FlaskConical className="h-4 w-4 text-primary" />
        {isAr ? "اختبر القاعدة قبل الحفظ" : "Test this rule before saving"}
        <Badge variant="outline" className="text-[10px] font-normal ml-1">
          {isAr ? "نفس محرك السياسات" : "Same engine as save"}
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <div className="space-y-1.5">
          <Label className="text-xs">{isAr ? "المبلغ" : "Amount"}</Label>
          <Input type="number" min="0" step="0.01" value={sample.amount}
            onChange={(e) => setSample({ ...sample, amount: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{isAr ? "الفئة" : "Category"}</Label>
          <Select value={sample.category} onValueChange={(v) => setSample({ ...sample, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.filter((c) => c !== "*").map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label className="text-xs">{isAr ? "العنوان" : "Title"}</Label>
          <Input value={sample.title} onChange={(e) => setSample({ ...sample, title: e.target.value })}
            placeholder={isAr ? "عنوان المطالبة التجريبية" : "Sample claim title"} />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2 h-10">
            <Switch checked={sample.has_receipt}
              onCheckedChange={(v) => setSample({ ...sample, has_receipt: v })} />
            <Label className="text-xs cursor-pointer">{isAr ? "يوجد إيصال" : "Has receipt"}</Label>
          </div>
        </div>
        <div className="md:col-span-4 space-y-1.5">
          <Label className="text-xs">{isAr ? "الوصف" : "Description"}</Label>
          <Textarea rows={2} value={sample.description}
            onChange={(e) => setSample({ ...sample, description: e.target.value })}
            placeholder={isAr ? "وصف المطالبة التجريبية…" : "Sample claim description…"} />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="secondary" onClick={() => run.mutate()}
            disabled={run.isPending} className="gap-2 w-full">
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isAr ? "تشغيل" : "Run test"}
          </Button>
        </div>
      </div>
      {result && (
        <div className={
          "flex items-start gap-2 rounded-md border p-3 text-sm " +
          (result.pass
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            : result.severity === "block"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300")
        }>
          {result.pass
            ? <CheckCircle2 className="h-4 w-4 mt-0.5" />
            : <AlertTriangle className="h-4 w-4 mt-0.5" />}
          <div className="flex-1">
            <div className="font-medium">
              {result.pass
                ? (isAr ? "المطالبة ستمر ✓" : "Claim would pass ✓")
                : result.severity === "block"
                  ? (isAr ? "ستُحظر (block)" : "Would be blocked")
                  : (isAr ? "ستُعلَّم كتحذير (warn)" : "Would be flagged as warning")}
            </div>
            <div className="text-xs opacity-90 mt-0.5">
              {isAr ? result.reason_ar : result.reason_en}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
