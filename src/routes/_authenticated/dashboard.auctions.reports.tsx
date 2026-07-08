import { createFileRoute, Link, useRouter, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { getAuctionsAnalytics } from "@/lib/auctions.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  BarChart3,
  Copy,
  Eraser,
  FileDown,
  FileText,
  Gavel,
  Loader2,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  Customized,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartTooltip,
  fmtDateAr,
  fmtCount,
  fmtMoney,
  fmtPercent,
  fmtAuto,
} from "@/components/reports/ChartTooltip";
import { EdgeHandles, type EdgeHandlesInjected } from "@/components/reports/EdgeHandles";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { ActiveFiltersBar, type ActiveFilterChip } from "@/components/reports/ActiveFiltersBar";
import { usePersistedFilters } from "@/lib/reports/use-persisted-filters";
import { trackFilterApply } from "@/lib/analytics";
import { useIsMobile } from "@/hooks/use-mobile";

import { sectionHead } from "@/lib/section-og-head";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z.string().regex(ISO_DATE);

const reportsSearchSchema = z.object({
  from: fallback(isoDate.optional(), undefined).optional(),
  to: fallback(isoDate.optional(), undefined).optional(),
  status: fallback(z.string(), "").default(""),
  bidderId: fallback(z.string(), "").default(""),
  metric: fallback(z.enum(["max_amount", "total_amount"]), "max_amount").default("max_amount"),
});

export const Route = createFileRoute("/_authenticated/dashboard/auctions/reports")({
  validateSearch: zodValidator(reportsSearchSchema),
  head: () => sectionHead({ section: "dashboard", entityAr: "تقارير المزادات", entityEn: "Auctions Reports", path: "/dashboard/auctions/reports" }),
  component: AuctionsReportsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          {i18n.t("auctions.common.retry")}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{i18n.t("auctions.common.notFound")}</div>,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  scheduled: "مجدول",
  live: "جارٍ",
  ended: "منتهي",
  finalized: "مُحسم",
  cancelled: "ملغى",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "#94a3b8",
  scheduled: "#3b82f6",
  live: "#10b981",
  ended: "#f59e0b",
  finalized: "#22c55e",
  cancelled: "#ef4444",
};

function ResultsSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">{t("auctions.common.loadingResults")}</span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    </div>
  );
}

