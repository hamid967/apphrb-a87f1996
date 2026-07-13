import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Moon, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import { QuickActionsRow } from "@/components/dashboard/QuickActionsRow";

type Props = {
  orgName?: string;
  userName?: string;
  canCreate?: boolean;
  isAr: boolean;
};

function useGreeting(): { text: string; Icon: LucideIcon } {
  const { t } = useTranslation();
  const [h, setH] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = window.setInterval(() => setH(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (h < 5) return { text: t("dashboard.hero.night"), Icon: Moon };
  if (h < 12) return { text: t("dashboard.hero.morning"), Icon: Sunrise };
  if (h < 17) return { text: t("dashboard.hero.afternoon"), Icon: Sun };
  if (h < 21) return { text: t("dashboard.hero.evening"), Icon: Sunset };
  return { text: t("dashboard.hero.night"), Icon: Moon };
}

function todayLabel(isAr: boolean) {
  return new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

/**
 * Dashboard hero — Slate & Steel tech surface with a subtle grid overlay,
 * gradient rail, greeting, and the QuickActionsRow beneath. Data + copy
 * unchanged; only presentation is refreshed.
 */
export function DashboardHero({ orgName, userName, canCreate, isAr }: Props) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const { text: greeting, Icon: GIcon } = useGreeting();
  const displayName = userName?.trim() || orgName || "";
  const title = displayName || t("dashboard.title");

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      aria-label={t("dashboard.title")}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-background p-5 sm:p-6"
    >
      {/* Grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_75%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border)/0.35) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)/0.35) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -end-24 -top-24 size-64 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -start-16 size-56 rounded-full bg-info/15 blur-3xl"
      />

      {/* Top rail */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />

      <div className="relative flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.span
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
              className="relative grid size-11 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.6)]"
              aria-hidden
            >
              <GIcon className="size-5" />
              <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
            </motion.span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span>{greeting}</span>
                <span aria-hidden className="text-border">·</span>
                <span className="tabular-nums text-muted-foreground/90">
                  {todayLabel(isAr)}
                </span>
              </div>
              <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
            </div>
          </div>

          <span
            className="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
            aria-label={t("dashboard.hero.liveBadge")}
          >
            <span className="relative inline-flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            {t("dashboard.hero.liveBadge")}
          </span>
        </div>

        <QuickActionsRow isAr={isAr} canCreate={canCreate} />
      </div>
    </motion.section>
  );
}

export default DashboardHero;
