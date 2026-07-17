import { t } from "@/lib/i18n";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  FileClock,
  CheckCircle2,
  Clock3,
  XCircle,
  Users2,
  Building2,
  Receipt,
  FolderOpen,
  Bell,
  CalendarDays,
  Sparkles,
  ArrowUpRight,
  ChevronLeft,
  Landmark,
  Briefcase,
  IdCard,
  ScrollText,
  Wallet,
  Coins,
  RefreshCcw,
  ShieldCheck,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { getPortalOverview } from "@/lib/portal.functions";

const overviewQuery = queryOptions({
  queryKey: ["portal", "overview"],
  queryFn: () => getPortalOverview(),
  staleTime: 30_000,
  refetchInterval: 90_000,
});

export const Route = createFileRoute("/_authenticated/portal/")({
  head: () => portalHead({ titleAr: 'لوحة محطتي', titleEn: 'My Portal', descAr: 'نظرة سريعة على حسابك، فواتيرك، ومهامك.', path: '/portal' }),
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQuery),
  component: PortalOverviewPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button
          className="mt-3"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8">{t("common.notFound")}</div>,
});

function PortalOverviewPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const router = useRouter();
  const { data } = useSuspenseQuery(overviewQuery);
  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US");
  const df = new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const firstName = data.profile.full_name?.split(" ")[0] ?? (isAr ? "مرحباً" : "there");

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Welcome hero */}
      <section
        aria-labelledby="portal-welcome"
        className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/8 via-card to-accent/8 p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute inset-0 opacity-70">
          <div className="absolute -top-24 -right-24 size-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 size-64 rounded-full bg-accent/20 blur-3xl" />
        </div>

        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <Sparkles className="size-3" />
              {isAr ? "HR HBSH — منصة الخدمات الحكومية" : "HR HBSH — Government Services"}
            </div>
            <h1
              id="portal-welcome"
              className="mt-2 truncate text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {isAr ? `أهلاً، ${firstName} 👋` : `Welcome back, ${firstName} 👋`}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.organization?.name
                ? isAr
                  ? `${data.organization.name} • ${roleLabel(data.organization.role, true)}`
                  : `${data.organization.name} • ${roleLabel(data.organization.role, false)}`
                : isAr
                  ? "بوابة الأعمال الذكية"
                  : "Your intelligent business portal"}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={data.subscription.status === "trial" ? "warning" : "success"}>
                {isAr
                  ? data.subscription.status === "trial"
                    ? "تجربة نشطة"
                    : "الاشتراك نشط"
                  : data.subscription.status === "trial"
                    ? "Trial active"
                    : "Active plan"}
              </Badge>
              <Badge tone="primary">
                {isAr ? `الباقة: ${data.subscription.plan}` : `Plan: ${data.subscription.plan}`}
              </Badge>
              {data.subscription.trial_ends_at && (
                <Badge tone="muted">
                  {isAr ? "تنتهي التجربة" : "Trial ends"}:{" "}
                  {df.format(new Date(data.subscription.trial_ends_at))}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.invalidate()}
              aria-label={isAr ? "تحديث" : "Refresh"}
            >
              <RefreshCcw className="size-4" />
              <span className="hidden sm:inline">{isAr ? "تحديث" : "Refresh"}</span>
            </Button>
            <Button asChild size="sm">
              <Link to="/portal/requests">
                <FileClock className="size-4" />
                {isAr ? "طلب جديد" : "New request"}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section aria-label={isAr ? "الإحصائيات" : "Key stats"}>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi
            icon={<FileClock className="size-5" />}
            label={isAr ? "إجمالي الطلبات" : "Total requests"}
            value={data.kpis.requests_total}
            format={(n) => nf.format(n)}
            tone="primary"
          />
          <Kpi
            icon={<CheckCircle2 className="size-5" />}
            label={isAr ? "مكتملة" : "Completed"}
            value={data.kpis.requests_completed}
            format={(n) => nf.format(n)}
            tone="success"
          />
          <Kpi
            icon={<Clock3 className="size-5" />}
            label={isAr ? "قيد التنفيذ" : "Pending"}
            value={data.kpis.requests_pending}
            format={(n) => nf.format(n)}
            tone="warning"
          />
          <Kpi
            icon={<XCircle className="size-5" />}
            label={isAr ? "مرفوضة" : "Rejected"}
            value={data.kpis.requests_rejected}
            format={(n) => nf.format(n)}
            tone="danger"
          />
          <Kpi
            icon={<Users2 className="size-5" />}
            label={isAr ? "الموظفون" : "Employees"}
            value={data.kpis.employees}
            format={(n) => nf.format(n)}
            tone="primary"
          />
          <Kpi
            icon={<Building2 className="size-5" />}
            label={isAr ? "عقود نشطة" : "Active contracts"}
            value={data.kpis.contracts_active}
            format={(n) => nf.format(n)}
            tone="accent"
          />
          <Kpi
            icon={<Receipt className="size-5" />}
            label={isAr ? "فواتير مستحقة" : "Outstanding invoices"}
            value={data.kpis.invoices_outstanding}
            format={(n) => nf.format(n)}
            tone="warning"
          />
          <Kpi
            icon={<CheckCircle2 className="size-5" />}
            label={isAr ? "فواتير مدفوعة" : "Paid invoices"}
            value={data.kpis.invoices_paid}
            format={(n) => nf.format(n)}
            tone="success"
          />
          <Kpi
            icon={<FolderOpen className="size-5" />}
            label={isAr ? "الوثائق" : "Documents"}
            value={data.kpis.documents}
            format={(n) => nf.format(n)}
            tone="primary"
          />
          <Kpi
            icon={<CalendarDays className="size-5" />}
            label={isAr ? "مواعيد قادمة" : "Upcoming meetings"}
            value={data.kpis.meetings_upcoming}
            format={(n) => nf.format(n)}
            tone="accent"
          />
          <Kpi
            icon={<Wallet className="size-5" />}
            label={isAr ? "رصيد المحفظة" : "Wallet balance"}
            value={data.kpis.wallet_balance}
            format={(n) => nf.format(n)}
            suffix={isAr ? " ر.س" : " SAR"}
            tone="success"
          />
          <Kpi
            icon={<Coins className="size-5" />}
            label={isAr ? "نقاط الولاء" : "Loyalty points"}
            value={data.kpis.loyalty_points}
            format={(n) => nf.format(n)}
            tone="primary"
          />

        </div>
      </section>

      {/* Quick services */}
      <section
        aria-label={isAr ? "الخدمات السريعة" : "Quick services"}
        className="surface-card p-5 sm:p-6"
      >
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              {isAr ? "الخدمات السريعة" : "Quick services"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isAr ? "أكثر الخدمات الحكومية طلباً" : "Most requested government services"}
            </p>
          </div>
          <Link
            to="/portal/requests"
            className="text-xs font-semibold text-primary hover:underline"
          >
            {isAr ? "كل الخدمات" : "All services"}
          </Link>
        </div>

        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {QUICK_SERVICES.map((s) => (
            <motion.div
              key={s.key}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
            >
              <Link
                to="/portal/requests"
                className="group flex h-full flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card/80 p-3.5 backdrop-blur transition-all hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
              >
                <div
                  className={
                    "grid size-10 place-items-center rounded-xl transition-transform group-hover:scale-110 " +
                    toneBg(s.tone)
                  }
                >
                  <s.icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{isAr ? s.ar : s.en}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {isAr ? s.arSub : s.enSub}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Feeds */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Recent requests */}
        <div className="surface-card p-5 lg:col-span-2">
          <FeedHeader
            icon={<FileClock className="size-4" />}
            title={isAr ? "آخر طلباتي" : "Recent requests"}
            href="/portal/requests"
            isAr={isAr}
          />
          {data.recentRequests.length === 0 ? (
            <Empty text={isAr ? "لا توجد طلبات بعد" : "No requests yet"} />
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {data.recentRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <FileClock className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {timeAgo(r.updated_at, isAr)}
                      </div>
                    </div>
                  </div>
                  <StatusPill status={r.status} isAr={isAr} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Expiry alerts */}
        <div className="surface-card p-5">
          <FeedHeader
            icon={<ShieldCheck className="size-4" />}
            title={isAr ? "تنبيهات الانتهاء" : "Expiry alerts"}
            href="/portal/documents"
            isAr={isAr}
          />
          {data.expiries.length === 0 ? (
            <Empty text={isAr ? "لا انتهاءات قريبة" : "Nothing expiring soon"} />
          ) : (
            <ul className="mt-3 space-y-2.5">
              {data.expiries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
                    <Clock3 className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{e.label}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {isAr ? "تنتهي في" : "Expires on"} {df.format(new Date(e.date))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Notifications + AI tip */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <FeedHeader
            icon={<Bell className="size-4" />}
            title={isAr ? "آخر الإشعارات" : "Latest notifications"}
            href="/portal/notifications"
            isAr={isAr}
          />
          {data.recentNotifications.length === 0 ? (
            <Empty text={isAr ? "لا إشعارات" : "You're all caught up"} />
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {data.recentNotifications.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  <div
                    className={
                      "mt-0.5 size-2 shrink-0 rounded-full " +
                      (n.read_at ? "bg-muted-foreground/40" : "bg-primary")
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{n.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {timeAgo(n.created_at, isAr)}
                      </span>
                    </div>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface-card relative overflow-hidden bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <Bot className="size-3.5" /> {isAr ? "المساعد الذكي" : "AI Assistant"}
            </div>
            <h3 className="mt-3 text-base font-semibold">{isAr ? "نصيحة اليوم" : "Daily tip"}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isAr
                ? "استخدم OCR لتحليل الوثائق تلقائياً وتعبئة النماذج الحكومية بضغطة زر."
                : "Use OCR to auto-analyze documents and pre-fill government forms in one click."}
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/portal/assistant">
                {isAr ? "افتح المساعد" : "Open Assistant"}
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- helpers ---------- */

function roleLabel(role: string | null, isAr: boolean) {
  if (!role) return isAr ? "عضو" : "Member";
  const map: Record<string, [string, string]> = {
    owner: ["مالك", "Owner"],
    admin: ["مدير", "Admin"],
    manager: ["مدير قسم", "Manager"],
    member: ["عضو", "Member"],
  };
  const t = map[role] ?? [role, role];
  return isAr ? t[0] : t[1];
}

function timeAgo(iso: string, isAr: boolean) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return isAr ? `${s} ث` : `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return isAr ? `${m} د` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return isAr ? `${h} س` : `${h}h`;
  const d = Math.floor(h / 24);
  return isAr ? `${d} ي` : `${d}d`;
}

type Tone = "primary" | "accent" | "success" | "warning" | "danger" | "muted";

function toneBg(t: Tone) {
  return t === "success"
    ? "bg-success/10 text-success"
    : t === "warning"
      ? "bg-warning/15 text-warning"
      : t === "danger"
        ? "bg-destructive/10 text-destructive"
        : t === "accent"
          ? "bg-accent/15 text-accent-foreground"
          : t === "muted"
            ? "bg-muted text-muted-foreground"
            : "bg-primary/10 text-primary";
}

function Kpi({
  icon,
  label,
  value,
  suffix,
  format,
  tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  format?: (n: number) => string;
  tone?: Tone;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="surface-card group flex items-center gap-3 p-4"
    >
      <div
        className={
          "grid size-10 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-110 " +
          toneBg(tone)
        }
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        <div className="mt-0.5 truncate text-lg font-semibold tabular-nums">
          <AnimatedNumber value={value} format={format} suffix={suffix} />
        </div>
      </div>
    </motion.div>
  );
}


function Badge({ children, tone = "primary" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
        toneBg(tone)
      }
    >
      {children}
    </span>
  );
}

function FeedHeader({
  icon,
  title,
  href,
  isAr,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  isAr: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </h3>
      <Link
        to={href}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        {isAr ? "عرض الكل" : "View all"} <ChevronLeft className="size-3 rtl:rotate-180" />
      </Link>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mt-6 text-center text-xs text-muted-foreground">{text}</p>;
}

function StatusPill({ status, isAr }: { status: string; isAr: boolean }) {
  const map: Record<string, { ar: string; en: string; tone: Tone }> = {
    todo: { ar: "جديد", en: "New", tone: "muted" },
    in_progress: { ar: "قيد التنفيذ", en: "In progress", tone: "warning" },
    done: { ar: "مكتمل", en: "Completed", tone: "success" },
    cancelled: { ar: "ملغى", en: "Cancelled", tone: "danger" },
  };
  const m = map[status] ?? { ar: status, en: status, tone: "muted" as Tone };
  return <Badge tone={m.tone}>{isAr ? m.ar : m.en}</Badge>;
}

/* ---------- quick services catalog ---------- */

const QUICK_SERVICES: Array<{
  key: string;
  ar: string;
  en: string;
  arSub: string;
  enSub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
}> = [
  {
    key: "cr",
    ar: "السجل التجاري",
    en: "Commercial Reg.",
    arSub: "تجديد وتعديل",
    enSub: "Renew & edit",
    icon: Briefcase,
    tone: "primary",
  },
  {
    key: "muni",
    ar: "رخصة البلدية",
    en: "Municipality",
    arSub: "إصدار وتجديد",
    enSub: "Issue & renew",
    icon: Landmark,
    tone: "accent",
  },
  {
    key: "qiwa",
    ar: "قوى",
    en: "Qiwa",
    arSub: "خدمات العمل",
    enSub: "Labor services",
    icon: Users2,
    tone: "success",
  },
  {
    key: "muqeem",
    ar: "مقيم",
    en: "Muqeem",
    arSub: "الإقامة والزيارة",
    enSub: "Residency",
    icon: IdCard,
    tone: "primary",
  },
  {
    key: "gosi",
    ar: "التأمينات",
    en: "GOSI",
    arSub: "التسجيل والدفع",
    enSub: "Register/Pay",
    icon: ShieldCheck,
    tone: "success",
  },
  {
    key: "zatca",
    ar: "زاتكا",
    en: "ZATCA",
    arSub: "الضريبة والفوترة",
    enSub: "Tax & e-inv",
    icon: Receipt,
    tone: "warning",
  },
  {
    key: "iqama",
    ar: "إقامة",
    en: "Iqama",
    arSub: "إصدار وتجديد",
    enSub: "Issue & renew",
    icon: IdCard,
    tone: "accent",
  },
  {
    key: "visa",
    ar: "التأشيرات",
    en: "Visas",
    arSub: "خروج وعودة",
    enSub: "Exit/Re-entry",
    icon: ScrollText,
    tone: "primary",
  },
  {
    key: "insurance",
    ar: "التأمين الطبي",
    en: "Medical Ins.",
    arSub: "أفراد وموظفون",
    enSub: "Staff & family",
    icon: ShieldCheck,
    tone: "success",
  },
  {
    key: "payroll",
    ar: "الرواتب",
    en: "Payroll",
    arSub: "معالجة شهرية",
    enSub: "Monthly run",
    icon: Wallet,
    tone: "primary",
  },
  {
    key: "docs",
    ar: "توثيق الوثائق",
    en: "Doc. verify",
    arSub: "تحقّق فوري",
    enSub: "Instant verify",
    icon: FolderOpen,
    tone: "muted",
  },
  {
    key: "appt",
    ar: "حجز موعد",
    en: "Book appointment",
    arSub: "الجهات الحكومية",
    enSub: "Gov entities",
    icon: CalendarDays,
    tone: "accent",
  },
];
