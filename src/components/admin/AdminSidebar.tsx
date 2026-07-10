import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion, LayoutGroup } from "motion/react";
import {
  LayoutDashboard,
  Users2,
  Building2,
  KeyRound,
  ScrollText,
  Lock,
  Palette,
  FileBarChart,
  Bell,
  TrendingUp,
  CreditCard,
  Cog,
  Sparkles,
  LineChart,
  ShieldCheck,
  Wallet,
  BarChart3,
  Wrench,
  Activity,
  Radio,
  Gavel,
  Package,
  LifeBuoy,
  DatabaseBackup,
  Mail,
  MessageSquare,
  Landmark,
  Inbox,
  Filter,
  Map,
  MailCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

type Item = { to: string; exact?: boolean; icon: typeof Users2; ar: string; en: string };
type Group = { id: string; icon: typeof Users2; ar: string; en: string; items: Item[] };

const GROUPS: Group[] = [
  {
    id: "overview",
    icon: LayoutDashboard,
    ar: "نظرة عامة",
    en: "Overview",
    items: [
      { to: "/admin", exact: true, icon: LayoutDashboard, ar: "مركز التحكم", en: "Control Center" },
    ],
  },
  {
    id: "access",
    icon: ShieldCheck,
    ar: "المستخدمون والوصول",
    en: "Users & Access",
    items: [
      { to: "/admin/users", icon: Users2, ar: "المستخدمون", en: "Users" },
      { to: "/admin/roles", icon: KeyRound, ar: "الأدوار", en: "Roles" },
      { to: "/admin/policies", icon: Lock, ar: "السياسات", en: "Policies" },
      { to: "/admin/portal-invitations", icon: Bell, ar: "دعوات البوابة", en: "Invitations" },
    ],
  },
  {
    id: "billing",
    icon: Wallet,
    ar: "المنشآت والفوترة",
    en: "Companies & Billing",
    items: [
      { to: "/admin/companies", icon: Building2, ar: "المنشآت", en: "Companies" },
      { to: "/admin/subscriptions", icon: CreditCard, ar: "طلبات الاشتراك", en: "Subscription Requests" },
      { to: "/admin/subscription-payments", icon: CreditCard, ar: "الإيصالات", en: "Receipts" },
      { to: "/admin/plans", icon: Package, ar: "الباقات", en: "Plans" },
      { to: "/admin/billing-metrics", icon: LineChart, ar: "مؤشرات الفوترة", en: "Billing KPIs" },
    ],
  },
  {
    id: "platform",
    icon: Cog,
    ar: "إعدادات المنصة",
    en: "Platform Settings",
    items: [
      { to: "/admin/email-providers", icon: Mail, ar: "مزودو البريد", en: "Email Providers" },
      { to: "/admin/sms-providers", icon: MessageSquare, ar: "مزودو الرسائل", en: "SMS Providers" },
      { to: "/admin/banks", icon: Landmark, ar: "البنوك", en: "Banks" },
      { to: "/admin/backups", icon: DatabaseBackup, ar: "النسخ الاحتياطي", en: "Backups" },
    ],
  },
  {
    id: "support",
    icon: LifeBuoy,
    ar: "الدعم والتفاعل",
    en: "Support & Engagement",
    items: [
      { to: "/admin/support", icon: LifeBuoy, ar: "تذاكر الدعم", en: "Support Tickets" },
      { to: "/admin/demo-requests", icon: Inbox, ar: "طلبات العرض", en: "Demo Requests" },
      { to: "/admin/signup-requests", icon: Inbox, ar: "طلبات تسجيل حامد", en: "Voice Signup Requests" },
    ],
  },
  {
    id: "reports",
    icon: BarChart3,
    ar: "التقارير والتحليلات",
    en: "Reports & Analytics",
    items: [
      { to: "/admin/report-branding", icon: Palette, ar: "الهوية البصرية", en: "Branding" },
      { to: "/admin/report-intro", icon: FileBarChart, ar: "قوالب التقارير", en: "Templates" },
      {
        to: "/admin/intro-analytics",
        icon: Sparkles,
        ar: "تحليلات المقدمة",
        en: "Intro Analytics",
      },
      { to: "/admin/search-insights", icon: TrendingUp, ar: "مصادر البحث", en: "Search Insights" },
      { to: "/admin/filter-analytics", icon: Filter, ar: "تحليلات الفلاتر", en: "Filter Analytics" },
    ],
  },
  {
    id: "system",
    icon: Wrench,
    ar: "النظام والصيانة",
    en: "System & Maintenance",
    items: [
      { to: "/admin/audit-log", icon: ScrollText, ar: "سجل التدقيق", en: "Audit Log" },
      { to: "/admin/decision-log", icon: Gavel, ar: "سجل قرارات الإدارة", en: "Decision Log" },
      { to: "/admin/telemetry", icon: Activity, ar: "التليمتري", en: "Telemetry" },
      {
        to: "/admin/notifications-queue",
        icon: Bell,
        ar: "طابور الإشعارات",
        en: "Notifications Queue",
      },
      {
        to: "/admin/cron-runs",
        icon: Activity,
        ar: "مهام الجدولة (cron)",
        en: "Scheduled jobs (cron)",
      },
      {
        to: "/admin/realtime-diagnostics",
        icon: Radio,
        ar: "تشخيص الاتصال المباشر",
        en: "Realtime Diagnostics",
      },

      { to: "/admin/telemetry-emails", icon: MailCheck, ar: "تليمتري البريد", en: "Email Telemetry" },
      { to: "/admin/route-map", icon: Map, ar: "خريطة المسارات", en: "Route Map" },
      { to: "/admin/settings", icon: Cog, ar: "الإعدادات", en: "Settings" },
    ],
  },
];

export function AdminSidebar() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <Sidebar collapsible="icon" side={isAr ? "right" : "left"}>
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
            <ShieldCheck className="size-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">
                {isAr ? "لوحة الإدارة" : "Admin Panel"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {isAr ? "Super Admin" : "Super Admin"}
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <LayoutGroup id="admin-nav">
          {GROUPS.map((g) => {
            const groupActive = g.items.some((it) => isActive(it.to, it.exact));
            return (
              <SidebarGroup key={g.id}>
                {!collapsed && (
                  <SidebarGroupLabel className={groupActive ? "text-primary" : undefined}>
                    {isAr ? g.ar : g.en}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.map((it) => {
                      const active = isActive(it.to, it.exact);
                      const Icon = it.icon;
                      return (
                        <SidebarMenuItem key={it.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={isAr ? it.ar : it.en}
                            className="relative data-[active=true]:bg-transparent"
                          >
                            <Link to={it.to} className="relative flex items-center gap-2">
                              {active && (
                                <motion.span
                                  layoutId="admin-nav-active"
                                  className="absolute inset-0 rounded-md bg-sidebar-accent"
                                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                  aria-hidden="true"
                                />
                              )}
                              {active && (
                                <motion.span
                                  layoutId="admin-nav-bar"
                                  className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-primary"
                                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                  aria-hidden="true"
                                />
                              )}
                              <span className="relative z-10 flex items-center gap-2">
                                <Icon className="size-4 shrink-0" />
                                {!collapsed && (
                                  <span className="truncate">{isAr ? it.ar : it.en}</span>
                                )}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </LayoutGroup>
      </SidebarContent>
    </Sidebar>
  );
}


/** Breadcrumb helper: resolves the current group + item labels from pathname. */
export function useAdminBreadcrumb() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  for (const g of GROUPS) {
    for (const it of g.items) {
      const active = it.exact
        ? pathname === it.to
        : pathname === it.to || pathname.startsWith(it.to + "/");
      if (active) {
        return {
          group: isAr ? g.ar : g.en,
          item: isAr ? it.ar : it.en,
        };
      }
    }
  }
  return { group: isAr ? "الإدارة" : "Admin", item: "" };
}
