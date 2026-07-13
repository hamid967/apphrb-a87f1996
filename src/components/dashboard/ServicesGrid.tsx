import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  SERVICE_CATALOG,
  serviceIsEnabled,
  categoryLabel,
  type ServiceKey,
} from "@/lib/service-catalog";
import { getMyServiceEntitlements } from "@/lib/service-entitlements.functions";
import { cn } from "@/lib/utils";

export function ServicesGrid({ isAr }: { isAr: boolean }) {
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const reduce = useReducedMotion();
  const getEntitlements = useServerFn(getMyServiceEntitlements);
  const entitlementsQ = useQuery({
    queryKey: ["my-service-entitlements"],
    queryFn: () => getEntitlements(),
    staleTime: 60_000,
  });
  const enabled = entitlementsQ.data?.enabled as ServiceKey[] | undefined;
  const visibleServices = SERVICE_CATALOG.slice(0, 8);

  return (
    <section
      aria-label={isAr ? "الخدمات" : "Services"}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <Sparkles className="size-3.5" />
            {isAr ? "خدمات حسابك" : "Your Services"}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {isAr ? "الخدمات المفعّلة" : "Enabled Services"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "الأدمن يحدد الخدمات المتاحة لكل عميل من لوحة التحكم."
              : "Admin controls which services are available for each customer."}
          </p>
        </div>
        <Link
          to="/dashboard/services"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          {isAr ? "كل الخدمات" : "All services"}
          <Arrow className="size-3" />
        </Link>
      </div>

      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        initial={reduce ? false : "hidden"}
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
        }}
      >
        {visibleServices.map((service) => {
          const Icon = service.icon;
          const unlocked = serviceIsEnabled(enabled, service.key);
          const content = (
            <div
              className={cn(
                "group relative flex h-full min-h-40 flex-col overflow-hidden rounded-2xl border p-4 text-start transition-all",
                unlocked
                  ? "border-border/70 bg-gradient-to-br from-card via-card to-background hover:-translate-y-1 hover:border-primary/60 hover:shadow-[0_18px_38px_-22px_hsl(var(--primary)/0.55)]"
                  : "border-border/50 bg-muted/30 opacity-70",
              )}
            >
              {/* Top glow bar on hover */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-x-4 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100",
                  unlocked && "bg-gradient-to-r from-transparent via-primary/70 to-transparent",
                )}
              />
              <div className="mb-4 flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-2xl transition-transform group-hover:scale-110",
                    unlocked
                      ? "border border-primary/30 bg-primary/12 text-primary shadow-[0_6px_18px_-10px_hsl(var(--primary)/0.6)]"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-1 text-[10px] font-semibold",
                    unlocked
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {categoryLabel(service.category, isAr)}
                </span>
              </div>
              <div className="text-sm font-bold text-foreground">
                {isAr ? service.titleAr : service.titleEn}
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {isAr ? service.descAr : service.descEn}
              </p>
              <div className="mt-auto pt-4">
                {unlocked ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-transform group-hover:gap-2">
                    {isAr ? "فتح الخدمة" : "Open service"}
                    <Arrow className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                    <LockKeyhole className="size-3" />
                    {isAr ? "تحتاج تفعيل الأدمن" : "Admin activation required"}
                  </span>
                )}
              </div>
            </div>
          );

          return (
            <motion.div
              key={service.key}
              variants={{
                hidden: { opacity: 0, y: 12, scale: 0.97 },
                show: { opacity: 1, y: 0, scale: 1 },
              }}
              className="touch-manipulation"
            >
              {unlocked ? (
                <Link to={service.to} className="block h-full">
                  {content}
                </Link>
              ) : (
                <div className="h-full" aria-disabled="true">
                  {content}
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

export default ServicesGrid;
