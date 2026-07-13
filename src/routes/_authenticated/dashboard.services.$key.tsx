import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  History,
  ListChecks,
  Link2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sectionHead } from "@/lib/section-og-head";
import {
  getHubService,
  HUB_CATEGORIES,
  HUB_SERVICES,
} from "@/lib/services-hub-catalog";
import {
  clearAccessForService,
  recordServiceAccess,
  useServiceAccessLog,
} from "@/lib/service-access-log";

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
  notFoundComponent: () => {
    const { key } = Route.useParams();
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-xl font-bold">Service not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No service with id <code>{key}</code>.
        </p>
        <Link
          to="/dashboard/services"
          className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
        >
          ← Back to services hub
        </Link>
      </div>
    );
  },
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
      >
        Retry
      </button>
    </div>
  ),
});

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
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase">
                  {isAr ? category?.ar : category?.en}
                </Badge>
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
            <Link
              to={service.to}
              onClick={() => recordServiceAccess(service.id, service.to)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              {isAr ? "فتح الخدمة" : "Open service"}
              <ExternalLink className="size-4" />
            </Link>
          </div>
        </div>
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
                {service.links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="group inline-flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm transition hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="font-medium text-foreground">
                      {isAr ? link.labelAr : link.labelEn}
                    </span>
                    <Arrow className="size-4 text-muted-foreground transition group-hover:text-primary" />
                  </Link>
                ))}
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
