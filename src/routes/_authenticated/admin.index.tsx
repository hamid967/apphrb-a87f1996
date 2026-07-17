import { t } from "@/lib/i18n";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import { AdminPageHeader, AdminPageLoading } from "@/components/admin/AdminPageHeader";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { sectionHead } from "@/lib/section-og-head";
import {
  Users2,
  Building2,
  ShieldCheck,
  Activity,
  TrendingUp,
  ChevronLeft,
  ServerCog,
  CheckCircle2,
  AlertTriangle,
  ScrollText,
  Workflow,
  KeyRound,
  Palette,
  Bot,
  Database,
  FileBarChart,
  Zap,
  Globe,
  Lock,
  RefreshCcw,
  UserCog,
  GitBranch,
  FileText,
  Bell,
  Cog,
  LogIn,
  XCircle,
  Sparkles,
  CreditCard,
  Wallet,
  Receipt,
  CalendarClock,
  Coins,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RTooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { getAdminOverview } from "@/lib/admin-stats.functions";
import { AdminGlobalSearch } from "@/components/admin/AdminGlobalSearch";
import { ImpersonateButton } from "@/components/admin/ImpersonateButton";
import { DecisionSheet, type DecisionKind } from "@/components/admin/DecisionSheet";
import { useState } from "react";

const overviewQuery = queryOptions({
  queryKey: ["admin", "overview"],
  queryFn: () => getAdminOverview(),
  staleTime: 30_000,
  refetchInterval: 60_000,
});

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQuery),
  component: AdminOverview,
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "مركز التحكم",
      entityEn: "Control Center",
      descAr: "إدارة الشركات، المستخدمين، الاشتراكات والتشخيص اللحظي.",
      path: "/admin",
    }),
  pendingComponent: () => (
    <AdminPageLoading
      ar="مركز التحكم"
      en="Control Center"
      icon={Sparkles}
      descriptionAr="لوحة موحّدة لإدارة النظام والمستخدمين والنشاط اللحظي."
      descriptionEn="Unified system, users and live activity command center."
    />
  ),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <AdminPageHeader ar="مركز التحكم" en="Control Center" icon={Sparkles} />
        <p className="text-destructive text-sm">{error.message}</p>
        <Button
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
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

