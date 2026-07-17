import { t } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  MessageCircle,
  Phone,
  CreditCard,
} from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listMySubscriptionPayments,
  getBillingOverview,
  listSubscriptionHistory,
} from "@/lib/billing.functions";

const CONTACT_EMAIL = "sales@hrhbs.com";
const CONTACT_WHATSAPP = "https://wa.me/966500000000";
const CONTACT_PHONE = "+966500000000";

export const Route = createFileRoute("/_authenticated/portal/billing")({
  head: () => portalHead({ titleAr: 'الفوترة والمدفوعات', titleEn: 'Billing', descAr: 'خطط الاشتراك، الفواتير، ووسائل الدفع.', path: '/portal/billing' }),
  component: BillingPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

function BillingPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", {
    minimumFractionDigits: 2,
  });

  const { data: overview } = useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => getBillingOverview(),
  });
  const { data: mine } = useQuery({
    queryKey: ["billing", "mine"],
    queryFn: () => listMySubscriptionPayments(),
  });

  const sub = overview?.subscription;
  const pkg = overview?.package;

  const statusLabels: Record<string, { label: [string, string]; cls: string }> = {
    active: {
      label: ["Active", "نشط"],
      cls: "bg-success/10 text-success border-success/30",
    },
    pending: {
      label: ["Pending activation", "بانتظار التفعيل"],
      cls: "bg-warning/10 text-warning border-warning/30",
    },
    pending_payment: {
      label: ["Pending activation", "بانتظار التفعيل"],
      cls: "bg-warning/10 text-warning border-warning/30",
    },
    expired: {
      label: ["Expired", "منتهي"],
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    },
    cancelled: {
      label: ["Cancelled", "ملغي"],
      cls: "bg-muted text-muted-foreground border-border",
    },
    rejected: {
      label: ["Rejected", "مرفوض"],
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    },
    none: {
      label: ["No subscription", "لا يوجد اشتراك"],
      cls: "bg-muted text-muted-foreground border-border",
    },
  };
  const statusInfo = statusLabels[sub?.status ?? "none"] ?? statusLabels.none;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <PortalPageHeader
        title={isAr ? "الاشتراك والدفع" : "Subscription & Billing"}
        subtitle={
          isAr
            ? "عرض حالة اشتراك مؤسستك. التفعيل والتجديد يتمان بالتواصل مع فريقنا."
            : "View your organization's subscription status. Activation and renewal are handled by our team."
        }
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">
            {isAr ? "نظرة عامة" : "Overview"}
          </TabsTrigger>
          <TabsTrigger value="history">
            {isAr ? "سجل التغييرات" : "Change log"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="size-4" />
              {isAr ? "الاشتراك الحالي" : "Current subscription"}
            </CardTitle>
            <CardDescription>
              {pkg?.name ?? (isAr ? "لا توجد باقة مفعّلة" : "No active plan")}
            </CardDescription>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${statusInfo.cls}`}
          >
            {isAr ? statusInfo.label[1] : statusInfo.label[0]}
          </span>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">{isAr ? "الدورة" : "Cycle"}</div>
            <div className="font-semibold">
              {sub?.billing_cycle === "yearly"
                ? isAr
                  ? "سنوي"
                  : "Yearly"
                : sub?.billing_cycle === "monthly"
                  ? isAr
                    ? "شهري"
                    : "Monthly"
                  : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {isAr ? "الأيام المتبقية" : "Days remaining"}
            </div>
            <div className="font-semibold tabular-nums">
              {sub?.days_remaining != null
                ? `${sub.days_remaining} ${isAr ? "يوم" : "days"}`
                : "—"}
            </div>
          </div>
        </CardContent>
      </Card>

      {sub?.status === "rejected" && sub?.rejection_reason && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <XCircle className="size-4" />
              {isAr ? "تم رفض طلب التفعيل" : "Activation request rejected"}
            </CardTitle>
            <CardDescription className="text-destructive/90">
              {sub.rejection_reason}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {sub?.status === "pending" && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-warning">
              <Clock className="size-4" />
              {isAr ? "طلبك قيد المراجعة" : "Your request is under review"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "سيتم تفعيل اشتراكك بعد موافقة فريق الإدارة. يمكنك التواصل معنا لتسريع العملية."
                : "Your subscription will be activated once approved by our admin team. You can contact us to speed things up."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageCircle className="size-4" />
            {isAr ? "تفعيل أو تجديد الاشتراك" : "Activate or renew"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "لا يوجد دفع إلكتروني عبر الموقع. تواصل مع فريقنا لتفعيل الباقة الموحدة أو تجديد اشتراكك."
              : "There is no online payment on the site. Contact our team to activate or renew your subscription."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={CONTACT_WHATSAPP} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="me-2 size-4" />
              {isAr ? "تواصل عبر واتساب" : "Contact on WhatsApp"}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? "سجل عمليات التفعيل السابقة" : "Activation history"}
          </CardTitle>
          <CardDescription>
            {isAr
              ? "قائمة بطلبات الاشتراك والتفعيلات السابقة على حسابك."
              : "Previous subscription and activation records on your account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-b-xl border-t">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "المبلغ" : "Amount"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الجهة" : "Bank"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-2 text-start">{isAr ? "ملاحظة" : "Note"}</th>
                </tr>
              </thead>
              <tbody>
                {(mine?.items ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {nf.format(Number(r.amount))} {r.currency}
                    </td>
                    <td className="px-4 py-2">{r.bank_name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} isAr={!!isAr} />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {r.rejection_reason ?? "—"}
                    </td>
                  </tr>
                ))}
                {(mine?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {isAr ? "لا توجد سجلات بعد" : "No records yet"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="history">
          <SubscriptionChangeLog isAr={!!isAr} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubscriptionChangeLog({ isAr }: { isAr: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["billing", "history"],
    queryFn: () => listSubscriptionHistory(),
  });
  const items = data?.items ?? [];
  const dtf = new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const typeMeta: Record<string, { label: [string, string]; cls: string; icon: React.ReactNode }> = {
    created: {
      label: ["Request created", "تم إنشاء الطلب"],
      cls: "bg-warning/10 text-warning border-warning/30",
      icon: <Clock className="size-3" />,
    },
    approved: {
      label: ["Approved & activated", "تمت الموافقة والتفعيل"],
      cls: "bg-success/10 text-success border-success/30",
      icon: <CheckCircle2 className="size-3" />,
    },
    renewed: {
      label: ["Renewed", "تم التجديد"],
      cls: "bg-success/10 text-success border-success/30",
      icon: <CheckCircle2 className="size-3" />,
    },
    rejected: {
      label: ["Rejected", "مرفوض"],
      cls: "bg-destructive/10 text-destructive border-destructive/30",
      icon: <XCircle className="size-3" />,
    },
    expired: {
      label: ["Expired", "منتهي"],
      cls: "bg-destructive/10 text-destructive border-destructive/30",
      icon: <XCircle className="size-3" />,
    },
    cancelled: {
      label: ["Cancelled", "ملغي"],
      cls: "bg-muted text-muted-foreground border-border",
      icon: <XCircle className="size-3" />,
    },
    updated: {
      label: ["Updated", "تحديث"],
      cls: "bg-muted text-muted-foreground border-border",
      icon: <Clock className="size-3" />,
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isAr ? "سجل التغييرات على الاشتراك" : "Subscription change log"}
        </CardTitle>
        <CardDescription>
          {isAr
            ? "كل الأحداث المتعلقة باشتراكك (إنشاء الطلب، الموافقة، الرفض، التجديد، الإلغاء) مع التاريخ والرسالة."
            : "Every event on your subscription (creation, approval, rejection, renewal, cancellation) with date and message."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {isAr ? "جارٍ التحميل..." : "Loading..."}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {isAr ? "لا توجد أحداث بعد" : "No events yet"}
          </div>
        ) : (
          <ol className="relative space-y-4 border-s ps-5">
            {items.map((ev: any) => {
              const meta = typeMeta[ev.type] ?? typeMeta.updated;
              return (
                <li key={ev.id} className="relative">
                  <span className="absolute -start-[27px] top-1 grid size-4 place-items-center rounded-full border bg-background text-[10px]">
                    {meta.icon}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                    >
                      {meta.icon}
                      {isAr ? meta.label[1] : meta.label[0]}
                    </span>
                    <time className="text-xs tabular-nums text-muted-foreground">
                      {dtf.format(new Date(ev.at))}
                    </time>
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {isAr ? ev.message_ar : ev.message_en}
                  </p>
                  {ev.end_date && (ev.type === "approved" || ev.type === "renewed") && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isAr ? "ساري حتى" : "Valid through"}: {ev.end_date}
                      {ev.billing_cycle
                        ? ` · ${
                            ev.billing_cycle === "yearly"
                              ? isAr
                                ? "سنوي"
                                : "Yearly"
                              : isAr
                                ? "شهري"
                                : "Monthly"
                          }`
                        : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const map: Record<string, { icon: React.ReactNode; label: [string, string]; cls: string }> = {
    pending: {
      icon: <Clock className="size-3" />,
      label: ["Pending", "بانتظار المراجعة"],
      cls: "bg-warning/10 text-warning border-warning/30",
    },
    approved: {
      icon: <CheckCircle2 className="size-3" />,
      label: ["Approved", "مقبول"],
      cls: "bg-success/10 text-success border-success/30",
    },
    rejected: {
      icon: <XCircle className="size-3" />,
      label: ["Rejected", "مرفوض"],
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    },
    cancelled: {
      icon: <XCircle className="size-3" />,
      label: ["Cancelled", "ملغي"],
      cls: "bg-muted text-muted-foreground border-border",
    },
    refunded: {
      icon: <XCircle className="size-3" />,
      label: ["Refunded", "مسترد"],
      cls: "bg-warning/10 text-warning border-warning/30",
    },
  };
  const v = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${v.cls}`}
    >
      {v.icon}
      {isAr ? v.label[1] : v.label[0]}
    </span>
  );
}