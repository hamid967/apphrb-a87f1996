import { t } from "@/lib/i18n";
import type React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  CreditCard,
  Loader2,
  ArrowRight,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Mail,
  MessageCircle,
  Phone,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBillingOverview, listMySubscriptionPayments } from "@/lib/billing.functions";
import { StatusBadge } from "./portal.billing";

import { sectionHead } from "@/lib/section-og-head";
const CONTACT_EMAIL = "sales@hrhbs.com";
const CONTACT_WHATSAPP = "https://wa.me/966500000000";
const CONTACT_PHONE = "+966500000000";

export const Route = createFileRoute("/_authenticated/dashboard/settings/billing")({
  head: () =>
    sectionHead({
      section: "dashboard",
      entityAr: "الفوترة",
      entityEn: "Billing",
      path: "/dashboard/settings/billing",
    }),
  component: BillingSettingsPage,
  errorComponent: BillingSettingsError,
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

function BillingSettingsError({ error, reset }: { error: Error; reset: () => void }) {
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
        {t("common.retry")}
      </Button>
    </div>
  );
}

type SubscriptionPaymentRow = {
  id: string;
  amount: number | string;
  currency: string;
  bank_name: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

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
  const { i18n: i18nInst } = useTranslation();
  const nf = new Intl.NumberFormat(i18nInst.language === "ar" ? "ar-SA" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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
  const { t: tt, i18n: i18nInst } = useTranslation();
  const isAr = i18nInst.language === "ar";
  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
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

  const statusClass: Record<string, string> = {
    active: "bg-success/10 text-success border-success/30",
    pending: "bg-warning/10 text-warning border-warning/30",
    pending_payment: "bg-warning/10 text-warning border-warning/30",
    expired: "bg-destructive/10 text-destructive border-destructive/30",
    cancelled: "bg-muted text-muted-foreground border-border",
    rejected: "bg-destructive/10 text-destructive border-destructive/30",
    none: "bg-muted text-muted-foreground border-border",
  };
  const statusKey = sub?.status ?? "none";
  const statusLabel = tt(`billingSettings.status.${statusKey}`, {
    defaultValue: tt("billingSettings.status.none"),
  });
  const statusCls = statusClass[statusKey] ?? statusClass.none;
  const dash = tt("billingSettings.dash");

  const nearExpiry =
    sub?.days_remaining != null && sub.days_remaining <= 7 && sub.status === "active";
  const expired = sub?.status === "expired";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/dashboard/settings" className="hover:text-foreground">
              {tt("billingSettings.breadcrumbSettings")}
            </Link>
            <ArrowRight className="size-3 rotate-180" />
            <span>{tt("billingSettings.title")}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {tt("billingSettings.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{tt("billingSettings.description")}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/portal/billing">{tt("billingSettings.viewFullHistory")}</Link>
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
              {expired
                ? tt("billingSettings.alerts.expiredTitle")
                : tt("billingSettings.alerts.expiryTitle", { days: sub!.days_remaining })}
            </div>
            <div className="text-muted-foreground mt-0.5">
              {expired
                ? tt("billingSettings.alerts.expiredBody")
                : tt("billingSettings.alerts.expiryBody")}
            </div>
          </div>
        </div>
      )}

      {sub?.status === "pending" && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <div className="text-sm">
            <div className="font-semibold">{tt("billingSettings.alerts.pendingTitle")}</div>
            <div className="text-muted-foreground mt-0.5">
              {tt("billingSettings.alerts.pendingBody")}
            </div>
          </div>
        </div>
      )}

      {sub?.status === "rejected" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <div className="font-semibold">{tt("billingSettings.alerts.rejectedTitle")}</div>
            <div className="text-muted-foreground mt-0.5">
              {sub?.rejection_reason ?? tt("billingSettings.alerts.rejectedDefaultReason")}
            </div>
          </div>
        </div>
      )}

      <LaunchActivationCard isAr={isAr} />

      {/* Current plan */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="size-4" /> {tt("billingSettings.currentPlan.title")}
            </CardTitle>
            <CardDescription>{tt("billingSettings.currentPlan.description")}</CardDescription>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusCls}`}
          >
            {statusLabel}
          </span>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">
                {tt("billingSettings.currentPlan.package")}
              </div>
              <div className="font-semibold">{currentPkg?.name ?? dash}</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">
                {tt("billingSettings.currentPlan.cycle")}
              </div>
              <div className="font-semibold">
                {sub?.billing_cycle === "yearly"
                  ? tt("billingSettings.currentPlan.cycleYearly")
                  : sub?.billing_cycle === "monthly"
                    ? tt("billingSettings.currentPlan.cycleMonthly")
                    : dash}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">
                {tt("billingSettings.currentPlan.daysRemaining")}
              </div>
              <div className="font-semibold tabular-nums">
                {sub?.days_remaining != null
                  ? tt("billingSettings.currentPlan.daysValue", { days: sub.days_remaining })
                  : dash}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium">{tt("billingSettings.usage.title")}</div>
            <UsageBar
              label={tt("billingSettings.usage.units")}
              used={usage.units}
              max={currentPkg?.max_units ?? null}
            />
            <UsageBar
              label={tt("billingSettings.usage.properties")}
              used={usage.properties}
              max={currentPkg?.max_properties ?? null}
            />
            <UsageBar
              label={tt("billingSettings.usage.users")}
              used={usage.users}
              max={currentPkg?.max_users ?? null}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact-to-activate */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="size-4" /> {tt("billingSettings.contact.title")}
          </CardTitle>
          <CardDescription>{tt("billingSettings.contact.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="me-2 size-4" /> {tt("billingSettings.contact.whatsapp")}
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
          <CardTitle className="text-base">{tt("billingSettings.history.title")}</CardTitle>
          <CardDescription>{tt("billingSettings.history.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-b-xl border-t">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start">{tt("billingSettings.history.colDate")}</th>
                  <th className="px-4 py-2 text-start">
                    {tt("billingSettings.history.colAmount")}
                  </th>
                  <th className="px-4 py-2 text-start">{tt("billingSettings.history.colBank")}</th>
                  <th className="px-4 py-2 text-start">
                    {tt("billingSettings.history.colStatus")}
                  </th>
                  <th className="px-4 py-2 text-start">{tt("billingSettings.history.colNote")}</th>
                </tr>
              </thead>
              <tbody>
                {((paymentsQ.data?.items ?? []) as SubscriptionPaymentRow[])
                  .slice(0, 10)
                  .map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                      </td>
                      <td className="px-4 py-2 font-medium tabular-nums">
                        {nf.format(Number(r.amount))} {r.currency}
                      </td>
                      <td className="px-4 py-2">{r.bank_name}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={r.status} isAr={isAr} />
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {r.rejection_reason ?? dash}
                      </td>
                    </tr>
                  ))}
                {(paymentsQ.data?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {tt("billingSettings.history.empty")}
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

function LaunchActivationCard({ isAr }: { isAr: boolean }) {
  const steps: Array<{
    icon: React.ReactNode;
    ar: string;
    en: string;
    descAr: string;
    descEn: string;
    href: string;
    external?: boolean;
  }> = [
    {
      icon: <Building2 className="size-4" />,
      ar: "ابدأ ببياناتك الأساسية",
      en: "Start with your basics",
      descAr: "أضف أول عقار ووحدة أو افتح لوحة التحكم إن كانت بياناتك جاهزة.",
      descEn: "Add your first property and unit, or open the dashboard if your data is ready.",
      href: "/dashboard/properties/new",
    },
    {
      icon: <MessageCircle className="size-4" />,
      ar: "اطلب التفعيل اليدوي",
      en: "Request manual activation",
      descAr: "الترقية تتم عبر التواصل فقط حالياً، بدون بوابة دفع أو خصم تلقائي.",
      descEn:
        "Upgrades are handled by contact only for now, with no payment gateway or auto-charge.",
      href: CONTACT_WHATSAPP,
      external: true,
    },
    {
      icon: <CheckCircle2 className="size-4" />,
      ar: "اختبر أول تصدير",
      en: "Test first export",
      descAr: "بعد التفعيل جرّب سنداً أو تقرير PDF للتأكد من الشعار والبيانات.",
      descEn: "After activation, export a voucher or PDF report to verify logo and details.",
      href: "/dashboard/reports",
    },
  ] as const;

  return (
    <Card className="border-primary/30 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="size-4 text-primary" />
          {isAr ? "جاهزية الإطلاق لحسابك" : "Your launch checklist"}
        </CardTitle>
        <CardDescription>
          {isAr
            ? "خطوات قصيرة لاستقبال أول عميل أو إدارة أول عقار بدون صفحات إضافية."
            : "Short steps to onboard the first customer or property without extra pages."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((step) => (
            <a
              key={step.en}
              href={step.href}
              target={step.external ? "_blank" : undefined}
              rel={step.external ? "noopener noreferrer" : undefined}
              className="rounded-xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div className="mb-3 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                {step.icon}
              </div>
              <div className="text-sm font-semibold">{isAr ? step.ar : step.en}</div>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                {isAr ? step.descAr : step.descEn}
              </p>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
