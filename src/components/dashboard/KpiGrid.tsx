import { useQuery } from "@tanstack/react-query";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Home,
  KeyRound,
  Users2,
  UserSquare2,
  FileText,
  TrendingUp,
  TrendingDown,
  Coins,
  Wrench,
  LifeBuoy,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Download,
  FileDown,
} from "lucide-react";
import { getDashboardMetrics, type DashboardMetrics } from "@/lib/dashboard-metrics.functions";
import { getMetricBreakdown, type MetricKey } from "@/lib/metric-breakdown.functions";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import type { MetricBreakdown } from "@/lib/metric-breakdown.functions";

function downloadBlob(filename: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportBreakdownCsv(
  bd: MetricBreakdown,
  metricLabel: string,
  isAr: boolean,
  fmt: (n: number) => string,
) {
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const rows: string[][] = [];
  rows.push([L("المؤشر", "Metric"), metricLabel]);
  rows.push([L("الشهر المرجعي", "Reference month"), bd.end_month]);
  rows.push([L("شهر المقارنة", "Compared month"), bd.previous_month]);
  rows.push([
    L("طريقة المقارنة", "Comparison"),
    bd.compare === "yoy" ? L("قبل سنة", "Year ago") : L("الشهر السابق", "Previous month"),
  ]);
  rows.push([L("القيمة الحالية", "Current"), String(bd.current)]);
  rows.push([L("القيمة السابقة", "Previous"), String(bd.previous)]);
  rows.push([L("الفرق", "Delta"), String(bd.delta_abs)]);
  rows.push([L("النسبة", "Delta %"), bd.delta_pct === null ? "-" : `${bd.delta_pct.toFixed(2)}%`]);
  rows.push([]);
  rows.push([L("الشهر", "Month"), L("القيمة", "Value")]);
  for (const s of bd.series) rows.push([s.month, String(s.value)]);
  if (bd.extra) {
    rows.push([]);
    rows.push([L("تفاصيل إضافية", "Extra")]);
    for (const [k, v] of Object.entries(bd.extra)) rows.push([k, String(v)]);
  }
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  // BOM for Excel Arabic support
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(`${metricLabel}-${bd.end_month}.csv`, blob);
}

async function exportBreakdownPdf(
  bd: MetricBreakdown,
  metricLabel: string,
  isAr: boolean,
  fmt: (n: number) => string,
  summary: { curr: number; prev: number; pct: number | null; invert: boolean },
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const pageW = doc.internal.pageSize.getWidth();
  let y = 48;

  // jsPDF has no Arabic support out of the box → boxes render for AR text.
  // Embed Noto Naskh Arabic + shape strings when the report is Arabic.
  const FONT = isAr ? "NotoNaskhArabic" : "helvetica";
  let sh = (s: string) => s;
  if (isAr) {
    const [{ registerArabicFont }, reshaper, bidiFactory] = await Promise.all([
      import("@/lib/pdf-arabic"),
      // @ts-ignore
      import("arabic-reshaper"),
      // @ts-ignore
      import("bidi-js"),
    ]);
    await registerArabicFont(doc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bidi = (bidiFactory as any).default();
    sh = (text: string) => {
      if (!/[\u0600-\u06FF]/.test(text)) return text;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reshaped = (reshaper as any).default.convertArabic(text);
      const levels = bidi.getEmbeddingLevels(reshaped, "rtl");
      return bidi.getReorderedString(reshaped, levels);
    };
    doc.setR2L(true);
  }

  doc.setFont(FONT, "bold");
  doc.setFontSize(16);
  doc.text(sh(metricLabel), 40, y);
  y += 20;
  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    sh(
      `${L("مرجع", "Reference")}: ${bd.end_month}   ${L("مقارنة", "Compare")}: ${bd.previous_month} (${bd.compare === "yoy" ? "YoY" : "MoM"})`,
    ),
    40,
    y,
  );
  y += 22;

  // Summary boxes
  doc.setTextColor(20);
  const boxes: Array<[string, string]> = [
    [L("السابق", "Previous"), fmt(summary.prev)],
    [L("الحالي", "Current"), fmt(summary.curr)],
    [
      L("التغيّر", "Change"),
      summary.pct === null ? "—" : `${summary.pct >= 0 ? "+" : ""}${summary.pct.toFixed(1)}%`,
    ],
  ];
  const bw = (pageW - 80 - 20) / 3;
  boxes.forEach(([label, val], i) => {
    const x = 40 + i * (bw + 10);
    doc.setDrawColor(220);
    doc.roundedRect(x, y, bw, 56, 6, 6);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(sh(label), x + 10, y + 18);
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.setFont(FONT, "bold");
    doc.text(sh(val), x + 10, y + 40);
    doc.setFont(FONT, "normal");
  });
  y += 76;

  // Bar chart (last N months)
  doc.setFontSize(11);
  doc.setFont(FONT, "bold");
  doc.text(sh(L("آخر الأشهر", "Recent months")), 40, y);
  y += 10;
  const chartX = 40;
  const chartY = y + 6;
  const chartW = pageW - 80;
  const chartH = 140;
  doc.setDrawColor(230);
  doc.rect(chartX, chartY, chartW, chartH);
  const max = Math.max(1, ...bd.series.map((s) => s.value));
  const barGap = 6;
  const barW = (chartW - barGap * (bd.series.length + 1)) / bd.series.length;
  bd.series.forEach((s, i) => {
    const h = Math.max(2, (s.value / max) * (chartH - 20));
    const x = chartX + barGap + i * (barW + barGap);
    const isLast = i === bd.series.length - 1;
    if (isLast) doc.setFillColor(15, 118, 110);
    else doc.setFillColor(203, 213, 225);
    doc.rect(x, chartY + chartH - h, barW, h, "F");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(sh(s.label), x + barW / 2, chartY + chartH + 12, { align: "center" });
  });
  y = chartY + chartH + 30;

  // Table
  doc.setFont(FONT, "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(sh(L("جدول التفصيل", "Breakdown table")), 40, y);
  y += 12;
  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  const colX = [40, pageW - 40];
  doc.setDrawColor(230);
  doc.line(40, y + 4, pageW - 40, y + 4);
  y += 18;
  doc.setTextColor(110);
  doc.text(sh(L("الشهر", "Month")), colX[0], y);
  doc.text(sh(L("القيمة", "Value")), colX[1], y, { align: "right" });
  y += 6;
  doc.line(40, y, pageW - 40, y);
  doc.setTextColor(20);
  bd.series.forEach((s) => {
    y += 16;
    doc.text(sh(s.label + "  " + s.month), colX[0], y);
    doc.text(sh(fmt(s.value)), colX[1], y, { align: "right" });
  });

  if (bd.extra && Object.keys(bd.extra).length) {
    y += 24;
    doc.setFont(FONT, "bold");
    doc.text(sh(L("تفاصيل إضافية", "Additional details")), 40, y);
    doc.setFont(FONT, "normal");
    y += 6;
    doc.line(40, y, pageW - 40, y);
    for (const [k, v] of Object.entries(bd.extra)) {
      y += 16;
      doc.text(sh(k), colX[0], y);
      doc.text(sh(fmt(Number(v))), colX[1], y, { align: "right" });
    }
  }

  doc.save(`${metricLabel}-${bd.end_month}.pdf`);
}

type Tone = "primary" | "sky" | "emerald" | "amber" | "rose" | "violet";

const toneRing: Record<Tone, string> = {
  primary: "ring-primary/25 hover:shadow-[0_0_50px_-10px_hsl(var(--primary)/0.55)]",
  sky: "ring-info/20 hover:shadow-[0_0_40px_-8px_rgb(14_165_233/0.4)]",
  emerald: "ring-success/20 hover:shadow-[0_0_40px_-8px_rgb(16_185_129/0.4)]",
  amber: "ring-warning/20 hover:shadow-[0_0_40px_-8px_rgb(245_158_11/0.4)]",
  rose: "ring-destructive/20 hover:shadow-[0_0_40px_-8px_rgb(244_63_94/0.4)]",
  violet: "ring-primary/20 hover:shadow-[0_0_40px_-8px_rgb(139_92_246/0.4)]",
};

const toneIcon: Record<Tone, string> = {
  // All hero icons use the signature gold gradient to match the reference.
  primary:
    "bg-[image:var(--gradient-brand)] text-primary-foreground shadow-[0_6px_20px_-8px_hsl(var(--primary)/0.6)]",
  sky: "bg-info/10 text-info dark:text-info",
  emerald: "bg-success/10 text-success dark:text-success",
  amber: "bg-warning/10 text-warning dark:text-warning",
  rose: "bg-destructive/10 text-destructive dark:text-destructive",
  violet: "bg-primary/10 text-primary dark:text-primary",
};

function Counter({ value, format }: { value: number; format?: (n: number) => string }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => (format ? format(v) : Math.round(v).toLocaleString()));
  const prevRef = useRef(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.1, ease: "easeOut" });
    if (prevRef.current !== value) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 700);
      prevRef.current = value;
      return () => {
        controls.stop();
        window.clearTimeout(t);
      };
    }
    return controls.stop;
  }, [mv, value]);
  return (
    <motion.span
      animate={flash ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "inline-block transition-colors duration-500",
        flash && "text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.35)]",
      )}
    >
      {display}
    </motion.span>
  );
}

