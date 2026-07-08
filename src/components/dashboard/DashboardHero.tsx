import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Plus, FileText, Coins, Sparkles, Sun, Moon, Sunset, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import heroIllustration from "@/assets/dashboard/hero-illustration.jpg";

type Props = {
  orgName?: string;
  userName?: string;
  canCreate?: boolean;
  isAr: boolean;
};

function useGreeting() {
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

export function DashboardHero({ orgName, userName, canCreate, isAr }: Props) {
  const { t } = useTranslation();
  const { text: greeting, Icon: GIcon } = useGreeting();
  const displayName = userName?.trim() || orgName || "";

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-border bg-card",
        "text-foreground shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.35)]",
      )}
    >
      {/* Violet decorative rings */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 end-[-3rem] h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{
          background: "radial-gradient(closest-side, var(--primary), transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 start-[-4rem] h-80 w-80 rounded-full opacity-20 blur-3xl"
        style={{
          background: "radial-gradient(closest-side, var(--secondary), transparent 70%)",
        }}
      />
      {/* Subtle grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 p-6 sm:p-8">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <span className="relative inline-flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              {t("dashboard.hero.liveBadge")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              <GIcon className="size-3.5 text-primary" />
              {todayLabel(isAr)}
            </span>
          </div>

          <div>
            <p className="text-sm text-muted-foreground">
              {greeting}
              {displayName ? "،" : ""}
            </p>
            <h1 className="mt-0.5 truncate text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl md:text-4xl">
              {displayName || t("dashboard.title")}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("dashboard.hero.subtitle")}</p>
          </div>
        </div>

        <div className="hidden shrink-0 sm:block">
          <motion.img
            src={heroIllustration}
            alt=""
            width={320}
            height={192}
            className="h-40 w-auto select-none object-contain drop-shadow-[0_20px_30px_rgba(124,58,237,0.25)]"
            draggable={false}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>

      {/* Quick actions ribbon */}
      <div className="relative border-t border-border bg-muted/40 px-4 py-3 sm:px-6">
        <motion.div
          className="flex flex-wrap items-center gap-2"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
          }}
        >
          {canCreate && (
            <motion.div
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
            >
              <Button
                asChild
                size="sm"
                className="h-9 gap-2 bg-primary text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.45)] hover:bg-primary/90 active:shadow-[0_2px_10px_-4px_hsl(var(--primary)/0.5)]"
              >
                <Link to="/dashboard/properties/new">
                  <Plus className="size-4" />
                  {t("dashboard.hero.addProperty")}
                </Link>
              </Button>
            </motion.div>
          )}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <Button asChild size="sm" variant="outline" className="h-9 gap-2">
              <Link to="/dashboard/contracts/new">
                <FileText className="size-4 text-primary" />
                {t("dashboard.hero.newContract")}
              </Link>
            </Button>
          </motion.div>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <Button asChild size="sm" variant="outline" className="h-9 gap-2">
              <Link to="/dashboard/payments">
                <Coins className="size-4 text-primary" />
                {t("dashboard.hero.recordPayment")}
              </Link>
            </Button>
          </motion.div>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ scale: 1.04, y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            className="ms-auto"
          >
            <Button asChild size="sm" variant="ghost" className="h-9 gap-2">
              <Link to="/assistant">
                <motion.span
                  animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex"
                >
                  <Sparkles className="size-4 text-primary" />
                </motion.span>
                {t("dashboard.hero.askAI")}
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </motion.section>
  );
}

export default DashboardHero;
