import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  Cog,
  CreditCard,
  DatabaseBackup,
  FileBarChart,
  Gavel,
  Inbox,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  Lock,
  Mail,
  MessageSquare,
  Package,
  Palette,
  ScrollText,
  ShieldCheck,
  TrendingUp,
  Users2,
  Wallet,
  Wrench,
} from "lucide-react";

export type AdminNavigationItem = {
  to: string;
  exact?: boolean;
  icon: LucideIcon;
  ar: string;
  en: string;
};

export type AdminNavigationGroup = {
  id: string;
  icon: LucideIcon;
  ar: string;
  en: string;
  items: AdminNavigationItem[];
};

export const adminNavigationGroups: AdminNavigationGroup[] = [
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
      {
        to: "/admin/subscriptions",
        icon: CreditCard,
        ar: "طلبات الاشتراك",
        en: "Subscription Requests",
      },
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
      {
        to: "/admin/signup-requests",
        icon: Inbox,
        ar: "طلبات تسجيل حامد",
        en: "Voice Signup Requests",
      },
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
        to: "/admin/search-insights",
        icon: TrendingUp,
        ar: "تحليلات البحث",
        en: "Search Analytics",
      },
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
      { to: "/admin/settings", icon: Cog, ar: "الإعدادات", en: "Settings" },
    ],
  },
];