function KpiSkeleton({ size = "compact" }: { size?: "hero" | "compact" }) {
  const isHero = size === "hero";
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card/70 backdrop-blur-xl ring-1 ring-border/40",
        isHero ? "p-5" : "p-4",
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("rounded-2xl bg-muted/70", isHero ? "size-12" : "size-10")} />
        <div className="h-5 w-10 rounded-full bg-muted/70" />
      </div>
      <div className={cn("mt-4 h-3 w-3/4 rounded bg-muted/70", isHero && "h-3.5")} />
      <div className={cn("mt-3 rounded bg-muted/80", isHero ? "h-8 w-2/3" : "h-7 w-1/2")} />
      {isHero ? <div className="mt-3 h-4 w-24 rounded-full bg-muted/60" /> : null}
      {/* Shimmer sweep */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
      <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
    </motion.div>
  );
}

function BreakdownSkeleton({ isAr }: { isAr: boolean }) {
  const bars = Array.from({ length: 6 });
  const rows = Array.from({ length: 3 });
  return (
    <div aria-busy="true" aria-label={isAr ? "جاري تحميل التفصيل" : "Loading breakdown"}>
      {/* Bars */}
      <div className="relative flex h-24 items-end gap-1.5 overflow-hidden rounded-md">
        {bars.map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.4, scaleY: 0.6 }}
            animate={{ opacity: [0.4, 0.9, 0.4], scaleY: [0.6, 1, 0.6] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
            style={{ height: `${30 + ((i * 13) % 60)}%`, transformOrigin: "bottom" }}
            className="flex-1 rounded-md bg-muted/70"
          />
        ))}
        <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
      </div>
      <div className="mt-2 flex gap-1.5">
        {bars.map((_, i) => (
          <div key={i} className="h-2 flex-1 rounded bg-muted/60" />
        ))}
      </div>
      {/* Rows */}
      <div className="mt-3 space-y-1.5">
        {rows.map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            className="flex items-center justify-between rounded-md border bg-card/60 px-2.5 py-1.5"
          >
            <div className="h-3 w-16 rounded bg-muted/70" />
            <div className="flex items-center gap-2">
              <div className="h-3 w-12 rounded bg-muted/70" />
              <div className="h-4 w-10 rounded-full bg-muted/70" />
            </div>
          </motion.div>
        ))}
      </div>
      <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
    </div>
  );
}

