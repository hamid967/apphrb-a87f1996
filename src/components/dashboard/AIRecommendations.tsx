import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Wrench,
  Coins,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { getDashboardMetrics, type DashboardMetrics } from "@/lib/dashboard-metrics.functions";
import { cn } from "@/lib/utils";

type Severity = "good" | "info" | "warn" | "critical";
type Rec = {
  id: string;
  severity: Severity;
  icon: typeof Sparkles;
  title: string;
  detail: string;
};

const sevStyle: Record<Severity, string> = {
  good: "bg-success/10 text-success dark:text-success ring-success/20",
  info: "bg-info/10 text-info dark:text-info ring-info/20",
  warn: "bg-warning/10 text-warning dark:text-warning ring-warning/20",
  critical: "bg-destructive/10 text-destructive dark:text-destructive ring-destructive/20",
};

function buildRecs(m: DashboardMetrics, isAr: boolean): Rec[] {
  const recs: Rec[] = [];
  const pct = (n: number) => `${Math.round(n)}%`;

  // Occupancy
  if (m.units_total > 0) {
    if (m.occupancy_pct < 60) {
      recs.push({
        id: "occ-low",
        severity: "critical",
        icon: TrendingDown,
        title: isAr
          ? `الإشغال منخفض (${pct(m.occupancy_pct)})`
          : `Low occupancy (${pct(m.occupancy_pct)})`,
        detail: isAr
          ? `لديك ${m.units_vacant} وحدة شاغرة. أطلق حملة تسويقية وراجع الأسعار للوحدات الشاغرة.`
          : `${m.units_vacant} units vacant. Launch a marketing push and review pricing on vacant units.`,
      });
    } else if (m.occupancy_pct < 80) {
      recs.push({
        id: "occ-mid",
        severity: "warn",
        icon: TrendingUp,
        title: isAr
          ? `فرصة لرفع الإشغال (${pct(m.occupancy_pct)})`
          : `Occupancy can improve (${pct(m.occupancy_pct)})`,
        detail: isAr
          ? `اعرض ${m.units_vacant} وحدة شاغرة في القوائم المميزة لهذا الأسبوع.`
          : `Promote ${m.units_vacant} vacant units in featured listings this week.`,
      });
    } else {
      recs.push({
        id: "occ-high",
        severity: "good",
        icon: CheckCircle2,
        title: isAr
          ? `إشغال ممتاز (${pct(m.occupancy_pct)})`
          : `Excellent occupancy (${pct(m.occupancy_pct)})`,
        detail: isAr
          ? "أداء قوي. فكّر في تعديل الأسعار للعقود المنتهية لتحقيق نمو إيراد."
          : "Strong performance. Consider price adjustments on renewals to grow revenue.",
      });
    }
  }

  // Collection
  if (m.revenue_month > 0 || m.collection_pct > 0) {
    if (m.collection_pct < 70) {
      recs.push({
        id: "col-low",
        severity: "critical",
        icon: Coins,
        title: isAr
          ? `تحصيل ضعيف (${pct(m.collection_pct)})`
          : `Weak collection (${pct(m.collection_pct)})`,
        detail: isAr
          ? "فعّل تذكيرات الدفع التلقائية وتواصل مع كبار المستأجرين المتأخرين."
          : "Enable automated payment reminders and contact top overdue tenants.",
      });
    } else if (m.collection_pct < 90) {
      recs.push({
        id: "col-mid",
        severity: "warn",
        icon: Coins,
        title: isAr
          ? `تحسين التحصيل (${pct(m.collection_pct)})`
          : `Improve collection (${pct(m.collection_pct)})`,
        detail: isAr
          ? "أرسل تذكيرات للفواتير المستحقة خلال 7 أيام."
          : "Send reminders for invoices due within 7 days.",
      });
    }
  }

  // Maintenance
  if (m.maintenance_open >= 10) {
    recs.push({
      id: "maint-high",
      severity: "critical",
      icon: Wrench,
      title: isAr
        ? `${m.maintenance_open} تذكرة صيانة مفتوحة`
        : `${m.maintenance_open} open maintenance tickets`,
      detail: isAr
        ? "أعد تعيين التذاكر القديمة وأضف فنيًا إضافيًا لتفادي تراكم الطلبات."
        : "Reassign aging tickets and add a technician to prevent backlog.",
    });
  } else if (m.maintenance_open >= 5) {
    recs.push({
      id: "maint-mid",
      severity: "warn",
      icon: Wrench,
      title: isAr
        ? `صيانة قيد التنفيذ (${m.maintenance_open})`
        : `Maintenance in progress (${m.maintenance_open})`,
      detail: isAr
        ? "راجع أولوية التذاكر وحدد المهام الحرجة اليوم."
        : "Review ticket priority and flag critical tasks today.",
    });
  }

  // Support
  if (m.support_open >= 5) {
    recs.push({
      id: "sup",
      severity: "warn",
      icon: AlertTriangle,
      title: isAr ? `${m.support_open} تذكرة دعم مفتوحة` : `${m.support_open} open support tickets`,
      detail: isAr
        ? "خصص وقتًا اليوم للرد على تذاكر الدعم المتراكمة."
        : "Allocate time today to clear the support queue.",
    });
  }

  // AI health
  if (m.ai_score >= 85) {
    recs.push({
      id: "ai-good",
      severity: "good",
      icon: Sparkles,
      title: isAr
        ? `صحة المحفظة ممتازة (${pct(m.ai_score)})`
        : `Portfolio health excellent (${pct(m.ai_score)})`,
      detail: isAr
        ? "استمر على نفس النهج ووثّق الممارسات الناجحة."
        : "Keep the current playbook and document what's working.",
    });
  } else if (m.ai_score < 50) {
    recs.push({
      id: "ai-low",
      severity: "critical",
      icon: Sparkles,
      title: isAr
        ? `صحة المحفظة تحتاج انتباه (${pct(m.ai_score)})`
        : `Portfolio health needs attention (${pct(m.ai_score)})`,
      detail: isAr
        ? "ركّز على رفع الإشغال والتحصيل هذا الأسبوع."
        : "Focus on occupancy and collection this week.",
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "none",
      severity: "info",
      icon: Sparkles,
      title: isAr ? "لا توجد توصيات عاجلة" : "No urgent recommendations",
      detail: isAr
        ? "المؤشرات مستقرة. سنبلغك عند رصد أي تغيّر."
        : "Metrics look stable. We'll alert you on any change.",
    });
  }

  return recs.slice(0, 5);
}

