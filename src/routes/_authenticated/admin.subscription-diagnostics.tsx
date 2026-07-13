import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Stethoscope,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Building2,
  User2,
  CreditCard,
  Clock,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { sectionHead } from "@/lib/section-og-head";
import {
  diagnoseSubscriptionActivation,
  type SubscriptionDiagnostic,
} from "@/lib/subscription-diagnostics.functions";

export const Route = createFileRoute("/_authenticated/admin/subscription-diagnostics")({
  component: SubscriptionDiagnosticsPage,
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "تشخيص تفعيل الاشتراك",
      entityEn: "Subscription activation diagnostics",
      descAr: "فحص سبب تفعيل أو عدم تفعيل اشتراك مستخدم جديد.",
      path: "/admin/subscription-diagnostics",
    }),
});

function levelStyle(level: "ok" | "warn" | "error") {
  switch (level) {
    case "ok":
      return {
        icon: <CheckCircle2 className="size-4" />,
        cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "warn":
      return {
        icon: <AlertTriangle className="size-4" />,
        cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    case "error":
      return {
        icon: <XCircle className="size-4" />,
        cls: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      };
  }
}

function fmt(dt: string | null | undefined) {
  if (!dt) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dt));
  } catch {
    return dt;
  }
}

function SubscriptionDiagnosticsPage() {
  const [query, setQuery] = useState("");
  const runFn = useServerFn(diagnoseSubscriptionActivation);
  const mutation = useMutation({
    mutationFn: (q: string) => runFn({ data: { query: q } }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    mutation.mutate(q);
  };

  const result = mutation.data as SubscriptionDiagnostic | undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="container mx-auto space-y-6 p-4 sm:p-6"
    >
      <AdminPageHeader
        ar="تشخيص تفعيل الاشتراك"
        en="Subscription activation diagnostics"
        descriptionAr="ابحث بالبريد الإلكتروني أو معرّف المستخدم لرؤية حالة الشركة والاشتراكات والسجل الزمني."
        descriptionEn="Search by email or user ID to inspect company, subscription state and timeline."
        icon={Stethoscope}
      />

      <Card className="p-4 sm:p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="user@example.com أو معرف UUID"
              className="ps-9"
              dir="ltr"
              autoFocus
              aria-label="بحث بالبريد أو المعرف"
            />
          </div>
          <Button type="submit" disabled={mutation.isPending || query.trim().length < 2}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            <span className="ms-2">تشخيص</span>
          </Button>
        </form>
        {mutation.isError && (
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">
            تعذّر إجراء التشخيص: {(mutation.error as Error).message}
          </p>
        )}
      </Card>

      {result && (
        <div className="space-y-6">
          {/* Diagnosis banners */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">النتيجة</h2>
            {result.diagnosis.length === 0 ? (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="me-2 inline size-4" />
                لا توجد ملاحظات — الحالة سليمة.
              </div>
            ) : (
              result.diagnosis.map((d, i) => {
                const s = levelStyle(d.level);
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 text-sm ${s.cls}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">{s.icon}</span>
                      <div>
                        <p className="font-semibold">{d.message}</p>
                        {d.hint && (
                          <p className="mt-1 text-xs opacity-90">{d.hint}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* User + profile */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <User2 className="size-4 text-primary" />
              المستخدم والملف
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Kv label="البريد" value={result.user?.email ?? "—"} dir="ltr" />
              <Kv label="معرّف المستخدم" value={result.user?.id ?? "—"} dir="ltr" mono />
              <Kv label="أُنشئ في" value={fmt(result.user?.created_at)} />
              <Kv label="الاسم الكامل" value={result.profile?.full_name ?? "—"} />
              <Kv label="حالة الملف" value={result.profile?.approval_status ?? "—"} />
              <Kv label="تمت الموافقة في" value={fmt(result.profile?.approved_at)} />
              <Kv
                label="نهاية التجربة (الملف)"
                value={
                  result.profile?.trial_ends_at
                    ? `${fmt(result.profile.trial_ends_at)} · ${
                        result.profile.trial_days_remaining ?? "?"
                      } يوم`
                    : "—"
                }
              />
              <Kv
                label="عدد الباقات النشطة في النظام"
                value={String(result.packages_available)}
              />
            </div>
          </Card>

          {/* Memberships */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Building2 className="size-4 text-primary" />
              الشركات ({result.memberships.length})
            </div>
            {result.memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Info className="me-1 inline size-4" />
                لا توجد شركة مربوطة بهذا المستخدم.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {result.memberships.map((m) => (
                  <li key={m.org_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="font-semibold">{m.org_name}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {m.role}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      أُنشئت: {fmt(m.org_created_at)}
                    </span>
                    <span className="ms-auto font-mono text-[11px] text-muted-foreground" dir="ltr">
                      {m.org_id}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Subscriptions */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="size-4 text-primary" />
              الاشتراكات ({result.subscriptions.length})
            </div>
            {result.subscriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Info className="me-1 inline size-4" />
                لا يوجد أي اشتراك لهذا المستخدم.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 text-start">الشركة</th>
                      <th className="py-2 text-start">الباقة</th>
                      <th className="py-2 text-start">الدورة</th>
                      <th className="py-2 text-start">الحالة</th>
                      <th className="py-2 text-start">البداية</th>
                      <th className="py-2 text-start">النهاية</th>
                      <th className="py-2 text-start">المتبقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.subscriptions.map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2">{s.org_name ?? "—"}</td>
                        <td className="py-2">{s.package_code ?? "—"}</td>
                        <td className="py-2">{s.billing_cycle}</td>
                        <td className="py-2">
                          <span
                            className={
                              s.is_active_now
                                ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                                : "rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400"
                            }
                          >
                            {s.is_active_now ? "نشط" : s.status}
                          </span>
                        </td>
                        <td className="py-2" dir="ltr">
                          {s.start_date ?? "—"}
                        </td>
                        <td className="py-2" dir="ltr">
                          {s.end_date ?? "—"}
                        </td>
                        <td className="py-2">
                          {s.days_remaining == null
                            ? "—"
                            : s.days_remaining > 0
                              ? `${s.days_remaining} يوم`
                              : "منتهي"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Timeline */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-primary" />
              السجل الزمني
            </div>
            {result.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد أحداث.</p>
            ) : (
              <ol className="relative ms-3 border-s border-border ps-4">
                {result.timeline.map((ev, i) => (
                  <li key={i} className="relative pb-4 last:pb-0">
                    <span className="absolute -start-[7px] mt-1 size-3 rounded-full border-2 border-background bg-primary" />
                    <p className="text-xs text-muted-foreground">{fmt(ev.at)}</p>
                    <p className="text-sm">{ev.label}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </motion.div>
  );
}

function Kv({
  label,
  value,
  dir,
  mono,
}: {
  label: string;
  value: string;
  dir?: "ltr" | "rtl";
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`} dir={dir}>
        {value}
      </p>
    </div>
  );
}
