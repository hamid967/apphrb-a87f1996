import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  FileText,
  Coins,
  Sparkles,
  Receipt,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ActionTone = "primary" | "warning" | "info" | "muted";

type ActionDef = {
  key: string;
  to: string;
  hash?: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  ariaLabel?: string;
  tone: ActionTone;
  featured?: boolean;
  animateIcon?: boolean;
};

const toneClasses: Record<ActionTone, { base: string; icon: string; badge: string }> = {
  primary: {
    base:
      "border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent text-foreground hover:border-primary/70 hover:from-primary/25",
    icon: "bg-primary/15 text-primary ring-primary/30",
    badge: "bg-primary/20 text-primary",
  },
  warning: {
    base:
      "border-warning/40 bg-gradient-to-br from-warning/15 via-warning/5 to-transparent text-foreground hover:border-warning/70 hover:from-warning/25",
    icon: "bg-warning/15 text-warning ring-warning/30",
    badge: "bg-warning/20 text-warning",
  },
  info: {
    base:
      "border-info/40 bg-gradient-to-br from-info/12 via-info/5 to-transparent text-foreground hover:border-info/70 hover:from-info/25",
    icon: "bg-info/15 text-info ring-info/30",
    badge: "bg-info/20 text-info",
  },
  muted: {
    base:
      "border-border/60 bg-card/60 text-foreground hover:border-primary/40 hover:bg-card",
    icon: "bg-muted text-muted-foreground ring-border/60",
    badge: "bg-muted text-muted-foreground",
  },
};

export function QuickActionsRow({
  isAr,
  canCreate,
}: {
  isAr: boolean;
  canCreate?: boolean;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();

  const actions: ActionDef[] = [
    {
      key: "upload-receipt",
      to: "/dashboard/expenses/claim",
      icon: Receipt,
      label: isAr ? "رفع إيصال" : "Upload receipt",
      hint: isAr ? "خطوتان" : "2 steps",
      ariaLabel: isAr
        ? "رفع إيصال جديد في خطوتين"
        : "Upload a new receipt in two steps",
      tone: "warning",
      featured: true,
    },
    {
      key: "batch-report",
      to: "/dashboard/expenses/batches",
      hash: "new",
      icon: Layers,
      label: isAr ? "تقرير جماعي" : "Batch report",
      hint: isAr ? "خطوتان" : "2 steps",
      ariaLabel: isAr ? "بدء تقرير مصروفات جماعي" : "Start a batch expense report",
      tone: "warning",
    },
    ...(canCreate
      ? [
          {
            key: "add-property",
            to: "/dashboard/properties/new",
            icon: Plus,
            label: t("dashboard.hero.addProperty"),
            tone: "info" as ActionTone,
          },
        ]
      : []),
    {
      key: "new-contract",
      to: "/dashboard/contracts/new",
      icon: FileText,
      label: t("dashboard.hero.newContract"),
      tone: "info",
    },
    {
      key: "record-payment",
      to: "/dashboard/payments",
      icon: Coins,
      label: t("dashboard.hero.recordPayment"),
      tone: "primary",
    },
    {
      key: "ask-ai",
      to: "/assistant",
      icon: Sparkles,
      label: t("dashboard.hero.askAI"),
      tone: "muted",
      animateIcon: true,
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label={isAr ? "إجراءات سريعة" : "Quick actions"}
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0"
    >
      <motion.div
        initial={reduce ? false : "hidden"}
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
        }}
        className="flex min-w-max items-stretch gap-2 sm:min-w-0 sm:flex-wrap"
      >
        {actions.map((a) => {
          const Icon = a.icon;
          const tone = toneClasses[a.tone];
          return (
            <motion.div
              key={a.key}
              variants={{
                hidden: { opacity: 0, y: 6 },
                show: { opacity: 1, y: 0 },
              }}
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 26 }}
              className={cn(a.key === "ask-ai" && "sm:ms-auto")}
            >
              <Link
                to={a.to}
                hash={a.hash}
                aria-label={a.ariaLabel ?? a.label}
                className={cn(
                  "group relative inline-flex h-11 shrink-0 items-center gap-2.5 rounded-xl border px-3 text-sm font-medium",
                  "backdrop-blur-sm transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  tone.base,
                  a.featured &&
                    "shadow-[0_8px_24px_-12px_hsl(var(--warning)/0.5)]",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-lg ring-1 transition-transform group-hover:scale-110",
                    tone.icon,
                  )}
                >
                  {a.animateIcon && !reduce ? (
                    <motion.span
                      animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
                      transition={{
                        duration: 2.6,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="inline-flex"
                    >
                      <Icon className="size-4" aria-hidden />
                    </motion.span>
                  ) : (
                    <Icon className="size-4" aria-hidden />
                  )}
                </span>
                <span className="whitespace-nowrap">{a.label}</span>
                {a.hint && (
                  <span
                    className={cn(
                      "hidden rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:inline",
                      tone.badge,
                    )}
                  >
                    {a.hint}
                  </span>
                )}
                {/* Sheen sweep */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full rounded-xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100"
                />
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

export default QuickActionsRow;