function AdminOverview() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const router = useRouter();
  const { data } = useSuspenseQuery(overviewQuery);
  const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };

  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US");

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <Sparkles className="size-3" />{" "}
            {isAr ? "Super Admin — HR HBSH Enterprise OS" : "Super Admin — HR HBSH Enterprise OS"}
          </div>
          <h1 className="mt-1 truncate text-xl sm:text-2xl font-semibold tracking-tight">
            {isAr ? "مركز التحكم" : "Control Center"}
          </h1>
          <p className="truncate text-xs sm:text-sm text-muted-foreground">
            {isAr
              ? "لوحة موحّدة لإدارة النظام والمستخدمين والنشاط اللحظي"
              : "Unified system, users and live activity command center"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AdminGlobalSearch isAr={isAr} />
          <ImpersonateButton isAr={isAr} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.invalidate()}
            className="active:scale-[0.97]"
          >
            <RefreshCcw className="size-4" />{" "}
            <span className="hidden sm:inline">{isAr ? "تحديث" : "Refresh"}</span>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/portal-invitations">
              <Bell className="size-4" />{" "}
              <span className="hidden xs:inline">{isAr ? "دعوات البوابة" : "Portal invites"}</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/search-insights">
              <TrendingUp className="size-4" />{" "}
              <span className="hidden xs:inline">{isAr ? "مصادر البحث" : "Search insights"}</span>
            </Link>
          </Button>
          <Button asChild size="sm" className="active:scale-[0.97] hover:shadow-md">
            <Link to="/admin/users">
              <UserCog className="size-4" />{" "}
              <span className="hidden xs:inline">{isAr ? "إدارة المستخدمين" : "Manage users"}</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI grid — real data */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4"
      >

      </motion.div>

      {/* Unified Decision & Control Center */}
      <DecisionCenter isAr={isAr} data={data} />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          icon={<Users2 className="size-5" />}
          label={isAr ? "إجمالي المستخدمين" : "Total users"}
          value={data.kpis.users}
          format={(n) => nf.format(n)}
          sub={
            isAr
              ? `${nf.format(data.kpis.pending)} بانتظار الاعتماد`
              : `${nf.format(data.kpis.pending)} pending approval`
          }
          tone="primary"
        />
        <KpiCard
          icon={<Building2 className="size-5" />}
          label={isAr ? "المؤسسات" : "Organizations"}
          value={data.kpis.orgs}
          format={(n) => nf.format(n)}
          sub={
            isAr
              ? `${nf.format(data.kpis.activeContracts)} عقد نشط`
              : `${nf.format(data.kpis.activeContracts)} active contracts`
          }
          tone="sky"
        />
        <KpiCard
          icon={<ShieldCheck className="size-5" />}
          label={isAr ? "دخول ناجح (24س)" : "Successful logins (24h)"}
          value={data.kpis.loginSuccess24h}
          format={(n) => nf.format(n)}
          sub={
            isAr
              ? `${nf.format(data.kpis.loginFailed24h)} محاولة فاشلة`
              : `${nf.format(data.kpis.loginFailed24h)} failed attempts`
          }
          tone="emerald"
        />
        <KpiCard
          icon={<Activity className="size-5" />}
          label={isAr ? "أحداث التدقيق (24س)" : "Audit events (24h)"}
          value={data.kpis.events24h}
          format={(n) => nf.format(n)}
          sub={isAr ? "من سجل التدقيق" : "from audit log"}
          tone="amber"
        />
      </motion.div>

      {/* Billing KPIs */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-6"
      >
        <KpiCard
          icon={<CreditCard className="size-5" />}
          label={isAr ? "اشتراكات نشطة" : "Active subs"}
          value={data.kpis.activeSubs}
          format={(n) => nf.format(n)}
          tone="primary"
        />
        <KpiCard
          icon={<Sparkles className="size-5" />}
          label={isAr ? "تجارب" : "Trials"}
          value={data.kpis.trialSubs}
          format={(n) => nf.format(n)}
          tone="primary"
        />
        <KpiCard
          icon={<Receipt className="size-5" />}
          label={isAr ? "إيصالات معلّقة" : "Pending receipts"}
          value={data.kpis.pendingReceipts}
          format={(n) => nf.format(n)}
          tone={data.kpis.pendingReceipts > 0 ? "amber" : "emerald"}
        />
        <KpiCard
          icon={<TrendingUp className="size-5" />}
          label={isAr ? "MRR" : "MRR"}
          value={data.kpis.mrr}
          format={(n) => nf.format(n)}
          suffix=" ﷼"
          tone="emerald"
        />
        <KpiCard
          icon={<Wallet className="size-5" />}
          label={isAr ? "إيراد الشهر" : "Revenue MTD"}
          value={data.kpis.revenueMonth}
          format={(n) => nf.format(n)}
          suffix=" ﷼"
          tone="sky"
        />
        <KpiCard
          icon={<Coins className="size-5" />}
          label={isAr ? "إيراد السنة" : "Revenue YTD"}
          value={data.kpis.revenueYear}
          format={(n) => nf.format(n)}
          suffix=" ﷼"
          tone="amber"
        />

      </motion.div>

      {/* Alerts + Revenue chart + Plan distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 surface-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {isAr ? "الإيراد الشهري (12 شهر)" : "Monthly revenue (12 mo)"}
            </h3>
            <Link
              to="/admin/subscription-payments"
              className="text-xs text-primary hover:underline"
            >
              {isAr ? "الإيصالات" : "Receipts"}
            </Link>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.revenueMonthly}
                margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="m"
                  reversed={isAr}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  orientation={isAr ? "right" : "left"}
                />
                <RTooltip formatter={(v: number) => `${nf.format(v)} ﷼`} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="surface-card p-5">
          <h3 className="text-sm font-semibold">{isAr ? "توزيع الباقات" : "Plan distribution"}</h3>
          {data.planDistribution.length === 0 ? (
            <p className="mt-6 text-xs text-muted-foreground">
              {isAr ? "لا توجد اشتراكات نشطة" : "No active subscriptions"}
            </p>
          ) : (
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.planDistribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {data.planDistribution.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          [
                            "hsl(var(--primary))",
                            "#0EA5E9",
                            "#10B981",
                            "#F59E0B",
                            "#8B5CF6",
                            "#F43F5E",
                          ][i % 6]
                        }
                      />
                    ))}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Alert lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Receipt className="size-4 text-warning" />{" "}
              {isAr ? "إيصالات بانتظار المراجعة" : "Receipts awaiting review"}
            </h3>
            <Link
              to="/admin/subscription-payments"
              className="text-xs text-primary hover:underline"
            >
              {isAr ? "فتح الكل" : "Open all"}
            </Link>
          </div>
          {data.kpis.pendingReceipts === 0 ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" />{" "}
              {isAr ? "لا توجد إيصالات معلّقة" : "No pending receipts"}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-warning/10 p-3 ring-1 ring-warning/20">
              <AlertTriangle className="size-5 text-warning" />
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {nf.format(data.kpis.pendingReceipts)}{" "}
                  {isAr ? "إيصال بانتظار الاعتماد" : "receipts pending approval"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {isAr ? "راجع الطلبات لتفعيل الاشتراكات" : "Review to activate subscriptions"}
                </div>
              </div>
              <Button asChild size="sm">
                <Link to="/admin/subscription-payments">{isAr ? "مراجعة" : "Review"}</Link>
              </Button>
            </div>
          )}
        </div>
        <div className="surface-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock className="size-4 text-destructive" />{" "}
              {isAr ? "اشتراكات تنتهي خلال 7 أيام" : "Subs expiring in 7 days"}
            </h3>
          </div>
          {data.expiringSoon.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" /> {isAr ? "لا يوجد" : "None"}
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.expiringSoon.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate">{s.organizations?.name ?? s.org_id.slice(0, 8)}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(s.end_date).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Chart + system health */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 surface-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {isAr ? "نشاط النظام (7 أيام)" : "System activity (7 days)"}
            </h3>
            <Link to="/admin/audit-log" className="text-xs text-primary hover:underline">
              {isAr ? "عرض السجل" : "Open log"}
            </Link>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.activity} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="d"
                  reversed={isAr}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11 }}
                  orientation={isAr ? "right" : "left"}
                />
                <RTooltip />
                <Bar dataKey="v" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <SystemHealthCard isAr={isAr} data={data} />
      </div>

      {/* Live feeds */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FeedCard
          title={isAr ? "أحدث أحداث التدقيق" : "Latest audit events"}
          icon={<ScrollText className="size-4" />}
          empty={isAr ? "لا توجد أحداث بعد" : "No events yet"}
          items={data.recentAudit.map((r) => ({
            key: r.id,
            primary: `${r.action} · ${r.entity}`,
            secondary: r.actor ? r.actor.slice(0, 8) : isAr ? "نظام" : "system",
            time: r.created_at,
          }))}
          href="/admin/audit-log"
          isAr={isAr}
        />
        <FeedCard
          title={isAr ? "محاولات الدخول الأخيرة" : "Recent login attempts"}
          icon={<LogIn className="size-4" />}
          empty={isAr ? "لا توجد محاولات" : "No attempts"}
          items={data.recentLogins.map((r) => ({
            key: r.id,
            primary: r.email ?? "—",
            secondary: `${r.status} · ${r.ip_address ?? "—"}`,
            time: r.created_at,
            tone: r.status === "success" ? "emerald" : "rose",
          }))}
          href="/security/sessions"
          isAr={isAr}
        />
      </div>

      {/* Module launcher */}
      <ModuleLauncher isAr={isAr} />
    </div>
  );
}

