import { t } from "@/lib/i18n";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  Loader2,
  ArrowRight,
  AlertTriangle,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getBillingOverview,
  listMySubscriptionPayments,
} from "@/lib/billing.functions";
import { StatusBadge } from "./portal.billing";

import { sectionHead } from "@/lib/section-og-head";
const CONTACT_EMAIL = "sales@hrhbs.com";
const CONTACT_WHATSAPP = "https://wa.me/966500000000";
const CONTACT_PHONE = "+966500000000";

export const Route = createFileRoute("/_authenticated/dashboard/settings/billing")({
  head: () => sectionHead({ section: "dashboard", entityAr: "الفوترة", entityEn: "Billing", path: "/dashboard/settings/billing" }),
  component: BillingSettingsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <p className="text-destructive">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          إعادة المحاولة
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

const nf = new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function usagePct(used: number, max: number | null | undefined) {
  if (max == null) return null;
  if (max <= 0) return 100;
  return Math.min(100, Math.round((used / max) * 100));
}

function UsageBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number | null | undefined;
}) {
  const pct = usagePct(used, max);
  const isUnlimited = max == null;
  const nearLimit = pct != null && pct >= 80;
  const atLimit = pct != null && pct >= 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span
          className={`tabular-nums ${atLimit ? "text-destructive" : nearLimit ? "text-warning" : "text-muted-foreground"}`}
        >
          {nf.format(used)} {isUnlimited ? "/ ∞" : `/ ${nf.format(max!)}`}
        </span>
      </div>
      <Progress
        value={isUnlimited ? 8 : pct!}
        className={
          atLimit ? "[&>div]:bg-destructive" : nearLimit ? "[&>div]:bg-warning" : undefined
        }
      />
    </div>
  );
}