/** Month-over-month delta as a percentage. Returns null when prev is 0 and
 *  curr is 0 (no signal), or Infinity-safe values otherwise. */
function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return 100; // grew from nothing
  return ((curr - prev) / prev) * 100;
}

function DeltaChip({
  pct,
  isAr,
  invert,
  curr,
  prev,
  metricLabel,
  format,
  metricKey,
  orgId,
}: {
  pct: number | null;
  isAr: boolean;
  invert?: boolean; // for "expenses" style KPIs where down = good
  curr: number;
  prev: number;
  metricLabel: string;
  format?: (n: number) => string;
  metricKey?: MetricKey;
  orgId?: string;
}) {
  const label = isAr ? "عن الشهر الماضي" : "vs last month";
  const [open, setOpen] = useState(false);
  // Build last 12 months as options for the anchor selector.
  const monthOptions = (() => {
    const out: Array<{ key: string; label: string }> = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString(isAr ? "ar-SA" : "en-US", { month: "long", year: "numeric" });
      out.push({ key, label });
    }
    return out;
  })();
  const [endMonth, setEndMonth] = useState<string>(monthOptions[0].key);
  const [compare, setCompare] = useState<"prev_month" | "yoy">("prev_month");
  const bdQ = useQuery({
    enabled: open && !!metricKey && !!orgId,
    queryKey: ["metric-breakdown", orgId, metricKey, endMonth, compare],
    queryFn: () =>
      getMetricBreakdown({
        data: { org_id: orgId!, metric: metricKey!, end_month: endMonth, compare },
      }),
    staleTime: 60_000,
  });
  const fmt = (n: number) =>
    format ? format(n) : Math.round(n).toLocaleString(isAr ? "ar-SA" : "en-US");
  // When the dialog has fresh server data, prefer it (respects month + compare mode);
  // otherwise fall back to the chip's card-level snapshot.
  const effCurr = bdQ.data?.current ?? curr;
  const effPrev = bdQ.data?.previous ?? prev;
  const effPct = bdQ.data?.delta_pct !== undefined ? bdQ.data.delta_pct : pct;
  const diff = effCurr - effPrev;
  const tipText =
    pct === null
      ? isAr
        ? "لا توجد بيانات كافية للمقارنة مع الشهر الماضي"
        : "Not enough data to compare with last month"
      : isAr
        ? `الحالي: ${fmt(curr)} • السابق: ${fmt(prev)} • الفرق: ${diff >= 0 ? "+" : ""}${fmt(diff)}`
        : `Current: ${fmt(curr)} • Previous: ${fmt(prev)} • Change: ${diff >= 0 ? "+" : ""}${fmt(diff)}`;

  if (pct === null) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Minus className="size-3.5" />
              <span className="tabular-nums">0%</span>
              <span className="opacity-80">{label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{tipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const up = (effPct ?? 0) >= 0;
  const good = invert ? !up : up;
  const chipPct = pct ?? 0;
  const chipUp = chipPct >= 0;
  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 flex items-center gap-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full"
              aria-label={isAr ? "تفاصيل التغيّر" : "Change details"}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums transition-transform hover:scale-105",
                  (invert ? !chipUp : chipUp)
                    ? "bg-success/10 text-success dark:text-success"
                    : "bg-destructive/10 text-destructive dark:text-destructive",
                )}
              >
                {chipUp ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {chipUp ? "+" : ""}
                {chipPct.toFixed(1)}%
              </span>
              <span className="text-muted-foreground">{label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{tipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{metricLabel}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "اختر الشهر المرجعي وطريقة المقارنة (الشهر السابق أو نفس الشهر قبل سنة)."
                : "Pick the reference month and comparison mode (previous month or same month last year)."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select value={endMonth} onValueChange={setEndMonth}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.key} value={m.key} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              value={compare}
              onValueChange={(v) => v && setCompare(v as "prev_month" | "yoy")}
              className="h-8"
            >
              <ToggleGroupItem value="prev_month" className="h-8 px-2 text-[11px]">
                {isAr ? "الشهر السابق" : "Prev month"}
              </ToggleGroupItem>
              <ToggleGroupItem value="yoy" className="h-8 px-2 text-[11px]">
                {isAr ? "قبل سنة" : "Year ago"}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border bg-card p-3">
              <div className="text-[11px] text-muted-foreground">
                {compare === "yoy"
                  ? isAr
                    ? "نفس الشهر قبل سنة"
                    : "Same month last year"
                  : isAr
                    ? "الشهر السابق"
                    : "Previous month"}
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums">{fmt(effPrev)}</div>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <div className="text-[11px] text-muted-foreground">
                {isAr ? "المرجعي" : "Reference"}
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-primary">{fmt(effCurr)}</div>
            </div>
            <div
              className={cn(
                "rounded-xl border p-3",
                good
                  ? "bg-success/5 border-success/20"
                  : "bg-destructive/5 border-destructive/20",
              )}
            >
              <div className="text-[11px] text-muted-foreground">{isAr ? "التغيّر" : "Change"}</div>
              <div
                className={cn(
                  "mt-1 text-lg font-bold tabular-nums",
                  good
                    ? "text-success dark:text-success"
                    : "text-destructive dark:text-destructive",
                )}
              >
                {effPct === null ? "—" : `${up ? "+" : ""}${effPct.toFixed(1)}%`}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
            {isAr
              ? `الفرق المطلق: ${diff >= 0 ? "+" : ""}${fmt(diff)}. تُستخرج قيمة الشهر السابق من تسجيلات القاعدة عند نهاية الشهر الماضي، وتُقارَن بالقيمة الحالية اللحظية.`
              : `Absolute change: ${diff >= 0 ? "+" : ""}${fmt(diff)}. Previous value is taken from the database snapshot at the end of last month, compared to the current live value.`}
          </div>
          {metricKey ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold">{isAr ? "آخر 6 أشهر" : "Last 6 months"}</div>
                {bdQ.isFetching ? (
                  <span className="text-[10px] text-muted-foreground">
                    {isAr ? "جاري التحميل..." : "Loading..."}
                  </span>
                ) : null}
              </div>
              {bdQ.data ? (
                (() => {
                  const series = bdQ.data.series;
                  const max = Math.max(1, ...series.map((s) => s.value));
                  const cmpMonth = bdQ.data.previous_month;
                  const cmpInWindow = series.some((s) => s.month === cmpMonth);
                  return (
                    <>
                      {!cmpInWindow ? (
                        <div className="mb-2 rounded-md border border-dashed border-primary/30 bg-primary/5 px-2 py-1 text-[10px] text-muted-foreground">
                          {isAr
                            ? `شهر المقارنة (${cmpMonth}) خارج نافذة العرض`
                            : `Compared month (${cmpMonth}) is outside the visible window`}
                        </div>
                      ) : null}
                      <motion.div
                        key={`chart-${bdQ.data.end_month}-${bdQ.data.compare}`}
                        className="flex h-24 items-end gap-1.5"
                        initial="hidden"
                        animate="show"
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
                      >
                        {series.map((s, i) => {
                          const h = Math.max(4, Math.round((s.value / max) * 100));
                          const isLast = i === series.length - 1;
                          const isCmp = s.month === cmpMonth;
                          return (
                            <motion.div
                              key={s.month}
                              variants={{
                                hidden: { opacity: 0, y: 6 },
                                show: { opacity: 1, y: 0 },
                              }}
                              className="flex flex-1 flex-col items-center gap-1"
                            >
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${h}%` }}
                                transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.04 }}
                                className={cn(
                                  "w-full rounded-md transition-colors hover:opacity-90",
                                  isLast
                                    ? "bg-primary"
                                    : isCmp
                                      ? "bg-primary/50 ring-2 ring-primary/40"
                                      : "bg-muted",
                                )}
                                title={`${s.label}: ${fmt(s.value)}`}
                              />
                              <div
                                className={cn(
                                  "text-[9px] tabular-nums",
                                  isLast || isCmp
                                    ? "font-semibold text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {s.label}
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                      <motion.div
                        key={`rows-${bdQ.data.end_month}-${bdQ.data.compare}`}
                        className="mt-3 space-y-1.5"
                        initial="hidden"
                        animate="show"
                        variants={{
                          hidden: {},
                          show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
                        }}
                      >
                        {series
                          .slice(-3)
                          .reverse()
                          .map((s, i, arr) => {
                            const idxInFull = series.length - 1 - i;
                            const prevVal = series[idxInFull - 1]?.value ?? 0;
                            const d = s.value - prevVal;
                            const upP = d >= 0;
                            const gd = invert ? !upP : upP;
                            return (
                              <motion.div
                                key={s.month}
                                variants={{
                                  hidden: { opacity: 0, x: isAr ? -8 : 8 },
                                  show: { opacity: 1, x: 0 },
                                }}
                                whileHover={{ scale: 1.01 }}
                                className="flex items-center justify-between rounded-md border bg-card/60 px-2.5 py-1.5 text-xs transition-colors hover:border-primary/30 hover:bg-card"
                              >
                                <span className="font-medium">{s.label}</span>
                                <span className="flex items-center gap-2 tabular-nums">
                                  <span>{fmt(s.value)}</span>
                                  {i < arr.length - 1 || idxInFull > 0 ? (
                                    <span
                                      className={cn(
                                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                        gd
                                          ? "bg-success/10 text-success dark:text-success"
                                          : "bg-destructive/10 text-destructive dark:text-destructive",
                                      )}
                                    >
                                      {d >= 0 ? "+" : ""}
                                      {fmt(d)}
                                    </span>
                                  ) : null}
                                </span>
                              </motion.div>
                            );
                          })}
                      </motion.div>
                      {bdQ.data.extra && metricKey === "revenue" ? (
                        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-[11px]">
                          <div className="mb-1 font-semibold">
                            {isAr ? "تحليل الشهر السابق" : "Previous month breakdown"}
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {isAr ? "مفوتر:" : "Invoiced:"}
                            </span>
                            <span className="tabular-nums">
                              {fmt(bdQ.data.extra.invoiced_prev ?? 0)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {isAr ? "مُحصَّل:" : "Collected:"}
                            </span>
                            <span className="tabular-nums text-success dark:text-success">
                              {fmt(bdQ.data.extra.paid_prev ?? 0)}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between border-t pt-1">
                            <span className="text-muted-foreground">
                              {isAr ? "غير مُحصَّل:" : "Uncollected:"}
                            </span>
                            <span className="tabular-nums text-destructive dark:text-destructive">
                              {fmt(
                                (bdQ.data.extra.invoiced_prev ?? 0) -
                                  (bdQ.data.extra.paid_prev ?? 0),
                              )}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </>
                  );
                })()
              ) : (
                <BreakdownSkeleton isAr={isAr} />
              )}
            </div>
          ) : null}
          {bdQ.data ? (
            <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => exportBreakdownCsv(bdQ.data!, metricLabel, isAr, fmt)}
              >
                <Download className="size-3.5" />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() =>
                  exportBreakdownPdf(bdQ.data!, metricLabel, isAr, fmt, {
                    curr: effCurr,
                    prev: effPrev,
                    pct: effPct,
                    invert: !!invert,
                  })
                }
              >
                <FileDown className="size-3.5" />
                PDF
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
  suffix,
  loading,
  format,
  deltaPctValue,
  prevValue,
  invertDelta,
  isAr,
  size = "compact",
  metricKey,
  orgId,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: Tone;
  suffix?: string;
  loading?: boolean;
  format?: (n: number) => string;
  deltaPctValue?: number | null;
  prevValue?: number;
  invertDelta?: boolean;
  isAr?: boolean;
  size?: "hero" | "compact";
  metricKey?: MetricKey;
  orgId?: string;
}) {
  const isHero = size === "hero";
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={cn(
        "group relative cursor-pointer overflow-hidden rounded-2xl border bg-card/70 backdrop-blur-xl ring-1 transition-shadow duration-300",
        isHero ? "p-5" : "p-4",
        toneRing[tone],
      )}
    >
      {/* Gold sheen sweep on hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/15 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "grid shrink-0 place-items-center rounded-2xl",
            isHero ? "size-12" : "size-10",
            toneIcon[tone],
          )}
        >
          {icon}
        </div>
        {suffix ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/20">
            {suffix}
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "text-sm text-muted-foreground",
          isHero ? "mt-4 line-clamp-2 min-h-[2.5rem] leading-tight" : "truncate mt-3",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-black tracking-tight tabular-nums",
          isHero ? "text-3xl text-primary" : "text-2xl",
        )}
      >
        {loading ? (
          <span className="inline-block h-7 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <Counter value={value} format={format} />
        )}
      </div>
      {isHero && deltaPctValue !== undefined && !loading ? (
        <DeltaChip
          pct={deltaPctValue}
          isAr={!!isAr}
          invert={invertDelta}
          curr={value}
          prev={prevValue ?? 0}
          metricLabel={label}
          format={format}
          metricKey={metricKey}
          orgId={orgId}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div className="absolute -inset-x-6 -top-10 h-24 rotate-[8deg] bg-gradient-to-r from-transparent via-primary/10 to-transparent blur-2xl" />
      </div>
    </motion.div>
  );
}

export function KpiGrid({ orgId, isAr }: { orgId: string | undefined; isAr: boolean }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["dashboard-metrics", orgId],
    queryFn: () => getDashboardMetrics({ data: { org_id: orgId! } }),
    staleTime: 60_000,
  });
  const m: DashboardMetrics = q.data ?? {
    properties: 0,
    units_total: 0,
    units_occupied: 0,
    units_vacant: 0,
    owners: 0,
    tenants: 0,
    contracts_active: 0,
    revenue_month: 0,
    expenses_month: 0,
    profit_month: 0,
    maintenance_open: 0,
    support_open: 0,
    ai_score: 0,
    occupancy_pct: 0,
    collection_pct: 0,
    properties_prev: 0,
    units_occupied_prev: 0,
    units_vacant_prev: 0,
    owners_prev: 0,
    tenants_prev: 0,
    revenue_prev: 0,
  };
  const loading = q.isLoading || !orgId;

  const sar = (n: number) =>
    `${Math.round(n).toLocaleString(isAr ? "ar-SA" : "en-US")} ${isAr ? "ر.س" : "SAR"}`;
  const compact = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return Math.round(n).toLocaleString(isAr ? "ar-SA" : "en-US");
  };

  // 6 hero KPIs — match the reference screenshot exactly. Each shows a
  // gold-gradient icon, large gold value, and a green/red delta chip vs the
  // previous month.
  const hero: Array<React.ComponentProps<typeof KpiCard>> = [
    {
      icon: <Building2 className="size-6" />,
      label: isAr ? "إجمالي العقارات" : "Total Properties",
      value: m.properties,
      metricKey: "properties",
      tone: "primary",
      deltaPctValue: deltaPct(m.properties, m.properties_prev),
      prevValue: m.properties_prev,
      size: "hero",
    },
    {
      icon: <Home className="size-6" />,
      label: isAr ? "الوحدات المؤجّرة" : "Occupied Units",
      value: m.units_occupied,
      metricKey: "units_occupied",
      tone: "primary",
      suffix: `${m.occupancy_pct}%`,
      deltaPctValue: deltaPct(m.units_occupied, m.units_occupied_prev),
      prevValue: m.units_occupied_prev,
      size: "hero",
    },
    {
      icon: <KeyRound className="size-6" />,
      label: isAr ? "الوحدات الشاغرة" : "Vacant Units",
      value: m.units_vacant,
      metricKey: "units_vacant",
      tone: "primary",
      deltaPctValue: deltaPct(m.units_vacant, m.units_vacant_prev),
      prevValue: m.units_vacant_prev,
      invertDelta: true, // fewer vacancies = good
      size: "hero",
    },
    {
      icon: <UserSquare2 className="size-6" />,
      label: isAr ? "إجمالي الملاك" : "Total Owners",
      value: m.owners,
      metricKey: "owners",
      tone: "primary",
      deltaPctValue: deltaPct(m.owners, m.owners_prev),
      prevValue: m.owners_prev,
      size: "hero",
    },
    {
      icon: <Users2 className="size-6" />,
      label: isAr ? "إجمالي المستأجرين" : "Total Tenants",
      value: m.tenants,
      metricKey: "tenants",
      tone: "primary",
      deltaPctValue: deltaPct(m.tenants, m.tenants_prev),
      prevValue: m.tenants_prev,
      size: "hero",
    },
    {
      icon: <Coins className="size-6" />,
      label: isAr ? "إجمالي الإيرادات" : "Total Revenue",
      value: m.revenue_month,
      metricKey: "revenue",
      tone: "primary",
      format: compact,
      deltaPctValue: deltaPct(m.revenue_month, m.revenue_prev),
      prevValue: m.revenue_prev,
      size: "hero",
    },
  ];

  // Secondary compact KPIs — kept for detail beyond the reference row.
  const secondary: Array<React.ComponentProps<typeof KpiCard>> = [
    {
      icon: <TrendingDown className="size-5" />,
      label: isAr ? "المصروفات (الشهر)" : "Expenses (MTD)",
      value: m.expenses_month,
      tone: "rose",
      format: sar,
    },
    {
      icon: <TrendingUp className="size-5" />,
      label: isAr ? "صافي الربح" : "Profit (MTD)",
      value: m.profit_month,
      tone: m.profit_month >= 0 ? "emerald" : "rose",
      format: sar,
    },
    {
      icon: <Wrench className="size-5" />,
      label: isAr ? "طلبات الصيانة" : "Maintenance",
      value: m.maintenance_open,
      tone: "amber",
    },
    {
      icon: <LifeBuoy className="size-5" />,
      label: isAr ? "تذاكر الدعم" : "Support Tickets",
      value: m.support_open,
      tone: "sky",
    },
    {
      icon: <FileText className="size-5" />,
      label: isAr ? "العقود النشطة" : "Active Contracts",
      value: m.contracts_active,
      tone: "violet",
    },
    {
      icon: <Sparkles className="size-5" />,
      label: isAr ? "مؤشر الذكاء" : "AI Score",
      value: m.ai_score,
      tone: "primary",
      suffix: "/100",
    },
  ];

  return (
    <div className="mt-6 space-y-4">
      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      >
        {hero.map((p, i) =>
          loading ? (
            <KpiSkeleton key={`hero-sk-${i}`} size="hero" />
          ) : (
            <KpiCard key={`hero-${i}`} {...p} isAr={isAr} loading={loading} orgId={orgId} />
          ),
        )}
      </motion.div>
      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.03, delayChildren: 0.2 } },
        }}
      >
        {secondary.map((p, i) =>
          loading ? (
            <KpiSkeleton key={`sec-sk-${i}`} />
          ) : (
            <KpiCard key={`sec-${i}`} {...p} loading={loading} />
          ),
        )}
      </motion.div>
    </div>
  );
}
