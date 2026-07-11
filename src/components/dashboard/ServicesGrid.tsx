import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
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

export function ServicesGrid({ isAr }: { isAr: boolean }) {
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const getEntitlements = useServerFn(getMyServiceEntitlements);
  const entitlementsQ = useQuery({
    queryKey: ["my-service-entitlements"],
    queryFn: () => getEntitlements(),
    staleTime: 60_000,
  });
  const enabled = entitlementsQ.data?.enabled as ServiceKey[] | undefined;
  const visibleServices = SERVICE_CATALOG.slice(0, 8);

  return (
    <section aria-label={isAr ? "الخدمات" : "Services"} className="studio-card-lg p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="studio-eyebrow mb-2">
            <Sparkles className="size-3.5" />
            {isAr ? "خدمات حسابك" : "Your Services"}
          </div>
          <h2 className="studio-title text-xl">
            {isAr ? "الخدمات المفعّلة" : "Enabled Services"}
          </h2>
          <p className="studio-copy mt-1 text-xs">
            {isAr
              ? "الأدمن يحدد الخدمات المتاحة لكل عميل من لوحة التحكم."
              : "Admin controls which services are available for each customer."}
          </p>
        </div>
        <Link
          to="/dashboard/services-report"
          className="studio-button-ghost px-3 py-2 text-xs font-bold"
        >
          {isAr ? "كل الخدمات" : "All services"}
          <Arrow className="size-3" />
        </Link>
      </div>
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        initial="hidden"
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
              className={[
                "group relative flex h-full min-h-40 flex-col overflow-hidden rounded-2xl border p-4 text-start transition",
                unlocked
                  ? "border-[#C5A059]/25 bg-white/80 shadow-[0_18px_48px_-34px_rgba(4,57,39,0.45)] hover:-translate-y-1 hover:border-[#C5A059]/60"
                  : "border-border bg-muted/45 opacity-75",
              ].join(" ")}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <span
                  className={[
                    "grid size-11 place-items-center rounded-2xl",
                    unlocked ? "bg-[#043927] text-[#C5A059]" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  <Icon className="size-5" />
                </span>
                <span className="rounded-full border border-[#C5A059]/25 bg-[#C5A059]/10 px-2 py-1 text-[10px] font-bold text-[#043927]">
                  {categoryLabel(service.category, isAr)}
                </span>
              </div>
              <div className="font-black text-foreground">
                {isAr ? service.titleAr : service.titleEn}
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {isAr ? service.descAr : service.descEn}
              </p>
              <div className="mt-auto pt-4">
                {unlocked ? (
                  <span className="inline-flex items-center gap-1 text-xs font-black text-primary">
                    {isAr ? "فتح الخدمة" : "Open service"}
                    <Arrow className="size-3" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">
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