function BillingSettingsPage() {
  const overviewQ = useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => getBillingOverview(),
  });
  const paymentsQ = useQuery({
    queryKey: ["billing", "mine"],
    queryFn: () => listMySubscriptionPayments(),
  });

  const overview = overviewQ.data;
  const currentPkg = overview?.package;
  const sub = overview?.subscription;
  const usage = overview?.usage ?? { units: 0, properties: 0, users: 0 };

  if (overviewQ.isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusLabels: Record<string, { label: string; cls: string }> = {
    active: { label: "نشط", cls: "bg-success/10 text-success border-success/30" },
    pending: { label: "بانتظار الموافقة", cls: "bg-warning/10 text-warning border-warning/30" },
    pending_payment: {
      label: "بانتظار الموافقة",
      cls: "bg-warning/10 text-warning border-warning/30",
    },
    expired: { label: "منتهي", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    cancelled: { label: "ملغي", cls: "bg-muted text-muted-foreground border-border" },
    rejected: { label: "مرفوض", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    none: { label: "لا يوجد اشتراك", cls: "bg-muted text-muted-foreground border-border" },
  };
  const statusInfo = statusLabels[sub?.status ?? "none"] ?? statusLabels.none;

  const nearExpiry =
    sub?.days_remaining != null && sub.days_remaining <= 7 && sub.status === "active";
  const expired = sub?.status === "expired";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/dashboard/settings" className="hover:text-foreground">
              الإعدادات
            </Link>
            <ArrowRight className="size-3 rotate-180" />
            <span>الاشتراك والفوترة</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">الاشتراك والفوترة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            حالة اشتراكك الحالي. للتفعيل أو التجديد يرجى التواصل مع فريقنا.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/portal/billing">سجل المدفوعات الكامل</Link>
        </Button>
      </div>

      {(expired || nearExpiry) && (
        <div
          className={`rounded-lg border p-4 flex items-start gap-3 ${expired ? "bg-destructive/10 border-destructive/30" : "bg-warning/10 border-warning/30"}`}
        >
          <AlertTriangle
            className={`size-5 shrink-0 ${expired ? "text-destructive" : "text-warning"}`}
          />
          <div className="text-sm">
            <div className="font-semibold">
              {expired ? "انتهى اشتراكك" : `اشتراكك ينتهي خلال ${sub!.days_remaining} يوم`}
            </div>
            <div className="text-muted-foreground mt-0.5">
              {expired
                ? "تواصل مع فريقنا لتجديد اشتراكك والاستمرار في استخدام جميع الميزات."
                : "تواصل مع فريقنا قبل الانتهاء لتجديد اشتراكك وتفادي انقطاع الخدمة."}
            </div>
          </div>
        </div>
      )}

      {sub?.status === "pending" && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <div className="text-sm">
            <div className="font-semibold">طلب الاشتراك قيد المراجعة</div>
            <div className="text-muted-foreground mt-0.5">
              سيتم تفعيل اشتراكك بمجرد موافقة الإدارة. يمكنك التواصل معنا لتسريع العملية.
            </div>
          </div>
        </div>
      )}

      {sub?.status === "rejected" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <div className="font-semibold">تم رفض طلب التفعيل</div>
            <div className="text-muted-foreground mt-0.5">
              {(sub as any)?.rejection_reason ?? "يرجى التواصل مع فريق الدعم لمزيد من التفاصيل."}
            </div>
          </div>
        </div>
      )}

      {/* Current plan */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="size-4" /> الخطة الحالية
            </CardTitle>
            <CardDescription>تفاصيل اشتراكك الجاري.</CardDescription>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusInfo.cls}`}
          >
            {statusInfo.label}
          </span>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">الباقة</div>
              <div className="font-semibold">{currentPkg?.name ?? "—"}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">الدورة</div>
              <div className="font-semibold">
                {sub?.billing_cycle === "yearly"
                  ? "سنوي"
                  : sub?.billing_cycle === "monthly"
                    ? "شهري"
                    : "—"}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">الأيام المتبقية</div>
              <div className="font-semibold tabular-nums">
                {sub?.days_remaining != null ? `${sub.days_remaining} يوم` : "—"}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium">الاستخدام</div>
            <UsageBar label="الوحدات" used={usage.units} max={currentPkg?.max_units ?? null} />
            <UsageBar
              label="العقارات"
              used={usage.properties}
              max={currentPkg?.max_properties ?? null}
            />
            <UsageBar label="المستخدمون" used={usage.users} max={currentPkg?.max_users ?? null} />
          </div>
        </CardContent>
      </Card>

      {/* Contact-to-activate */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="size-4" /> تفعيل أو تجديد الاشتراك
          </CardTitle>
          <CardDescription>
            لا يوجد دفع إلكتروني عبر الموقع. تواصل مع فريقنا لتفعيل الباقة الموحدة أو تجديد اشتراكك،
            وسنعالج طلبك في أسرع وقت.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="me-2 size-4" /> تواصل عبر واتساب
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`mailto:${CONTACT_EMAIL}`}>
              <Mail className="me-2 size-4" /> {CONTACT_EMAIL}
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href={`tel:${CONTACT_PHONE}`}>
              <Phone className="me-2 size-4" /> {CONTACT_PHONE}
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Recent payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل الاشتراكات السابقة</CardTitle>
          <CardDescription>حالة عمليات التفعيل السابقة على حسابك.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-b-xl border-t">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start">التاريخ</th>
                  <th className="px-4 py-2 text-start">المبلغ</th>
                  <th className="px-4 py-2 text-start">البنك</th>
                  <th className="px-4 py-2 text-start">الحالة</th>
                  <th className="px-4 py-2 text-start">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {(paymentsQ.data?.items ?? []).slice(0, 10).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("ar-SA")}
                    </td>
                    <td className="px-4 py-2 font-medium tabular-nums">
                      {nf.format(Number(r.amount))} {r.currency}
                    </td>
                    <td className="px-4 py-2">{r.bank_name}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} isAr={true} />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.rejection_reason ?? "—"}
                    </td>
                  </tr>
                ))}
                {(paymentsQ.data?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      لا توجد طلبات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