function AuctionsReportsPage() {
  const { t } = useTranslation();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org as { id: string; name: string } | undefined;

  const todayISO = new Date().toISOString().slice(0, 10);
  const monthAgoISO = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  // URL is the source of truth. Missing from/to fall back to the default
  // last-30-days window; edits are pushed back via navigate({ search }).
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  type ReportsSearch = typeof search;
  const from = search.from ?? monthAgoISO;
  const to = search.to ?? todayISO;
  const status = search.status ?? "";
  const bidderId = search.bidderId ?? "";
  const trendMetric: "max_amount" | "total_amount" = search.metric ?? "max_amount";
  const setFrom = (v: string) => {
    trackFilterApply("from", search.from ?? "", v);
    navigate({
      search: (prev: ReportsSearch) => ({ ...prev, from: v || undefined }),
      replace: true,
    });
  };
  const setTo = (v: string) => {
    trackFilterApply("to", search.to ?? "", v);
    navigate({ search: (prev: ReportsSearch) => ({ ...prev, to: v || undefined }), replace: true });
  };
  const setStatus = (v: string) => {
    trackFilterApply("status", search.status ?? "", v);
    navigate({
      search: (prev: ReportsSearch) => ({ ...prev, status: v || undefined }),
      replace: true,
    });
  };
  const setBidderId = (v: string) => {
    trackFilterApply("bidder", search.bidderId ?? "", v);
    navigate({
      search: (prev: ReportsSearch) => ({ ...prev, bidderId: v || undefined }),
      replace: true,
    });
  };
  const setTrendMetric = (v: "max_amount" | "total_amount") => {
    trackFilterApply("metric", trendMetric, v);
    navigate({
      search: (prev: ReportsSearch) => ({ ...prev, metric: v === "max_amount" ? undefined : v }),
      replace: true,
    });
  };

  // Persistence spans TWO sessionStorage keys, restored in sync on back/forward:
  //   • DATE_DRAFT_KEY (owned by DateRangeFilter) — unapplied from/to draft.
  //   • EXTRAS_KEY    (this hook)               — status / bidderId / trendMetric.
  // Keeping them separate lets DateRangeFilter own its draft lifecycle (Apply/
  // Reset clears its own entry) while sibling filters follow the same all-empty
  // restore gate as any other page using usePersistedFilters.
  const DATE_DRAFT_KEY = "reports:auctions:date-range-draft";
  const EXTRAS_KEY = "reports:auctions:extra-filters-draft";
  const trendMetricExtra = trendMetric === "max_amount" ? "" : trendMetric;
  usePersistedFilters(EXTRAS_KEY, { status, bidderId, trendMetric: trendMetricExtra }, (stored) => {
    if (stored.trendMetric === "total_amount") setTrendMetric("total_amount");
    navigate({
      search: (prev: ReportsSearch) => ({
        ...prev,
        status: stored.status || prev.status,
        bidderId: stored.bidderId || prev.bidderId,
      }),
      replace: true,
    });
  });

  const clearPersistedFilters = () => {
    setStatus("");
    setBidderId("");
    setTrendMetric("max_amount");
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(EXTRAS_KEY);
        window.sessionStorage.removeItem(DATE_DRAFT_KEY);
      } catch {
        /* noop */
      }
    }
    toast.success("تم مسح الفلاتر المحفوظة");
    setLiveText("تم مسح الفلاتر المحفوظة");
  };

  const hasPersistedExtras = !!status || !!bidderId || trendMetric !== "max_amount";

  // Chips reflect every filter that differs from its default. Removing a chip
  // resets that single filter (URL is source of truth, sessionStorage draft
  // stays in sync via setters).
  const activeChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (from !== monthAgoISO || to !== todayISO) {
      chips.push({
        key: "date",
        label: "التاريخ",
        value: `${from} → ${to}`,
        onRemove: () => {
          setFrom(monthAgoISO);
          setTo(todayISO);
          setRangeAnchor(null);
          setLiveText("تمت إزالة فلتر التاريخ — يُعاد تحميل النتائج");
          toast.success("تمت إزالة فلتر التاريخ");
        },
      });
    }
    if (status) {
      chips.push({
        key: "status",
        label: "الحالة",
        value: STATUS_LABEL[status] ?? status,
        onRemove: () => {
          setStatus("");
          setLiveText("تمت إزالة فلتر الحالة — يُعاد تحميل النتائج");
          toast.success("تمت إزالة فلتر الحالة");
        },
      });
    }
    if (bidderId) {
      chips.push({
        key: "bidder",
        label: "المزايد",
        value: `${bidderId.slice(0, 8)}…`,
        onRemove: () => {
          setBidderId("");
          setLiveText("تمت إزالة فلتر المزايد — يُعاد تحميل النتائج");
          toast.success("تمت إزالة فلتر المزايد");
        },
      });
    }
    if (trendMetric !== "max_amount") {
      chips.push({
        key: "metric",
        label: "المقياس",
        value: "إجمالي المبالغ",
        onRemove: () => {
          setTrendMetric("max_amount");
          setLiveText("تم إعادة المقياس إلى الافتراضي");
        },
      });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, status, bidderId, trendMetric, monthAgoISO, todayISO]);

  const clearAllActiveFilters = () => {
    setFrom(monthAgoISO);
    setTo(todayISO);
    setStatus("");
    setBidderId("");
    setTrendMetric("max_amount");
    setRangeAnchor(null);
    setLiveText("تم مسح جميع الفلاتر النشطة — يُعاد تحميل النتائج");
    toast.success("تم مسح جميع الفلاتر النشطة");
  };

  type Section = "totals" | "by_day" | "by_status" | "top_bidders";
  const SECTION_LABEL: Record<Section, string> = {
    totals: "المؤشرات الإجمالية",
    by_day: "التوزيع اليومي",
    by_status: "حسب الحالة",
    top_bidders: "أفضل المزايدين",
  };
  const [sections, setSections] = useState<Record<Section, boolean>>({
    totals: true,
    by_day: true,
    by_status: true,
    top_bidders: true,
  });
  const anySection = Object.values(sections).some(Boolean);
  const toggleSection = (k: Section) => setSections((s) => ({ ...s, [k]: !s[k] }));

  const fn = useServerFn(getAuctionsAnalytics);
  const q = useQuery({
    queryKey: ["auctions-analytics", org?.id, from, to, status, bidderId],
    queryFn: () =>
      fn({
        data: {
          orgId: org!.id,
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(to + "T23:59:59").toISOString() : null,
          status: status || null,
          bidderId: bidderId.trim() || null,
        },
      }),
    enabled: !!org?.id,
  });

  const data = q.data;

  const kpis = useMemo(
    () =>
      data
        ? [
            { label: "إجمالي المزادات", value: data.totals.total, icon: Gavel },
            { label: "جارٍ الآن", value: data.totals.live, icon: TrendingUp },
            { label: "إجمالي المزايدات", value: data.totals.total_bids, icon: BarChart3 },
            {
              label: "متوسط سعر الإحكام",
              value: data.totals.avg_final_price.toLocaleString("ar"),
              icon: FileText,
            },
            { label: "نسبة النجاح", value: `${data.totals.success_rate}%`, icon: TrendingUp },
          ]
        : [],
    [data],
  );

  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const [tzInfo, setTzInfo] = useState<string>("");
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hourFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date());
    const is12h = /[AP]M/i.test(hourFmt);
    setTzInfo(`${tz} · ${is12h ? "12" : "24"}h`);
  }, []);

  const [liveText, setLiveText] = useState("");

  // Data bounds — earliest day in the current dataset (if any) and today
  // (no future dates allowed). Fallback lower bound: 5 years ago.
  const fiveYearsAgoISO = useMemo(
    () => new Date(Date.now() - 5 * 365 * 86400_000).toISOString().slice(0, 10),
    [],
  );
  const dataMinISO = useMemo(() => {
    const days = data?.by_day?.map((d) => d.day).filter(Boolean) as string[] | undefined;
    if (days && days.length) return [...days].sort()[0];
    return fiveYearsAgoISO;
  }, [data, fiveYearsAgoISO]);
  const dataMaxISO = todayISO;

  type ChartClick = { activeLabel?: string | number } | null | undefined;
  const handleChartClick = (e: ChartClick) => {
    const day = e?.activeLabel != null ? String(e.activeLabel) : "";
    if (!day) return;
    if (!rangeAnchor) {
      setRangeAnchor(day);
      setFrom(day);
      setTo(day);
      toast.message(`نقطة البداية: ${day}`, { description: "انقر نقطة أخرى لتحديد نهاية النطاق" });
      return;
    }
    const [a, b] = [rangeAnchor, day].sort();
    setFrom(a);
    setTo(b);
    setRangeAnchor(null);
    toast.success(`تم تطبيق النطاق: ${a} → ${b}`);
  };
  const clearRange = () => {
    setRangeAnchor(null);
    setFrom(monthAgoISO);
    setTo(todayISO);
  };

  // Touch/pointer support: long-press = anchor, drag = range.
  const pressRef = useRef<{ day: string; t: number; moved: boolean } | null>(null);
  const longPressRef = useRef<number | null>(null);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);

  // Edge-handle drag: adjust from/to after a range is set.
  const editHandleRef = useRef<"from" | "to" | null>(null);
  const [dragRange, setDragRange] = useState<{ from: string; to: string } | null>(null);
  const editingEdge = dragRange !== null;
  const effFrom = dragRange?.from ?? from;
  const effTo = dragRange?.to ?? to;

  const cancelLongPress = () => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };
  const handleChartMouseDown = (e: ChartClick) => {
    if (editHandleRef.current) return; // edge drag takes precedence
    const day = e?.activeLabel != null ? String(e.activeLabel) : "";
    if (!day) return;
    pressRef.current = { day, t: Date.now(), moved: false };
    setDragStart(day);
    setDragEnd(day);
    cancelLongPress();
    longPressRef.current = window.setTimeout(() => {
      const p = pressRef.current;
      if (!p || p.moved) return;
      setRangeAnchor(p.day);
      setFrom(p.day);
      setTo(p.day);
      toast.message(`نقطة البداية: ${p.day}`, {
        description: "اسحب لتحديد نهاية النطاق",
      });
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate?.(25);
        } catch {
          /* ignore */
        }
      }
    }, 450);
  };
  const handleChartMouseMove = (e: ChartClick) => {
    if (editHandleRef.current) return;
    if (!pressRef.current) return;
    const day = e?.activeLabel != null ? String(e.activeLabel) : "";
    if (!day) return;
    if (day !== pressRef.current.day) {
      pressRef.current.moved = true;
      cancelLongPress();
      setDragEnd(day);
    }
  };
  const handleChartMouseUp = (e: ChartClick) => {
    if (editHandleRef.current) return;
    cancelLongPress();
    const p = pressRef.current;
    pressRef.current = null;
    if (!p) return;
    const end = e?.activeLabel != null ? String(e.activeLabel) : p.day;
    setDragStart(null);
    setDragEnd(null);
    if (p.moved && end !== p.day) {
      const [a, b] = [p.day, end].sort();
      setFrom(a);
      setTo(b);
      setRangeAnchor(null);
      toast.success(`تم تطبيق النطاق: ${a} → ${b}`);
      return;
    }
    // Simple tap/click: keep original two-tap anchor/range behavior.
    handleChartClick({ activeLabel: p.day });
  };
  const handleChartMouseLeave = () => {
    cancelLongPress();
    pressRef.current = null;
    setDragStart(null);
    setDragEnd(null);
  };

  function exportChartRows(fmt: "csv" | "xlsx") {
    if (!data || !data.by_day.length) {
      toast.error("لا توجد بيانات للتصدير");
      return;
    }
    const metricLabel = trendMetric === "max_amount" ? "أعلى سعر (ر.س)" : "إجمالي المبالغ (ر.س)";
    const rows = data.by_day.map((r) => ({
      التاريخ: r.day,
      [metricLabel]: trendMetric === "max_amount" ? r.max_amount : r.total_amount,
      "أعلى سعر (ر.س)": r.max_amount,
      "إجمالي المبالغ (ر.س)": r.total_amount,
      "عدد المزايدات": r.bids,
      "المزادات المفتوحة": r.count,
    }));
    const meta = [
      ["نطاق التاريخ", `${from} → ${to}`],
      ["الحالة", status || "الكل"],
      ["المزايد", bidderId || "الكل"],
      ["المقياس النشط", metricLabel],
    ];
    const base = `auctions-chart-${from}_${to}`;
    if (fmt === "xlsx") {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["الفلاتر", ""], ...meta]),
        "Filters",
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Chart");
      XLSX.writeFile(wb, `${base}.xlsx`);
    } else {
      const ws = XLSX.utils.json_to_sheet(rows);
      const csv = [...meta.map(([k, v]) => `# ${k}: ${v}`), "", XLSX.utils.sheet_to_csv(ws)].join(
        "\n",
      );
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${base}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    }
    toast.success(`تم تصدير بيانات المخطط (${fmt.toUpperCase()})`);
  }
  const trendPeak = useMemo(() => {
    if (!data) return 0;
    return data.by_day.reduce((m, r) => Math.max(m, r[trendMetric] ?? 0), 0);
  }, [data, trendMetric]);
  const fmtSAR = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}م`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}ك`
        : String(n);

  type TrendPoint = {
    day: string;
    count: number;
    bids: number;
    max_amount: number;
    total_amount: number;
  };

  const totalAuctions = data?.by_status.reduce((a, s) => a + (s.count ?? 0), 0) ?? 0;

  function exportXLSX() {
    if (!data) return;
    if (!anySection) {
      toast.error(i18n.t("auctions.toast.sectionRequired"));
      return;
    }
    const wb = XLSX.utils.book_new();
    if (sections.totals)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([data.totals]), "Totals");
    if (sections.by_day)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.by_day), "By Day");
    if (sections.by_status)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.by_status), "By Status");
    if (sections.top_bidders)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.top_bidders), "Top Bidders");
    XLSX.writeFile(wb, `auctions-report-${from}_${to}.xlsx`);
    toast.success(i18n.t("auctions.toast.xlsxExported"));
  }

  function exportCSV() {
    if (!data) return;
    if (!anySection) {
      toast.error(i18n.t("auctions.toast.sectionRequired"));
      return;
    }
    const parts: string[] = [];
    const dump = (title: string, rows: Record<string, unknown>[]) => {
      const ws = XLSX.utils.json_to_sheet(rows);
      parts.push(`# ${title}`);
      parts.push(XLSX.utils.sheet_to_csv(ws));
      parts.push("");
    };
    if (sections.totals) dump("Totals", [data.totals as unknown as Record<string, unknown>]);
    if (sections.by_day) dump("By Day", data.by_day as unknown as Record<string, unknown>[]);
    if (sections.by_status)
      dump("By Status", data.by_status as unknown as Record<string, unknown>[]);
    if (sections.top_bidders)
      dump("Top Bidders", data.top_bidders as unknown as Record<string, unknown>[]);
    // UTF-8 BOM so Excel opens Arabic headers correctly.
    const blob = new Blob(["\uFEFF" + parts.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auctions-report-${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(i18n.t("auctions.toast.csvExported"));
  }

  function exportPDF() {
    if (!data) return;
    if (!anySection) {
      toast.error(i18n.t("auctions.toast.sectionRequired"));
      return;
    }
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`Auctions Report  ${from}  -  ${to}`, 14, 16);
    if (sections.totals)
      autoTable(doc, {
        startY: 22,
        head: [["Metric", "Value"]],
        body: Object.entries(data.totals).map(([k, v]) => [k, String(v)]),
      });
    if (sections.by_day)
      autoTable(doc, {
        head: [["Day", "Auctions", "Bids"]],
        body: data.by_day.map((r) => [r.day, r.count, r.bids]),
      });
    if (sections.by_status)
      autoTable(doc, {
        head: [["Status", "Count"]],
        body: data.by_status.map((r) => [r.status, r.count]),
      });
    if (sections.top_bidders)
      autoTable(doc, {
        head: [["Bidder", "Bids", "Total Amount"]],
        body: data.top_bidders.map((r) => [r.bidder_id.slice(0, 8) + "…", r.bids, r.total_amount]),
      });
    doc.save(`auctions-report-${from}_${to}.pdf`);
    toast.success(i18n.t("auctions.toast.pdfExported"));
  }

  // ---- Edge-handle geometry (recharts <Customized />) ----
  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <BarChart3 className="size-6 text-primary" /> {t("auctions.reports.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auctions.reports.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" className="gap-2">
            <Link to="/dashboard/auctions">
              <ArrowLeft className="size-4" /> {t("auctions.common.backToList")}
            </Link>
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={!data}>
            <FileDown className="size-4" /> CSV
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportXLSX} disabled={!data}>
            <FileDown className="size-4" /> Excel
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportPDF} disabled={!data}>
            <FileText className="size-4" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("auctions.reports.exportSections")}</CardTitle>
          <CardDescription>{t("auctions.reports.exportSectionsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(SECTION_LABEL) as Section[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={sections[k]} onCheckedChange={() => toggleSection(k)} />
                {SECTION_LABEL[k]}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("auctions.reports.filters")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5 md:grid-cols-6">
            <DateRangeFilter
              from={from}
              to={to}
              minISO={dataMinISO}
              maxISO={dataMaxISO}
              isApplying={q.isFetching}
              draftStorageKey={DATE_DRAFT_KEY}
              onApply={({ from: f, to: t }) => {
                setFrom(f);
                setTo(t);
                setRangeAnchor(null);
              }}
              onReset={clearRange}
              onAnnounce={setLiveText}
            />
            <div>
              <Label>{t("auctions.reports.status")}</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">{t("auctions.reports.all")}</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t("auctions.reports.bidderId")}</Label>
              <div className="flex gap-1">
                <Input
                  dir="ltr"
                  placeholder={t("auctions.reports.bidderIdPlaceholder")}
                  value={bidderId}
                  onChange={(e) => setBidderId(e.target.value)}
                />
                {bidderId && (
                  <Button variant="ghost" size="sm" onClick={() => setBidderId("")}>
                    {t("auctions.reports.clear")}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                className={`w-full gap-1 ${hasPersistedExtras ? "border-amber-500/70 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" : ""}`}
                onClick={clearPersistedFilters}
                disabled={!hasPersistedExtras || q.isFetching}
                data-testid="clear-persisted-filters"
                title={t("auctions.reports.clearSaved")}
              >
                <Eraser className="size-4" />
                {t("auctions.reports.clearSaved")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <ActiveFiltersBar chips={activeChips} onClearAll={clearAllActiveFilters} />
        </div>
        <Link
          to="/dashboard/auctions/reports/filters-usage"
          className="shrink-0 text-xs text-primary hover:underline whitespace-nowrap"
        >
          {t("auctions.reports.filtersUsageLink")}
        </Link>
      </div>

      {q.isLoading || !org ? (
        <ResultsSkeleton />
      ) : q.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {String((q.error as Error)?.message ?? q.error)}
        </div>
      ) : !data ? null : (
        <div
          className={
            q.isFetching
              ? "opacity-60 pointer-events-none transition-opacity"
              : "transition-opacity"
          }
          aria-busy={q.isFetching || undefined}
        >
          {q.isFetching && (
            <div
              className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t("auctions.common.updatingResults")}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {kpis.map((k) => (
              <Card
                key={k.label}
                className="animate-fade-in transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{k.label}</span>
                    <k.icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="animate-fade-in transition-shadow hover:shadow-lg">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base tabular-nums">
                  تطور المزايدات عبر الزمن ({from} — {to}){tzInfo ? ` · ${tzInfo}` : ""}
                </CardTitle>
                <CardDescription>
                  {trendMetric === "max_amount"
                    ? "أعلى مبلغ مزايدة مُسجّل في كل يوم"
                    : "إجمالي مبالغ المزايدات في كل يوم"}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="inline-flex rounded-lg border p-0.5 text-xs">
                  {(
                    [
                      ["max_amount", "أعلى سعر"],
                      ["total_amount", "إجمالي المبالغ"],
                    ] as const
                  ).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTrendMetric(k)}
                      className={`rounded-md px-3 py-1.5 transition-all duration-200 ${
                        trendMetric === k
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  الذروة:{" "}
                  <span className="font-semibold text-foreground">
                    {trendPeak.toLocaleString("ar")}
                  </span>{" "}
                  ر.س
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {rangeAnchor ? (
                    <span className="text-primary">اختر نقطة نهاية النطاق ({rangeAnchor} →)</span>
                  ) : (
                    <span>{t("auctions.reports.dblClickHint")}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={clearRange}
                  >
                    {t("auctions.reports.reset")}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {from} — {to}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    title={t("auctions.reports.copyRange")}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`${from} — ${to}`);
                        toast.success("تم نسخ النطاق");
                      } catch {
                        toast.error("فشل النسخ");
                      }
                    }}
                  >
                    <Copy className="size-3" />
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => exportChartRows("csv")}
                    >
                      <FileDown className="size-3" /> CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px]"
                      onClick={() => exportChartRows("xlsx")}
                    >
                      <FileDown className="size-3" /> Excel
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent style={{ height: 320 }}>
              <div
                className="h-full w-full touch-none select-none"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <div aria-live="polite" aria-atomic="true" className="sr-only">
                  {liveText}
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.by_day}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                    onMouseDown={handleChartMouseDown}
                    onMouseMove={handleChartMouseMove}
                    onMouseUp={handleChartMouseUp}
                    onMouseLeave={handleChartMouseLeave}
                    style={{ cursor: "crosshair" }}
                  >
                    <defs>
                      <linearGradient id="gradTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                    <XAxis dataKey="day" fontSize={11} tickMargin={6} />
                    <YAxis fontSize={11} tickFormatter={fmtSAR} width={56} />
                    {effFrom && effTo && effFrom !== effTo && (
                      <ReferenceArea
                        x1={effFrom}
                        x2={effTo}
                        fill="#D4AF37"
                        fillOpacity={editingEdge ? 0.14 : 0.08}
                        stroke="#D4AF37"
                        strokeOpacity={editingEdge ? 0.55 : 0.3}
                      />
                    )}
                    {rangeAnchor && (
                      <ReferenceLine x={rangeAnchor} stroke="#2563EB" strokeDasharray="4 4" />
                    )}
                    {dragStart && dragEnd && dragStart !== dragEnd && (
                      <ReferenceArea
                        x1={dragStart}
                        x2={dragEnd}
                        fill="#2563EB"
                        fillOpacity={0.12}
                        stroke="#2563EB"
                        strokeOpacity={0.4}
                        strokeDasharray="3 3"
                      />
                    )}
                    {/* Draggable edge handles — appear only once a range is set */}
                    {effFrom && effTo && effFrom !== effTo && (
                      <Customized
                        component={(cprops: unknown) => (
                          <EdgeHandles
                            {...(cprops as EdgeHandlesInjected)}
                            from={effFrom}
                            to={effTo}
                            editing={editingEdge}
                            onAnnounce={setLiveText}
                            onStart={(which) => {
                              editHandleRef.current = which;
                              setDragRange({ from, to });
                            }}
                            onMove={(next) => setDragRange(next)}
                            onEnd={() => {
                              const dr = dragRange;
                              editHandleRef.current = null;
                              if (dr) {
                                setFrom(dr.from);
                                setTo(dr.to);
                                setRangeAnchor(null);
                                toast.success(`تم تحديث النطاق: ${dr.from} → ${dr.to}`);
                              }
                              setDragRange(null);
                            }}
                            onCancel={() => {
                              editHandleRef.current = null;
                              setDragRange(null);
                              toast.message("تم إلغاء تعديل النطاق");
                            }}
                          />
                        )}
                      />
                    )}
                    <RTooltip
                      cursor={{ stroke: "#D4AF37", strokeWidth: 1, strokeDasharray: "4 4" }}
                      position={isMobile ? { y: 8 } : undefined}
                      allowEscapeViewBox={{ x: false, y: true }}
                      content={
                        <ChartTooltip
                          minWidth={isMobile ? 180 : 220}
                          getHeader={(p) => fmtDateAr(String((p as TrendPoint).day))}
                          getRows={(p) => {
                            const t = p as TrendPoint;
                            const primaryLabel =
                              trendMetric === "max_amount" ? "أعلى سعر" : "إجمالي المبالغ";
                            const primaryVal =
                              trendMetric === "max_amount" ? t.max_amount : t.total_amount;
                            const secondaryLabel =
                              trendMetric === "max_amount" ? "إجمالي المبالغ" : "أعلى سعر";
                            const secondaryVal =
                              trendMetric === "max_amount" ? t.total_amount : t.max_amount;
                            return [
                              {
                                label: primaryLabel,
                                value: fmtMoney(primaryVal),
                                color: "#D4AF37",
                              },
                              {
                                label: secondaryLabel,
                                value: fmtMoney(secondaryVal),
                                color: "rgba(212,175,55,0.4)",
                                muted: true,
                              },
                              { label: "عدد المزايدات", value: fmtCount(t.bids), color: "#2563EB" },
                              {
                                label: "المزادات المفتوحة",
                                value: fmtCount(t.count),
                                color: "hsl(var(--muted-foreground))",
                                muted: true,
                              },
                            ];
                          }}
                          hint={
                            isMobile
                              ? "اضغط مطولاً لتحديد نقطة أو اسحب لتحديد نطاق"
                              : "انقر أو اسحب لتحديد النطاق"
                          }
                        />
                      }
                      wrapperStyle={{ outline: "none" }}
                    />
                    <Area
                      type="monotone"
                      dataKey={trendMetric}
                      stroke="#D4AF37"
                      strokeWidth={2.5}
                      fill="url(#gradTrend)"
                      activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-out"
                    />
                    <Line
                      type="monotone"
                      dataKey="bids"
                      stroke="#2563EB"
                      strokeWidth={1.5}
                      dot={false}
                      yAxisId={0}
                      isAnimationActive
                      animationDuration={1100}
                      name="عدد المزايدات"
                    />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 transition-shadow hover:shadow-lg">
              <CardHeader>
                <CardTitle className="text-base">{t("auctions.reports.perDay")}</CardTitle>
                <CardDescription>{t("auctions.reports.perDayHint")}</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.by_day}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} />
                    <RTooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                      wrapperStyle={{ outline: "none" }}
                      content={
                        <ChartTooltip
                          getHeader={(p) => fmtDateAr(String((p as { day?: string }).day ?? ""))}
                          getRows={(_p, payload) =>
                            payload.map((row) => ({
                              label: String(row.name ?? row.dataKey ?? ""),
                              value: fmtAuto(row.dataKey ?? row.name, row.value),
                              color: row.color,
                            }))
                          }
                        />
                      }
                    />
                    <Legend />
                    <Bar
                      dataKey="count"
                      name="المزادات"
                      fill="#2563EB"
                      radius={[4, 4, 0, 0]}
                      animationDuration={800}
                    />
                    <Bar
                      dataKey="bids"
                      name="المزايدات"
                      fill="#D4AF37"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1000}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-lg">
              <CardHeader>
                <CardTitle className="text-base">{t("auctions.reports.byStatus")}</CardTitle>
                <CardDescription>{t("auctions.reports.byStatusHint")}</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.by_status}
                      dataKey="count"
                      nameKey="status"
                      outerRadius={90}
                      label
                    >
                      {data.by_status.map((s) => (
                        <Cell key={s.status} fill={STATUS_COLOR[s.status] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <RTooltip
                      wrapperStyle={{ outline: "none" }}
                      content={
                        <ChartTooltip
                          getRows={(_p, payload) =>
                            payload.map((row) => {
                              const raw = row.payload as { status?: string; count?: number };
                              const count = Number(raw.count ?? row.value ?? 0);
                              const pct = totalAuctions > 0 ? count / totalAuctions : 0;
                              const status = String(raw.status ?? row.name ?? "");
                              return {
                                label: STATUS_LABEL[status] ?? status,
                                value: `${fmtCount(count)} · ${fmtPercent(pct)}`,
                                color: STATUS_COLOR[status] ?? row.color,
                              };
                            })
                          }
                        />
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("auctions.reports.topBidders")}</CardTitle>
              <CardDescription>{t("auctions.reports.topBiddersHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">{t("auctions.reports.bidder")}</TableHead>
                    <TableHead className="text-right">{t("auctions.reports.bidsCount")}</TableHead>
                    <TableHead className="text-right">{t("auctions.reports.totalAmount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_bidders.map((b, i) => (
                    <TableRow key={b.bidder_id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">
                        <button
                          type="button"
                          className="hover:underline"
                          title={t("auctions.reports.filterByBidder")}
                          onClick={() => setBidderId(b.bidder_id)}
                        >
                          {b.bidder_id.slice(0, 12)}…
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{b.bids}</Badge>
                      </TableCell>
                      <TableCell>{b.total_amount.toLocaleString("ar")}</TableCell>
                    </TableRow>
                  ))}
                  {data.top_bidders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        {t("auctions.reports.noBidsInRange")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
