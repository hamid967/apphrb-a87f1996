import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, ShieldAlert, Lock, Sparkles, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  HUB_CATEGORIES,
  HUB_SERVICES,
  isHubServiceAvailable,
  type HubService,
} from "@/lib/services-hub-catalog";
import {
  roleLabel,
  rolesForService,
  userCanUseService,
  type AppRole,
} from "@/lib/service-roles";
import { useSafeRouteNavigator } from "@/lib/use-safe-route-navigator";
import { recordForbiddenAttempt } from "@/lib/service-forbidden-log";

type Props = {
  service: HubService;
  myRoles: AppRole[];
  isAr: boolean;
};

/**
 * Full-screen Forbidden view shown when the current user opens a service
 * page they don't have the required role for. Suggests the closest
 * allowed services — same-category first, then others — filtered to only
 * routes that actually exist in the router.
 */
export function ForbiddenScreen({ service, myRoles, isAr }: Props) {
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const { isKnownRoute } = useSafeRouteNavigator();
  const requiredRoles = rolesForService(service.id);
  const category = HUB_CATEGORIES.find((c) => c.key === service.category);

  // Log the blocked attempt (dedup handled inside the recorder).
  useEffect(() => {
    recordForbiddenAttempt({
      id: service.id,
      reason: "missing_role",
      requiredRoles,
      userRoles: myRoles,
      source: "detail",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  const suggestions = useMemo(() => {
    const allowed = HUB_SERVICES.filter(
      (s) =>
        s.id !== service.id &&
        isHubServiceAvailable(s) &&
        isKnownRoute(s.to) &&
        userCanUseService(myRoles, s.id),
    );
    // Score: same category first, then keep catalog order.
    const sameCat = allowed.filter((s) => s.category === service.category);
    const others = allowed.filter((s) => s.category !== service.category);
    return [...sameCat, ...others].slice(0, 6);
  }, [service.id, service.category, myRoles, isKnownRoute]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="text-xs">
        <Link
          to="/dashboard/services"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
        >
          <Arrow className="size-3 rotate-180" />
          {isAr ? "كل الخدمات" : "All services"}
        </Link>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-3xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8"
        role="alert"
        aria-labelledby="forbidden-title"
      >
        <div className="flex flex-col items-start gap-5 sm:flex-row">
          <div className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/30">
            <ShieldAlert className="size-7" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <Lock className="size-3" />
                {isAr ? "403 — محجوب" : "403 — Forbidden"}
              </Badge>
              {category && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {isAr ? category.ar : category.en}
                </Badge>
              )}
            </div>
            <h1
              id="forbidden-title"
              className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
            >
              {isAr ? "لا تملك صلاحية فتح هذه الخدمة" : "You can't open this service"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {isAr ? (
                <>
                  خدمة «<strong className="text-foreground">{service.titleAr}</strong>»
                  متاحة فقط للأدوار المذكورة أدناه. تواصل مع مدير الحساب لمنحك الصلاحية،
                  أو جرّب واحدة من الخدمات المسموحة لك أدناه.
                </>
              ) : (
                <>
                  "<strong className="text-foreground">{service.titleEn}</strong>" is
                  only available to the roles listed below. Ask an admin to grant you
                  access, or try one of the services you can use.
                </>
              )}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {isAr ? "الأدوار المطلوبة:" : "Required roles:"}
              </span>
              {requiredRoles.map((r) => (
                <Badge key={r} variant="secondary" className="h-6 px-2">
                  {roleLabel(r, isAr)}
                </Badge>
              ))}
            </div>

            {myRoles.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {isAr ? "أدوارك الحالية:" : "Your roles:"}
                </span>
                {myRoles.map((r) => (
                  <Badge key={r} variant="outline" className="h-6 px-2">
                    {roleLabel(r, isAr)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="size-4 text-primary" />
          {isAr ? "خدمات مسموحة لك" : "Services you can use"}
        </h2>

        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "لا توجد خدمات إضافية متاحة لأدوارك الحالية. تواصل مع الإدارة لتوسيع صلاحياتك."
              : "No other services are available for your current roles. Contact an admin to expand your access."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((s) => {
              const Icon = s.icon;
              const sameCat = s.category === service.category;
              return (
                <Link
                  key={s.id}
                  to="/dashboard/services/$key"
                  params={{ key: s.id }}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-background p-3 transition hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {isAr ? s.titleAr : s.titleEn}
                      </span>
                      {sameCat && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          {isAr ? "نفس الفئة" : "Same category"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {isAr ? s.descAr : s.descEn}
                    </p>
                  </div>
                  <Arrow className="mt-2 size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/dashboard/services"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            {isAr ? "تصفح مركز الخدمات" : "Browse services hub"}
            <Arrow className="size-4 rotate-180" />
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            {isAr ? "العودة إلى لوحة التحكم" : "Back to dashboard"}
          </Link>
        </div>
      </section>
    </div>
  );
}