function DecisionCenter({
  isAr,
  data,
}: {
  isAr: boolean;
  data: {
    kpis: {
      pending: number;
      pendingSubs?: number;
      pendingReceipts: number;
      pendingInvites?: number;
      rejectedSubs24h?: number;
    };
  };
}) {
  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US");
  const [openKind, setOpenKind] = useState<DecisionKind | null>(null);
  const items: Array<{
    key: DecisionKind;
    icon: React.ReactNode;
    ar: string;
    en: string;
    descAr: string;
    descEn: string;
    count: number;
    to: string;
    tone: "amber" | "rose" | "emerald" | "sky" | "primary";
    ctaAr: string;
    ctaEn: string;
  }> = [
    {
      key: "subs",
      icon: <CreditCard className="size-5" />,
      ar: "طلبات اشتراك بانتظار التفعيل",
      en: "Subscription requests to activate",
      descAr: "وافق أو ارفض طلبات الاشتراك الجديدة",
      descEn: "Approve or reject new subscription requests",
      count: data.kpis.pendingSubs ?? 0,
      to: "/admin/subscriptions",
      tone: "primary",
      ctaAr: "مراجعة",
      ctaEn: "Review",
    },
    {
      key: "receipts",
      icon: <Receipt className="size-5" />,
      ar: "إيصالات بانتظار المراجعة",
      en: "Payment receipts pending",
      descAr: "اعتمد التحويلات البنكية لتفعيل الاشتراكات",
      descEn: "Approve bank transfers to activate subscriptions",
      count: data.kpis.pendingReceipts ?? 0,
      to: "/admin/subscription-payments",
      tone: "amber",
      ctaAr: "اعتماد",
      ctaEn: "Approve",
    },
    {
      key: "users",
      icon: <UserCog className="size-5" />,
      ar: "مستخدمون بانتظار الاعتماد",
      en: "Users awaiting approval",
      descAr: "راجع طلبات الحسابات الجديدة",
      descEn: "Review new account applications",
      count: data.kpis.pending ?? 0,
      to: "/admin/users",
      tone: "sky",
      ctaAr: "اعتماد",
      ctaEn: "Approve",
    },
    {
      key: "invites",
      icon: <Bell className="size-5" />,
      ar: "دعوات بوابة نشطة",
      en: "Active portal invitations",
      descAr: "دعوات مالكين ومستأجرين لم تُقبل بعد",
      descEn: "Owner/tenant invitations not yet accepted",
      count: data.kpis.pendingInvites ?? 0,
      to: "/admin/portal-invitations",
      tone: "emerald",
      ctaAr: "متابعة",
      ctaEn: "Follow up",
    },
  ];

  const totalPending = items.reduce((s, i) => s + i.count, 0);

  const toneCls = (t: string) =>
    t === "emerald"
      ? "bg-success/10 text-success border-success/30"
      : t === "amber"
        ? "bg-warning/10 text-warning border-warning/30"
        : t === "sky"
          ? "bg-info/10 text-info border-info/30"
          : t === "rose"
            ? "bg-destructive/10 text-destructive border-destructive/30"
            : "bg-primary/10 text-primary border-primary/30";

  const quick: Array<{ to: string; icon: React.ReactNode; ar: string; en: string }> = [
    { to: "/admin/users", icon: <UserCog className="size-4" />, ar: "إضافة/إدارة مستخدم", en: "Users" },
    { to: "/admin/roles", icon: <KeyRound className="size-4" />, ar: "الأدوار والصلاحيات", en: "Roles & Permissions" },
    { to: "/admin/policies", icon: <Lock className="size-4" />, ar: "السياسات", en: "Policies" },
    { to: "/admin/companies", icon: <Building2 className="size-4" />, ar: "المنشآت", en: "Companies" },
    { to: "/admin/subscriptions", icon: <CreditCard className="size-4" />, ar: "الاشتراكات", en: "Subscriptions" },
    { to: "/admin/subscription-payments", icon: <Receipt className="size-4" />, ar: "الإيصالات", en: "Receipts" },
    { to: "/admin/portal-invitations", icon: <Bell className="size-4" />, ar: "دعوات البوابة", en: "Invitations" },
    { to: "/admin/audit-log", icon: <ScrollText className="size-4" />, ar: "سجل التدقيق", en: "Audit Log" },
    { to: "/admin/settings", icon: <Cog className="size-4" />, ar: "الإعدادات", en: "Settings" },
  ];

  return (
    <div className="surface-card p-5 border-primary/20 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" />
            {isAr ? "مركز القرارات والتحكم الموحّد" : "Unified Decision & Control Center"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "كل ما يحتاج قرارك في مكان واحد — الاشتراكات، الإيصالات، المستخدمون، الدعوات."
              : "Everything that needs your decision in one place — subscriptions, receipts, users, invitations."}
          </p>
        </div>
        <span
          className={
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold " +
            (totalPending > 0 ? toneCls("amber") : toneCls("emerald"))
          }
        >
          {totalPending > 0 ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
          {totalPending > 0
            ? isAr
              ? `${nf.format(totalPending)} عنصر بانتظار قرارك`
              : `${nf.format(totalPending)} items awaiting your decision`
            : isAr
              ? "لا توجد قرارات معلّقة"
              : "No pending decisions"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.key}
            className={
              "flex items-start gap-3 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md " +
              (it.count > 0 ? "border-" : "")
            }
          >
            <div className={"grid size-10 shrink-0 place-items-center rounded-lg " + toneCls(it.tone)}>
              {it.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold">{isAr ? it.ar : it.en}</div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums">
                  {nf.format(it.count)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                {isAr ? it.descAr : it.descEn}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={it.count > 0 ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setOpenKind(it.key)}
                >
                  {isAr ? it.ctaAr : it.ctaEn}
                </Button>
                <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                  <Link to={it.to}>
                    {isAr ? "الصفحة الكاملة" : "Full page"}
                    <ChevronLeft className="size-3 rtl:rotate-180" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground">
            {isAr ? "إجراءات سريعة وصلاحيات النظام" : "Quick actions & system controls"}
          </h4>
        </div>
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <Button key={q.to} asChild size="sm" variant="outline" className="h-8">
              <Link to={q.to} className="gap-1.5">
                {q.icon}
                <span className="text-xs">{isAr ? q.ar : q.en}</span>
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {openKind && (
        <DecisionSheet
          kind={openKind}
          open={openKind !== null}
          onOpenChange={(v) => {
            if (!v) setOpenKind(null);
          }}
          isAr={isAr}
        />
      )}
    </div>
  );
}

function timeAgo(iso: string, isAr: boolean) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return isAr ? `${s} ث` : `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return isAr ? `${m} د` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return isAr ? `${h} س` : `${h}h`;
  const d = Math.floor(h / 24);
  return isAr ? `${d} ي` : `${d}d`;
}

function FeedCard({
  title,
  icon,
  items,
  href,
  empty,
  isAr,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{
    key: string;
    primary: string;
    secondary: string;
    time: string;
    tone?: "emerald" | "rose";
  }>;
  href: string;
  empty: string;
  isAr: boolean;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
          {icon} {title}
        </h3>
        <Link
          to={href}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {isAr ? "عرض" : "View"} <ChevronLeft className="size-3 rtl:rotate-180" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y">
          {items.map((it) => (
            <li key={it.key} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{it.primary}</div>
                <div
                  className={
                    "truncate text-xs " +
                    (it.tone === "rose"
                      ? "text-destructive"
                      : it.tone === "emerald"
                        ? "text-success"
                        : "text-muted-foreground")
                  }
                >
                  {it.secondary}
                </div>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {timeAgo(it.time, isAr)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModuleLauncher({ isAr }: { isAr: boolean }) {
  const mods: Array<{
    to: string;
    icon: React.ReactNode;
    title: string;
    desc: string;
    tone: string;
  }> = [
    {
      to: "/admin/users",
      icon: <Users2 className="size-5" />,
      title: isAr ? "المستخدمون" : "Users",
      desc: isAr ? "اعتماد، تعليق، إعادة كلمة مرور" : "Approve, suspend, reset",
      tone: "primary",
    },
    {
      to: "/admin/companies",
      icon: <Building2 className="size-5" />,
      title: isAr ? "أرقام المنشآت" : "Establishment Numbers",
      desc: isAr ? "عرض وإعادة توليد HBS-XXXXXX" : "View & regenerate HBS-XXXXXX",
      tone: "sky",
    },
    {
      to: "/admin/roles",
      icon: <KeyRound className="size-5" />,
      title: isAr ? "الأدوار والصلاحيات" : "Roles & Permissions",
      desc: isAr ? "RBAC غير محدود" : "Unlimited RBAC",
      tone: "sky",
    },
    {
      to: "/admin/audit-log",
      icon: <ScrollText className="size-5" />,
      title: isAr ? "سجل التدقيق" : "Audit Log",
      desc: isAr ? "كل تغيير مُسجّل" : "Every change tracked",
      tone: "amber",
    },
    {
      to: "/admin/policies",
      icon: <Lock className="size-5" />,
      title: isAr ? "السياسات" : "Policies",
      desc: isAr ? "الأمان والامتثال" : "Security & compliance",
      tone: "rose",
    },
    {
      to: "/security/sessions",
      icon: <ShieldCheck className="size-5" />,
      title: isAr ? "الجلسات والأجهزة" : "Sessions & Devices",
      desc: isAr ? "مراقبة الدخول" : "Login monitoring",
      tone: "emerald",
    },
    {
      to: "/admin/report-branding",
      icon: <Palette className="size-5" />,
      title: isAr ? "الهوية والتقارير" : "Report Branding",
      desc: isAr ? "شعار، ألوان، PDF" : "Logo, colors, PDF",
      tone: "violet",
    },
    {
      to: "/dashboard/reports/templates",
      icon: <FileBarChart className="size-5" />,
      title: isAr ? "قوالب التقارير" : "Report Templates",
      desc: isAr ? "منشئ التقارير" : "Report builder",
      tone: "sky",
    },
    {
      to: "/dashboard/reports/executive",
      icon: <TrendingUp className="size-5" />,
      title: isAr ? "التقارير التنفيذية" : "Executive Reports",
      desc: isAr ? "KPIs مالية وتشغيلية" : "Financial & ops KPIs",
      tone: "emerald",
    },
    {
      to: "/assistant",
      icon: <Bot className="size-5" />,
      title: isAr ? "مركز الذكاء" : "AI Center",
      desc: isAr ? "مساعد وتحليل ذكي" : "Assistant & insights",
      tone: "primary",
    },
    {
      to: "/admin/telemetry-emails",
      icon: <ScrollText className="size-5" />,
      title: isAr ? "سجل رسائل التليمتري" : "Telemetry emails",
      desc: isAr ? "تنبيهات الطابور والحالة" : "Alert queue & status",
      tone: "amber",
    },
    {
      to: "/admin/filter-analytics",
      icon: <FileBarChart className="size-5" />,
      title: isAr ? "تحليلات الفلاتر" : "Filter analytics",
      desc: isAr ? "استخدام شريط الفلاتر عبر كل المستخدمين" : "Filter bar usage across all users",
      tone: "primary",
    },
    {
      to: "/admin/route-map",
      icon: <GitBranch className="size-5" />,
      title: isAr ? "خريطة المسارات" : "Route map",
      desc: isAr ? "مراجعة كل الروابط والوصول" : "Audit every URL & access",
      tone: "sky",
    },
    {
      to: "/settings/import",
      icon: <GitBranch className="size-5" />,
      title: isAr ? "الاستيراد والتكامل" : "Imports & Integrations",
      desc: isAr ? "CSV, API, Webhooks" : "CSV, API, Webhooks",
      tone: "violet",
    },
    {
      to: "/onboarding",
      icon: <Workflow className="size-5" />,
      title: isAr ? "سير العمل" : "Onboarding & Workflow",
      desc: isAr ? "خطوات التفعيل" : "Activation flows",
      tone: "emerald",
    },
    {
      to: "/team",
      icon: <Users2 className="size-5" />,
      title: isAr ? "الفريق" : "Team",
      desc: isAr ? "الأعضاء والدعوات" : "Members & invites",
      tone: "primary",
    },
    {
      to: "/dashboard/documents",
      icon: <FileText className="size-5" />,
      title: isAr ? "الوثائق" : "Documents",
      desc: isAr ? "مكتبة موحّدة" : "Central library",
      tone: "sky",
    },
    {
      to: "/dashboard",
      icon: <Globe className="size-5" />,
      title: isAr ? "لوحة العمليات" : "Ops Dashboard",
      desc: isAr ? "المنظر التشغيلي" : "Operational view",
      tone: "rose",
    },
  ];

  const toneCls = (t: string) =>
    t === "emerald"
      ? "bg-success/10 text-success"
      : t === "amber"
        ? "bg-warning/10 text-warning"
        : t === "sky"
          ? "bg-info/10 text-info"
          : t === "rose"
            ? "bg-destructive/10 text-destructive"
            : t === "violet"
              ? "bg-primary/10 text-primary"
              : "bg-primary/10 text-primary";

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
            <Cog className="size-4" /> {isAr ? "وحدات النظام" : "System modules"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "وصول سريع لكل ما يديره السوبر أدمن"
              : "Fast access to every super-admin surface"}
          </p>
        </div>
        <Link to="/dashboard" className="text-xs text-primary hover:underline">
          {isAr ? "عرض التطبيق" : "Open app"}
        </Link>
      </div>
      <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {mods.map((m) => (
          <motion.div
            key={m.to}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <Link
              to={m.to}
              className="group flex h-full items-start gap-3 rounded-xl border bg-card p-3.5 transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div
                className={
                  "grid size-10 shrink-0 place-items-center rounded-lg transition-transform group-hover:scale-110 " +
                  toneCls(m.tone)
                }
              >
                {m.icon}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{m.title}</div>
                <div className="line-clamp-2 text-[11px] text-muted-foreground">{m.desc}</div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  format,
  suffix,
  sub,
  delta,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  format?: (n: number) => string;
  suffix?: string;
  sub?: string;
  delta?: string;
  tone?: "primary" | "sky" | "emerald" | "amber";
}) {
  const toneCls =
    tone === "emerald"
      ? "bg-success/10 text-success"
      : tone === "amber"
        ? "bg-warning/10 text-warning"
        : tone === "sky"
          ? "bg-info/10 text-info"
          : "bg-primary/10 text-primary";
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="group cursor-pointer surface-card p-4 sm:p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] sm:text-xs text-muted-foreground truncate">{label}</div>
          <div className="mt-1.5 text-xl sm:text-display text-2xl tabular-nums">
            <AnimatedNumber value={value} format={format} suffix={suffix} />
          </div>

          {sub && <div className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</div>}
          {delta && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
              <TrendingUp className="size-3" /> {delta}
            </div>
          )}
        </div>
        <div
          className={
            "grid size-10 sm:size-11 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 " +
            toneCls
          }
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

function SystemHealthCard({
  isAr,
  data,
}: {
  isAr: boolean;
  data: {
    kpis: {
      loginSuccess24h: number;
      loginFailed24h: number;
      pendingReceipts: number;
      events24h: number;
    };
    generatedAt: string;
  };
}) {
  // Derive health from real signals returned by getAdminOverview.
  // If we got here, DB + Auth answered — otherwise Suspense/error boundary would have caught it.
  const total = data.kpis.loginSuccess24h + data.kpis.loginFailed24h;
  const failRatio = total > 0 ? data.kpis.loginFailed24h / total : 0;
  const loginTone: "emerald" | "amber" | "rose" =
    failRatio >= 0.3 ? "rose" : failRatio >= 0.1 ? "amber" : "emerald";
  const loginVal =
    total === 0
      ? isAr
        ? "لا محاولات"
        : "no attempts"
      : `${Math.round((1 - failRatio) * 100)}% ${isAr ? "نجاح" : "success"}`;

  const receiptsTone: "emerald" | "amber" = data.kpis.pendingReceipts > 0 ? "amber" : "emerald";
  const receiptsVal =
    data.kpis.pendingReceipts > 0
      ? `${data.kpis.pendingReceipts} ${isAr ? "معلّق" : "pending"}`
      : "OK";

  const eventsTone: "emerald" | "amber" = data.kpis.events24h > 0 ? "emerald" : "amber";
  const eventsVal =
    data.kpis.events24h > 0
      ? `${data.kpis.events24h} ${isAr ? "حدث/24س" : "events/24h"}`
      : isAr
        ? "لا نشاط"
        : "no activity";

  const rows: Array<{
    icon: React.ReactNode;
    label: string;
    val: string;
    tone: "emerald" | "sky" | "amber" | "rose";
  }> = [
    {
      icon: <CheckCircle2 className="size-4 text-success" />,
      label: isAr ? "قاعدة البيانات" : "Database",
      val: "OK",
      tone: "emerald",
    },
    {
      icon: <CheckCircle2 className="size-4 text-success" />,
      label: isAr ? "المصادقة" : "Auth",
      val: "OK",
      tone: "emerald",
    },
    {
      icon:
        loginTone === "emerald" ? (
          <CheckCircle2 className="size-4 text-success" />
        ) : (
          <AlertTriangle
            className={"size-4 " + (loginTone === "rose" ? "text-destructive" : "text-warning")}
          />
        ),
      label: isAr ? "نجاح الدخول (24س)" : "Logins (24h)",
      val: loginVal,
      tone: loginTone,
    },
    {
      icon:
        receiptsTone === "amber" ? (
          <AlertTriangle className="size-4 text-warning" />
        ) : (
          <CheckCircle2 className="size-4 text-success" />
        ),
      label: isAr ? "إيصالات الاشتراك" : "Subscription receipts",
      val: receiptsVal,
      tone: receiptsTone,
    },
    {
      icon: <ServerCog className="size-4 text-info" />,
      label: isAr ? "أحداث التدقيق" : "Audit events",
      val: eventsVal,
      tone: eventsTone === "amber" ? "amber" : "sky",
    },
  ];
  const toneBg = (t: "emerald" | "sky" | "amber") =>
    t === "emerald"
      ? "bg-success/10 text-success"
      : t === "sky"
        ? "bg-info/10 text-info"
        : "bg-warning/10 text-warning";
  const toneBgWithRose = (t: "emerald" | "sky" | "amber" | "rose") =>
    t === "rose" ? "bg-destructive/10 text-destructive" : toneBg(t);
  const lastCheck = new Date(data.generatedAt).toLocaleTimeString(isAr ? "ar-SA" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{isAr ? "حالة النظام" : "System health"}</h3>
        <span className="text-[11px] text-muted-foreground">
          {isAr ? "آخر فحص" : "Last check"}: {lastCheck}
        </span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 transition-all hover:bg-muted/60 hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              {r.icon}
              <span className="text-sm">{r.label}</span>
            </div>
            <span
              className={
                "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium " +
                toneBgWithRose(r.tone)
              }
            >
              {r.val}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
