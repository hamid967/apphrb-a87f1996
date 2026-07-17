import { t } from "@/lib/i18n";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  ExternalLink,
  History,
  ListChecks,
  Link2,
  Lock,
  RefreshCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sectionHead } from "@/lib/section-og-head";
import {
  getHubService,
  HUB_CATEGORIES,
  HUB_SERVICES,
  isHubServiceAvailable,
} from "@/lib/services-hub-catalog";
import {
  clearAccessForService,
  recordServiceAccess,
  useServiceAccessLog,
} from "@/lib/service-access-log";
import { useSafeRouteNavigator } from "@/lib/use-safe-route-navigator";
import { useMyRoles } from "@/hooks/use-my-roles";
import { rolesForService, roleLabel, userCanUseService } from "@/lib/service-roles";
import { ForbiddenScreen } from "@/components/services/ForbiddenScreen";
import { Loader2 } from "lucide-react";


export const Route = createFileRoute("/_authenticated/dashboard/services/$key")({
  head: ({ params }) => {
    const svc = getHubService(params.key);
    return sectionHead({
      section: "dashboard",
      entityAr: svc ? `تفاصيل خدمة: ${svc.titleAr}` : "تفاصيل الخدمة",
      entityEn: svc ? `Service details: ${svc.titleEn}` : "Service details",
      path: `/dashboard/services/${params.key}`,
    });
  },
  loader: ({ params }) => {
    const svc = getHubService(params.key);
    if (!svc) throw notFound();
    return { serviceId: svc.id };
  },
  component: ServiceDetailPage,
  pendingMs: 200,
  pendingComponent: () => <ServiceDetailSkeleton />,
  notFoundComponent: () => {
    const { key } = Route.useParams();
    return (
      <div className="mx-auto max-w-3xl p-8">
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="flex-1">
            <h1 className="text-lg font-bold">الخدمة غير موجودة / Service not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              لا توجد خدمة بالمعرّف <code className="rounded bg-muted px-1">{key}</code>.
              قد تكون أُزيلت أو أن الرابط غير صحيح.
            </p>
            <Link
              to="/dashboard/services"
              className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
            >
              ← العودة إلى مركز الخدمات
            </Link>
          </div>
        </div>
      </div>
    );
  },
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-3xl p-8">
      <div
        role="alert"
        className="flex flex-col gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 sm:flex-row sm:items-start"
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </span>
        <div className="flex-1">
          <h1 className="text-lg font-bold">تعذّر تحميل تفاصيل الخدمة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            حدث خطأ غير متوقع أثناء عرض هذه الخدمة. حاول مرة أخرى، وإذا استمرّت المشكلة عد إلى مركز الخدمات.
          </p>
          <p className="mt-2 font-mono text-[11px] text-destructive/80">{error.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={reset}>
              <RefreshCcw className="me-1.5 size-3.5" />{t("common.retry")}</Button>
            <Link
              to="/dashboard/services"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              مركز الخدمات
            </Link>
          </div>
        </div>
      </div>
    </div>
  ),
});

function ServiceDetailSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading service details"
      className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6"
    >
      <Skeleton className="h-3 w-24" />
      <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <Skeleton className="size-14 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-3 w-full max-w-xl" />
            <Skeleton className="h-3 w-4/5 max-w-lg" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5">
              <Skeleton className="mb-3 h-4 w-32" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            </div>
          ))}
        </div>
        <aside className="rounded-2xl border border-border bg-card p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}


