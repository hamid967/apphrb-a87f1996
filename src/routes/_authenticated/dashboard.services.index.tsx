import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  History,
  ExternalLink,
  AlertTriangle,
  RefreshCcw,
  Ban,
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";

import { formatDistanceToNow } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sectionHead } from "@/lib/section-og-head";
import {
  HUB_CATEGORIES,
  isHubServiceAvailable,
  type HubCategoryKey,
  type HubService,
} from "@/lib/services-hub-catalog";
import { useHubCatalog } from "@/lib/use-hub-catalog";
import { useSafeRouteNavigator } from "@/lib/use-safe-route-navigator";
import { recordServiceAccess, useServiceAccessLog } from "@/lib/service-access-log";
import { useMyRoles } from "@/hooks/use-my-roles";
import {
  ROLE_GROUPS,
  rolesForService,
  roleLabel,
  userCanUseService,
  type RoleGroupKey,
} from "@/lib/service-roles";


export const Route = createFileRoute(
  "/_authenticated/dashboard/services/",
)({
  head: () => sectionHead({ section: "dashboard", entityAr: "الخدمات", entityEn: "Services", path: "/dashboard/services" }),
  component: ServicesReportPage,
});

const CATEGORIES = HUB_CATEGORIES;
type CategoryKey = HubCategoryKey;

function ServicesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryKey>("all");
  const [roleGroup, setRoleGroup] = useState<RoleGroupKey | "all">("all");
  const [showAll, setShowAll] = useState(false);

  const { services, isLoading, error, refetch } = useHubCatalog();
  const { isKnownRoute, safeNavigate } = useSafeRouteNavigator();
  const { roles: myRoles, isLoading: rolesLoading } = useMyRoles();

  const isSuperAdmin = myRoles.includes("super_admin");

  const canUse = useMemo(
    () => (svc: HubService) => userCanUseService(myRoles, svc.id),
    [myRoles],
  );

  const recent = useServiceAccessLog();
  const recentServices = useMemo(() => {
    const seen = new Set<string>();
    const list: { service: HubService; ts: number }[] = [];
    for (const entry of recent) {
      if (seen.has(entry.id)) continue;
      const svc = services.find((s) => s.id === entry.id);
      if (!svc) continue;
      seen.add(entry.id);
      list.push({ service: svc, ts: entry.ts });
      if (list.length >= 6) break;
    }
    return list;
  }, [recent, services]);

  const activeGroup = useMemo(
    () => ROLE_GROUPS.find((g) => g.key === roleGroup),
    [roleGroup],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (!showAll && !canUse(s)) return false;
      if (activeGroup) {
        const allowed = rolesForService(s.id);
        const overlap = activeGroup.roles.some((r) => allowed.includes(r));
        if (!overlap) return false;
      }
      if (!q) return true;
      const hay = [
        s.titleAr,
        s.titleEn,
        s.descAr,
        s.descEn,
        ...s.featuresAr,
        ...s.featuresEn,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, cat, services, showAll, canUse, activeGroup]);

  const hiddenByRoleCount = useMemo(
    () => (showAll ? 0 : services.filter((s) => !canUse(s)).length),
    [services, showAll, canUse],
  );


  const handleUnavailable = (svc: HubService) => {
    toast.warning(
      isAr ? "الخدمة غير متاحة حاليًا" : "Service currently unavailable",
      {
        description: isAr
          ? (svc.unavailableReasonAr ?? `«${svc.titleAr}» غير متاحة الآن. جرّب لاحقًا.`)
          : (svc.unavailableReasonEn ?? `"${svc.titleEn}" is not available right now. Try again later.`),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 end-[-4rem] h-52 w-52 rounded-full bg-primary/20 blur-3xl"
        />
        <Badge variant="secondary" className="mb-3">
          {isAr ? "تقرير الخدمات" : "Services Report"}
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {isAr
            ? "جميع خدمات منصة عقاري في مكان واحد"
            : "All HBSpro services in one place"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {isAr
            ? "استعرض الأقسام كبطاقات تفاعلية، ابحث بسرعة، وتنقّل مباشرة إلى الخدمة التي تحتاجها."
            : "Browse sections as interactive cards, search fast, and jump straight to the service you need."}
        </p>

        {/* Search + filters */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? "ابحث عن خدمة..." : "Search services..."}
              className="ps-9"
              aria-label={isAr ? "بحث" : "Search"}
              disabled={isLoading || !!error}
            />
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((c) => {
              const active = cat === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCat(c.key)}
                  disabled={isLoading || !!error}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {isAr ? c.ar : c.en}
                </button>
              );
            })}
          </div>
        </div>

        {/* Role filter */}
        {!error && (
          <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" />
                {isAr ? "الأدوار:" : "Roles:"}
              </span>
              <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
                <button
                  type="button"
                  onClick={() => setRoleGroup("all")}
                  disabled={isLoading}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                    roleGroup === "all"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {isAr ? "الكل" : "All"}
                </button>
                {ROLE_GROUPS.map((g) => {
                  const active = roleGroup === g.key;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setRoleGroup(g.key)}
                      disabled={isLoading}
                      title={g.roles.map((r) => roleLabel(r, !!isAr)).join(" • ")}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50 ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {isAr ? g.ar : g.en}
                    </button>
                  );
                })}
              </div>
              {rolesLoading ? (
                <Skeleton className="h-5 w-24 rounded-full" />
              ) : myRoles.length > 0 ? (
                <span className="hidden items-center gap-1 text-[10px] text-muted-foreground md:inline-flex">
                  {isAr ? "أدوارك:" : "Your roles:"}
                  {myRoles.map((r) => (
                    <Badge key={r} variant="outline" className="h-5 px-1.5 text-[10px]">
                      {roleLabel(r, !!isAr)}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {isAr ? "لا توجد أدوار مُعيّنة" : "No roles assigned"}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              disabled={isSuperAdmin}
              title={
                isSuperAdmin
                  ? isAr
                    ? "المدير العام يرى كل شيء"
                    : "Super admin sees everything"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showAll ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {showAll
                ? isAr ? "إخفاء غير المسموح" : "Hide restricted"
                : isAr ? "عرض الكل" : "Show all"}
              {!showAll && hiddenByRoleCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                  +{hiddenByRoleCount}
                </Badge>
              )}
            </button>
          </div>
        )}
      </section>



      {/* Error state */}
      {error && (
        <section
          role="alert"
          aria-live="assertive"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {isAr ? "تعذّر تحميل الخدمات" : "Couldn't load services"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isAr
                    ? "حدث خطأ أثناء جلب قائمة الخدمات. تحقّق من الاتصال ثم أعد المحاولة."
                    : "Something went wrong while fetching the services list. Check your connection and retry."}
                </p>
                <p className="mt-2 font-mono text-[11px] text-destructive/80">
                  {error.message}
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                refetch();
                toast.info(isAr ? "إعادة المحاولة..." : "Retrying…");
              }}
            >
              <RefreshCcw className="me-1.5 size-3.5" />
              {isAr ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        </section>
      )}

      {/* Loading skeletons */}
      {isLoading && !error && (
        <>
          <section aria-hidden className="rounded-2xl border border-border/70 bg-card/60 p-4">
            <Skeleton className="mb-3 h-4 w-40" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-32 rounded-full" />
              ))}
            </div>
          </section>
          <div aria-hidden className="-mx-1 flex gap-2 overflow-hidden px-1 pb-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 shrink-0 rounded-full" />
            ))}
          </div>
          <section
            aria-busy="true"
            aria-label={isAr ? "جارٍ تحميل الخدمات" : "Loading services"}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between">
                  <Skeleton className="size-11 rounded-xl" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <Skeleton className="mt-2 h-5 w-40" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {/* Recently visited */}
      {!isLoading && !error && recentServices.length > 0 && (
        <section
          aria-label={isAr ? "آخر الخدمات المستخدمة" : "Recently visited services"}
          className="rounded-2xl border border-border/70 bg-card/60 p-4"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <History className="size-3.5" />
            {isAr ? "آخر الخدمات المستخدمة" : "Recently visited"}
          </div>
          <div className="flex flex-wrap gap-2">
            {recentServices.map(({ service, ts }) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.id}
                  to="/dashboard/services/$key"
                  params={{ key: service.id }}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition hover:border-primary/50 hover:text-primary"
                >
                  <Icon className="size-3.5" />
                  <span>{isAr ? service.titleAr : service.titleEn}</span>
                  <span className="text-[10px] text-muted-foreground">
                    · {formatDistanceToNow(new Date(ts), { addSuffix: true, locale: isAr ? arLocale : enUS })}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick nav */}
      {!isLoading && !error && (
        <nav
          aria-label={isAr ? "تنقّل سريع" : "Quick navigation"}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {filtered.map((s) => (
            <a
              key={s.id}
              href={`#svc-${s.id}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <s.icon className="size-3.5" />
              {isAr ? s.titleAr : s.titleEn}
            </a>
          ))}
        </nav>
      )}

      {/* Cards grid */}
      {!isLoading && !error && (
        <motion.section
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04 } },
          }}
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((s) => {
              const Icon = s.icon;
              const routeOk = isKnownRoute(s.to);
              const flagged = isHubServiceAvailable(s);
              const available = flagged && routeOk;
              const brokenLink = flagged && !routeOk;
              return (
                <motion.article
                  id={`svc-${s.id}`}
                  key={s.id}
                  layout
                  variants={{
                    hidden: { opacity: 0, y: 16, scale: 0.97 },
                    show: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: { type: "spring", stiffness: 260, damping: 22 },
                    },
                  }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                  whileHover={available ? { y: -4 } : undefined}
                  aria-disabled={!available || undefined}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border p-5 shadow-[0_4px_20px_-12px_hsl(var(--primary)/0.35)] transition-colors ${
                    available
                      ? "border-border bg-card hover:border-primary/40"
                      : "border-dashed border-border/60 bg-muted/30 opacity-70"
                  }`}
                >
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute inset-x-0 -top-12 h-32 bg-gradient-to-b ${s.hue} ${available ? "opacity-70" : "opacity-20"} blur-2xl`}
                  />
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className={`inline-flex size-11 items-center justify-center rounded-xl ring-1 ${available ? "bg-primary/10 text-primary ring-primary/20" : "bg-muted text-muted-foreground ring-border"}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {isAr
                          ? CATEGORIES.find((c) => c.key === s.category)?.ar
                          : CATEGORIES.find((c) => c.key === s.category)?.en}
                      </Badge>
                      {!flagged && (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <Ban className="size-3" />
                          {isAr ? "غير متاحة" : "Unavailable"}
                        </Badge>
                      )}
                      {brokenLink && (
                        <Badge variant="destructive" className="gap-1 text-[10px]" title={s.to}>
                          <AlertTriangle className="size-3" />
                          {isAr ? "رابط مفقود" : "Broken link"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <h2 className="relative z-10 mt-4 text-base font-bold text-foreground">
                    {isAr ? s.titleAr : s.titleEn}
                  </h2>
                  <p className="relative z-10 mt-1 text-xs text-muted-foreground">
                    {isAr ? s.descAr : s.descEn}
                  </p>
                  {!flagged && (s.unavailableReasonAr || s.unavailableReasonEn) && (
                    <p className="relative z-10 mt-2 rounded-md border border-dashed border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
                      {isAr ? s.unavailableReasonAr : s.unavailableReasonEn}
                    </p>
                  )}
                  {brokenLink && (
                    <p className="relative z-10 mt-2 rounded-md border border-dashed border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
                      {isAr
                        ? `المسار ${s.to} غير مسجّل حاليًا. افتح صفحة التفاصيل للمزيد.`
                        : `The route ${s.to} isn't registered. Open the details page for more info.`}
                    </p>
                  )}
                  <ul className="relative z-10 mt-3 flex flex-wrap gap-1.5">
                    {(isAr ? s.featuresAr : s.featuresEn).map((f) => (
                      <li
                        key={f}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="relative z-10 mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    {available ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await safeNavigate(s.to, { isAr: !!isAr });
                          if (ok) recordServiceAccess(s.id, s.to);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-primary"
                      >
                        <ExternalLink className="size-3" />
                        {isAr ? "فتح مباشر" : "Open direct"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          brokenLink
                            ? toast.error(
                                isAr ? "الرابط غير متاح" : "Link unavailable",
                                {
                                  description: isAr
                                    ? `المسار «${s.to}» غير مسجّل في التطبيق.`
                                    : `Route "${s.to}" isn't registered in the app.`,
                                },
                              )
                            : handleUnavailable(s)
                        }
                        className="inline-flex cursor-not-allowed items-center gap-1 text-[11px] font-medium text-muted-foreground/70"
                      >
                        {brokenLink ? <AlertTriangle className="size-3" /> : <Ban className="size-3" />}
                        {brokenLink
                          ? isAr ? "رابط مفقود" : "Broken link"
                          : isAr ? "غير متاحة" : "Unavailable"}
                      </button>
                    )}

                    <Link
                      to="/dashboard/services/$key"
                      params={{ key: s.id }}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
                    >
                      {isAr ? "التفاصيل" : "Details"}
                      <motion.span
                        animate={{ x: [0, isAr ? -3 : 3, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        className="inline-flex"
                      >
                        <Arrow className="size-3.5" />
                      </motion.span>
                    </Link>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.section>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد نتائج مطابقة." : "No matching services."}
        </div>
      )}
    </div>
  );
}
