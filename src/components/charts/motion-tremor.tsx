import { AreaChart, BarChart, LineChart, DonutChart } from "@tremor/react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import type { MotionProps, Variants } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * MotionTremor — a small, opinionated wrapper around Tremor charts wired with
 * Framer Motion (parallax reveal + staggered children + animated counters).
 *
 * Every chart is scroll-triggered via `whileInView`, respects
 * `prefers-reduced-motion`, and shares one visual language across dashboards.
 */

// Tremor accepts Tailwind palette names, not hex codes.
export const TREMOR_PALETTE = [
  "emerald",
  "blue",
  "amber",
  "rose",
  "violet",
  "cyan",
  "yellow",
  "red",
  "green",
  "indigo",
] as const;

export type TremorColor = (typeof TREMOR_PALETTE)[number];

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Container that reveals its children with a staggered, parallax-tinged entrance. */
export function StaggerSection({
  children,
  className = "",
  parallax = true,
  ...rest
}: { children: ReactNode; className?: string; parallax?: boolean } & MotionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const yShift = useTransform(scrollYProgress, [0, 1], [12, -12]);

  return (
    <motion.div
      ref={ref}
      variants={sectionVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      style={parallax && !reduce ? { y: yShift } : undefined}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Panel/card wrapper with hover-lift + reveal animation. */
export function MotionPanel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={`group rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm ring-1 ring-border/40 backdrop-blur-xl transition-shadow hover:shadow-lg ${className}`}
    >
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title ? <div className="text-sm font-semibold">{title}</div> : null}
            {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      )}
      {children}
    </motion.div>
  );
}

/** Animated number counter using motion springs. */
export function Counter({
  value,
  format,
  className = "",
  duration = 1.2,
}: {
  value: number;
  format?: (v: number) => string;
  className?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 20, mass: 1 });

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(value);
      return;
    }
    const start = performance.now();
    const from = mv.get();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      mv.set(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce, mv]);

  useEffect(() => {
    return spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = (format ?? ((n) => Math.round(n).toString()))(v);
    });
  }, [spring, format]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {(format ?? ((n) => Math.round(n).toString()))(0)}
    </span>
  );
}

type CommonChartProps<T> = {
  data: T[];
  index: string;
  categories: string[];
  colors?: TremorColor[];
  valueFormatter?: (v: number) => string;
  className?: string;
  showLegend?: boolean;
  showGridLines?: boolean;
  yAxisWidth?: number;
  emptyLabel?: string;
};

function ChartFallback({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-[220px] place-items-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}

/** Tremor AreaChart + reveal animation. */
export function MotionAreaChart<T extends Record<string, unknown>>({
  data,
  index,
  categories,
  colors = ["emerald", "rose"],
  valueFormatter,
  className = "h-64 mt-2",
  showLegend = true,
  showGridLines = true,
  yAxisWidth = 44,
  emptyLabel = "No data",
}: CommonChartProps<T>) {
  if (!data || data.length === 0) return <ChartFallback label={emptyLabel} />;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <AreaChart
        data={data as Record<string, unknown>[]}
        index={index}
        categories={categories}
        colors={[...colors]}
        valueFormatter={valueFormatter}
        showLegend={showLegend}
        showGridLines={showGridLines}
        yAxisWidth={yAxisWidth}
        showAnimation
        animationDuration={900}
        curveType="monotone"
        className={className}
      />
    </motion.div>
  );
}

export function MotionBarChart<T extends Record<string, unknown>>({
  data,
  index,
  categories,
  colors = ["violet"],
  valueFormatter,
  className = "h-64 mt-2",
  showLegend = true,
  showGridLines = true,
  yAxisWidth = 44,
  emptyLabel = "No data",
  layout,
}: CommonChartProps<T> & { layout?: "vertical" | "horizontal" }) {
  if (!data || data.length === 0) return <ChartFallback label={emptyLabel} />;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <BarChart
        data={data as Record<string, unknown>[]}
        index={index}
        categories={categories}
        colors={[...colors]}
        valueFormatter={valueFormatter}
        showLegend={showLegend}
        showGridLines={showGridLines}
        yAxisWidth={yAxisWidth}
        showAnimation
        animationDuration={900}
        layout={layout}
        className={className}
      />
    </motion.div>
  );
}

export function MotionLineChart<T extends Record<string, unknown>>({
  data,
  index,
  categories,
  colors = ["emerald", "rose", "blue"],
  valueFormatter,
  className = "h-64 mt-2",
  showLegend = true,
  showGridLines = true,
  yAxisWidth = 44,
  emptyLabel = "No data",
}: CommonChartProps<T>) {
  if (!data || data.length === 0) return <ChartFallback label={emptyLabel} />;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <LineChart
        data={data as Record<string, unknown>[]}
        index={index}
        categories={categories}
        colors={[...colors]}
        valueFormatter={valueFormatter}
        showLegend={showLegend}
        showGridLines={showGridLines}
        yAxisWidth={yAxisWidth}
        showAnimation
        animationDuration={900}
        curveType="monotone"
        className={className}
      />
    </motion.div>
  );
}

export function MotionDonutChart<T extends Record<string, unknown>>({
  data,
  index,
  category,
  colors = [...TREMOR_PALETTE],
  valueFormatter,
  variant = "donut",
  className = "h-64 mt-2",
  emptyLabel = "No data",
}: {
  data: T[];
  index: string;
  category: string;
  colors?: TremorColor[];
  valueFormatter?: (v: number) => string;
  variant?: "donut" | "pie";
  className?: string;
  emptyLabel?: string;
}) {
  if (!data || data.length === 0) return <ChartFallback label={emptyLabel} />;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <DonutChart
        data={data as Record<string, unknown>[]}
        index={index}
        category={category}
        colors={[...colors]}
        valueFormatter={valueFormatter}
        variant={variant}
        showAnimation
        animationDuration={900}
        className={className}
      />
    </motion.div>
  );
}