function ServiceDetailPage() {
  const { key } = Route.useParams();
  const service = getHubService(key)!;
  const { i18n } = useTranslation();
  const isAr = (i18n.language ?? "ar").startsWith("ar");
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const dateLocale = isAr ? arLocale : enUS;
  const accessLog = useServiceAccessLog(service.id);

  // Record a visit when the detail page opens (bounded, dedup within 60s).
  useEffect(() => {
    const latest = accessLog[0];
    const now = Date.now();
    if (!latest || now - latest.ts > 60_000) {
      recordServiceAccess(service.id, `/dashboard/services/${service.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  const category = HUB_CATEGORIES.find((c) => c.key === service.category);
  const related = HUB_SERVICES.filter(
    (s) => s.category === service.category && s.id !== service.id,
  ).slice(0, 4);
  const Icon = service.icon;
  const { isKnownRoute, safeNavigate } = useSafeRouteNavigator();
  const { roles: myRoles, isLoading: rolesLoading } = useMyRoles();
  const flagged = isHubServiceAvailable(service);
  const routeOk = isKnownRoute(service.to);
  const authorized = userCanUseService(myRoles, service.id);
  const restricted = !authorized;
  const available = flagged && routeOk && authorized;
  const brokenLink = flagged && !routeOk && authorized;
  const serviceRoles = rolesForService(service.id);

  // While roles resolve, show a small spinner instead of flashing the
  // Forbidden screen for authorized users.
  if (rolesLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Full Forbidden screen when the user lacks the required role.
  if (restricted) {
    return <ForbiddenScreen service={service} myRoles={myRoles} isAr={!!isAr} />;
  }

  const unavailableReason = restricted
    ? isAr
      ? `تتطلب أحد الأدوار: ${serviceRoles.map((r) => roleLabel(r, true)).join("، ")}.`
      : `Requires one of: ${serviceRoles.map((r) => roleLabel(r, false)).join(", ")}.`
    : isAr
      ? (service.unavailableReasonAr ??
          (brokenLink ? `المسار «${service.to}» غير مسجّل حاليًا.` : undefined))
      : (service.unavailableReasonEn ??
          (brokenLink ? `Route "${service.to}" isn't registered.` : undefined));




  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="text-xs">
        <Link
          to="/dashboard/services"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
        >
          <Arrow className="size-3 rotate-180" />
          {isAr ? "كل الخدمات" : "All services"}
        </Link>
      </div>

      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8"
      >
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b ${service.hue} opacity-70 blur-3xl`}
        />
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Icon className="size-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">
                  {isAr ? category?.ar : category?.en}
                </Badge>
                {restricted && (
                  <Badge variant="destructive" className="gap-1 text-[10px]">
                    <Lock className="size-3" />
                    {isAr ? "بدون صلاحية" : "Restricted"}
                  </Badge>
                )}
                <span className="inline-flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="size-3 opacity-60" />
                  {isAr ? "متاحة لـ:" : "Available to:"}
                  {serviceRoles.map((r) => (
                    <Badge key={r} variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {roleLabel(r, !!isAr)}
                    </Badge>
                  ))}
                </span>
              </div>

              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                {isAr ? service.titleAr : service.titleEn}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {isAr ? service.longAr : service.longEn}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {available ? (
              <button
                type="button"
                onClick={async () => {
                  const ok = await safeNavigate(service.to, { isAr });
                  if (ok) recordServiceAccess(service.id, service.to);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                {isAr ? "فتح الخدمة" : "Open service"}
                <ExternalLink className="size-4" />
              </button>

            ) : (
              <button
                type="button"
                onClick={() =>
                  restricted
                    ? toast.error(
                        isAr ? "لا تملك صلاحية لهذه الخدمة" : "You don't have access",
                        { description: unavailableReason },
                      )
                    : toast.warning(
                        isAr ? "الخدمة غير متاحة حاليًا" : "Service currently unavailable",
                        { description: unavailableReason },
                      )
                }
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-2 text-sm font-semibold text-destructive"
              >
                {restricted ? <Lock className="size-4" /> : <Ban className="size-4" />}
                {restricted
                  ? isAr ? "بدون صلاحية" : "Restricted"
                  : isAr ? "غير متاحة" : "Unavailable"}
              </button>
            )}
          </div>
        </div>
        {!available && (
          <div
            role="status"
            className="relative z-10 mt-5 flex items-start gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4 text-xs text-destructive"
          >
            {restricted ? (
              <Lock className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            )}
            <div>
              <p className="font-semibold">
                {restricted
                  ? isAr ? "لا تملك صلاحية لاستخدام هذه الخدمة" : "You don't have access to this service"
                  : isAr ? "هذه الخدمة غير متاحة حاليًا" : "This service is currently unavailable"}
              </p>
              <p className="mt-1 text-destructive/80">
                {unavailableReason ??
                  (isAr
                    ? "قد تكون قيد الصيانة أو تحتاج ترقية باقة. حاول لاحقًا أو تواصل مع الدعم."
                    : "It may be under maintenance or require a plan upgrade. Try again later or contact support.")}
              </p>
            </div>
          </div>
        )}
      </motion.section>



      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: usage + features + links */}
        <div className="space-y-4 lg:col-span-2">
          {/* Features */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-primary" />
              {isAr ? "المميزات" : "Highlights"}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {(isAr ? service.featuresAr : service.featuresEn).map((f) => (
                <li
                  key={f}
                  className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                >
                  {f}
                </li>
              ))}
            </ul>
          </section>

          {/* Usage steps */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ListChecks className="size-4 text-primary" />
              {isAr ? "إرشادات الاستخدام" : "How to use"}
            </h2>
            <ol className="space-y-3">
              {(isAr ? service.stepsAr : service.stepsEn).map((step, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {idx + 1}
                  </span>
                  <p className="text-sm text-foreground/90">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Related links */}
          {service.links.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Link2 className="size-4 text-primary" />
                {isAr ? "روابط مرتبطة" : "Related links"}
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {service.links.map((link) => {
                  const linkOk = isKnownRoute(link.to);
                  return (
                    <button
                      key={link.to}
                      type="button"
                      onClick={() => safeNavigate(link.to, { isAr })}
                      aria-disabled={!linkOk || undefined}
                      title={linkOk ? undefined : link.to}
                      className={`group inline-flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm transition ${
                        linkOk
                          ? "border-border bg-background hover:border-primary/50 hover:bg-primary/5"
                          : "cursor-not-allowed border-dashed border-destructive/40 bg-destructive/5 text-destructive/80"
                      }`}
                    >
                      <span className={`font-medium ${linkOk ? "text-foreground" : "text-destructive"}`}>
                        {isAr ? link.labelAr : link.labelEn}
                      </span>
                      {linkOk ? (
                        <Arrow className="size-4 text-muted-foreground transition group-hover:text-primary" />
                      ) : (
                        <AlertTriangle className="size-4 text-destructive" />
                      )}
                    </button>
                  );
                })}

              </div>
            </section>
          )}

          {/* Related services */}
          {related.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                {isAr ? "خدمات مشابهة" : "Similar services"}
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {related.map((r) => {
                  const RIcon = r.icon;
                  return (
                    <Link
                      key={r.id}
                      to="/dashboard/services/$key"
                      params={{ key: r.id }}
                      className="group inline-flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-sm transition hover:border-primary/50"
                    >
                      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <RIcon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {isAr ? r.titleAr : r.titleEn}
                      </span>
                      <Arrow className="size-4 text-muted-foreground transition group-hover:text-primary" />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right: access log */}
        <aside className="lg:col-span-1">
          <section className="sticky top-4 rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <History className="size-4 text-primary" />
                {isAr ? "سجل آخر الوصول" : "Recent access log"}
              </h2>
              {accessLog.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => clearAccessForService(service.id)}
                >
                  <Trash2 className="me-1 size-3" />
                  {isAr ? "مسح" : "Clear"}
                </Button>
              )}
            </div>
            {accessLog.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                {isAr
                  ? "لا يوجد سجل بعد. سيسجَّل الوصول عند فتح الخدمة."
                  : "No history yet. Access is recorded when you open the service."}
              </p>
            ) : (
              <ul className="space-y-2">
                {accessLog.map((entry, idx) => {
                  const d = new Date(entry.ts);
                  return (
                    <li
                      key={`${entry.ts}-${idx}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">
                          {formatDistanceToNow(d, { addSuffix: true, locale: dateLocale })}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {format(d, "PPpp", { locale: dateLocale })}
                        </div>
                      </div>
                      {entry.path && (
                        <span
                          className="max-w-[45%] truncate text-[10px] text-muted-foreground"
                          title={entry.path}
                        >
                          {entry.path}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
              {isAr
                ? "يُحفظ السجل محليًا على جهازك فقط."
                : "History is stored locally on your device only."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
