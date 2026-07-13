import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import {
  Plus,
  FileText,
  Coins,
  Sparkles,
  Sun,
  Moon,
  Sunset,
  Sunrise,
  Receipt,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

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
 * Dashboard hero — built on the unified <PageHeader /> for visual
 * consistency with admin/portal, plus a mobile-first quick-actions
 * ribbon below.
 */
export function DashboardHero({ orgName, userName, canCreate, isAr }: Props) {
  const { t } = useTranslation();
  const { text: greeting, Icon: GIcon } = useGreeting();
  const displayName = userName?.trim() || orgName || "";
  const title = displayName || t("dashboard.title");
  const description = `${greeting}${displayName ? "،" : ""} · ${todayLabel(isAr)}`;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="holo-aurora space-y-3 rounded-3xl p-1"
      aria-label={t("dashboard.title")}
    >
      <PageHeader
        title={title}
        description={description}
        icon={GIcon}
        actions={
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
            aria-label={t("dashboard.hero.liveBadge")}
          >
            <span className="relative inline-flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            {t("dashboard.hero.liveBadge")}
          </span>
        }
        className="mb-0 border-b-0 pb-0"
      />

      {/* Quick-actions ribbon — mobile-first: horizontal scroll on
          narrow screens, wraps naturally from sm: upward. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="flex min-w-max items-center gap-2 sm:min-w-0 sm:flex-wrap">
          <Button
            asChild
            size="sm"
            className="h-9 shrink-0 gap-2 bg-gradient-to-r from-warning to-warning text-white shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.45)] hover:from-warning hover:to-warning"
          >
            <Link
              to="/dashboard/expenses/claim"
              aria-label={isAr ? "رفع إيصال جديد في خطوتين" : "Upload a new receipt in two steps"}
            >
              <Receipt className="size-4" aria-hidden />
              {isAr ? "رفع إيصال" : "Upload receipt"}
              <span className="ms-1 hidden rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold sm:inline">
                {isAr ? "خطوتان" : "2 steps"}
              </span>
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-9 shrink-0 gap-2 border-warning/40 text-warning hover:bg-warning/10 dark:text-warning"
          >
            <Link
              to="/dashboard/expenses/batches"
              hash="new"
              aria-label={isAr ? "بدء تقرير مصروفات جماعي" : "Start a batch expense report"}
            >
              <Layers className="size-4" aria-hidden />
              {isAr ? "تقرير جماعي" : "Batch report"}
              <span className="ms-1 hidden rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold sm:inline">
                {isAr ? "خطوتان" : "2 steps"}
              </span>
            </Link>
          </Button>
          {canCreate && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-2"
            >
              <Link to="/dashboard/properties/new">
                <Plus className="size-4" aria-hidden />
                {t("dashboard.hero.addProperty")}
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline" className="h-9 shrink-0 gap-2">
            <Link to="/dashboard/contracts/new">
              <FileText className="size-4 text-primary" aria-hidden />
              {t("dashboard.hero.newContract")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-9 shrink-0 gap-2">
            <Link to="/dashboard/payments">
              <Coins className="size-4 text-primary" aria-hidden />
              {t("dashboard.hero.recordPayment")}
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-9 shrink-0 gap-2 sm:ms-auto"
          >
            <Link to="/assistant">
              <motion.span
                animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="inline-flex"
              >
                <Sparkles className="size-4 text-primary" aria-hidden />
              </motion.span>
              {t("dashboard.hero.askAI")}
            </Link>
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

export default DashboardHero;
