import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { LucideIcon } from "lucide-react";
import { Activity as ActivityIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineStatus =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "highlight";

export type TimelineItem = {
  id: string;
  title: string;
  detail?: string;
  /** ISO string or epoch ms */
  at: string | number | Date;
  icon?: LucideIcon;
  status?: TimelineStatus;
  /** Optional short label rendered as a status chip */
  badge?: string;
};

const STATUS_STYLES: Record<
  TimelineStatus,
  { dot: string; ring: string; chip: string; line: string; glow: string }
> = {
  success: {
    dot: "bg-emerald-500 text-white",
    ring: "ring-emerald-500/30",
    chip: "bg-emerald-500/12 text-emerald-500 border-emerald-500/30",
    line: "from-emerald-500/50",
    glow: "shadow-[0_0_0_4px_hsl(var(--background)),0_0_12px_2px_rgba(16,185,129,0.35)]",
  },
  warning: {
    dot: "bg-amber-500 text-white",
    ring: "ring-amber-500/30",
    chip: "bg-amber-500/12 text-amber-500 border-amber-500/30",
    line: "from-amber-500/50",
    glow: "shadow-[0_0_0_4px_hsl(var(--background)),0_0_12px_2px_rgba(245,158,11,0.35)]",
  },
  danger: {
    dot: "bg-rose-500 text-white",
    ring: "ring-rose-500/30",
    chip: "bg-rose-500/12 text-rose-500 border-rose-500/30",
    line: "from-rose-500/50",
    glow: "shadow-[0_0_0_4px_hsl(var(--background)),0_0_12px_2px_rgba(244,63,94,0.35)]",
  },
  info: {
    dot: "bg-sky-500 text-white",
    ring: "ring-sky-500/30",
    chip: "bg-sky-500/12 text-sky-500 border-sky-500/30",
    line: "from-sky-500/50",
    glow: "shadow-[0_0_0_4px_hsl(var(--background)),0_0_12px_2px_rgba(14,165,233,0.35)]",
  },
  highlight: {
    dot: "bg-primary text-primary-foreground",
    ring: "ring-primary/30",
    chip: "bg-primary/12 text-primary border-primary/30",
    line: "from-primary/60",
    glow: "shadow-[0_0_0_4px_hsl(var(--background)),0_0_14px_2px_hsl(var(--primary)/0.45)]",
  },
  neutral: {
    dot: "bg-muted-foreground/70 text-background",
    ring: "ring-muted-foreground/20",
    chip: "bg-muted text-muted-foreground border-border",
    line: "from-muted-foreground/40",
    glow: "",
  },
};

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 260, damping: 24 },
  },
};

export function ActivityTimeline({
  items,
  emptyLabel,
  className,
  dense = false,
}: {
  items: TimelineItem[];
  emptyLabel?: string;
  className?: string;
  dense?: boolean;
}) {
  const { i18n } = useTranslation();
  const reduce = useReducedMotion();
  const now = useNow();
  const locale = i18n.language?.startsWith("ar") ? ar : enUS;

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyLabel ?? "—"}
      </div>
    );
  }

  return (
    <motion.ol
      variants={reduce ? undefined : containerVariants}
      initial={reduce ? false : "hidden"}
      animate="show"
      className={cn("relative space-y-3 ps-6", className)}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-1 start-[10px] w-px",
          "bg-gradient-to-b from-primary/40 via-border to-transparent",
        )}
      />
      {items.map((it, idx) => {
        const status: TimelineStatus = it.status ?? "neutral";
        const s = STATUS_STYLES[status];
        const Icon = it.icon ?? ActivityIcon;
        const atMs =
          typeof it.at === "number"
            ? it.at
            : it.at instanceof Date
              ? it.at.getTime()
              : new Date(it.at).getTime();
        const relative = Number.isFinite(atMs)
          ? formatDistanceToNow(atMs, { addSuffix: true, locale })
          : "";
        const isLatest = idx === 0;
        return (
          <motion.li
            key={it.id}
            variants={reduce ? undefined : itemVariants}
            whileHover={reduce ? undefined : { x: 2 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "group relative rounded-lg border bg-card/60 backdrop-blur-sm",
              "px-3 py-2.5 transition-colors hover:bg-card hover:border-primary/30",
              dense && "py-2",
            )}
            data-now={now}
          >
            <span
              className={cn(
                "absolute -start-[22px] top-3 grid size-5 place-items-center rounded-full ring-2 ring-background transition-transform",
                s.dot,
                "group-hover:scale-110",
                isLatest && s.glow,
              )}
            >
              <Icon className="size-3" />
              {isLatest && !reduce && (
                <motion.span
                  aria-hidden
                  className={cn("absolute inset-0 rounded-full", s.dot, "opacity-60")}
                  animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              )}
            </span>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{it.title}</p>
                  {it.badge && (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                        s.chip,
                      )}
                    >
                      {it.badge}
                    </span>
                  )}
                </div>
                {it.detail && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{it.detail}</p>
                )}
              </div>
              <time
                className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
                dateTime={new Date(atMs).toISOString()}
                title={new Date(atMs).toLocaleString(i18n.language)}
              >
                {relative}
              </time>
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

export default ActivityTimeline;