export function AIRecommendations({ orgId, isAr }: { orgId?: string; isAr: boolean }) {
  const q = useQuery({
    queryKey: ["dashboard-metrics", orgId],
    queryFn: () => getDashboardMetrics({ data: { org_id: orgId! } }),
    enabled: !!orgId,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const recs = q.data ? buildRecs(q.data, isAr) : [];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-background p-5 shadow-sm backdrop-blur-sm">
      {/* Top accent rail */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-16 size-40 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <motion.span
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="relative grid size-9 place-items-center rounded-xl border border-primary/30 bg-primary/12 text-primary shadow-[0_6px_18px_-10px_hsl(var(--primary)/0.6)]"
          >
            <Sparkles className="size-4" />
            <span className="absolute -end-0.5 -top-0.5 flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
          </motion.span>
          <div>
            <h3 className="text-sm font-bold tracking-tight">
              {isAr ? "توصيات الذكاء الاصطناعي" : "AI Recommendations"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {isAr ? "تتحدّث كل دقيقة" : "Updates every minute"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          aria-label={isAr ? "تحديث" : "Refresh"}
          className="rounded-lg border border-transparent p-1.5 text-muted-foreground transition hover:border-border/60 hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", q.isFetching && "animate-spin")} />
        </button>
      </div>

      {q.isLoading ? (
        <div className="relative space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-border/40 bg-muted/40"
            />
          ))}
        </div>
      ) : (
        <ul className="relative space-y-2">
          <AnimatePresence initial={false}>
            {recs.map((r, i) => {
              const Icon = r.icon;
              return (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                  whileHover={{ x: 2 }}
                  className="group relative overflow-hidden rounded-xl border border-border/60 bg-background/40 p-3 transition hover:border-primary/40 hover:bg-background/70"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-y-0 start-0 w-0.5",
                      r.severity === "good" && "bg-success",
                      r.severity === "info" && "bg-info",
                      r.severity === "warn" && "bg-warning",
                      r.severity === "critical" && "bg-destructive",
                    )}
                  />
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg ring-1 transition-transform group-hover:scale-110",
                        sevStyle[r.severity],
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{r.title}</div>
                      <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                        {r.detail}
                      </div>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

