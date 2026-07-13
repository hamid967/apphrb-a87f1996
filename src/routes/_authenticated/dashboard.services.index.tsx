import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2,
  FileText,
  Wallet,
  Wrench,
  BarChart3,
  Bot,
  Megaphone,
  Gavel,
  Users,
  CreditCard,
  ShieldCheck,
  Settings,
  LayoutDashboard,
  ArrowLeft,
  ArrowRight,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { CalendarClock, Archive, Wrench as WrenchIcon } from "lucide-react";
import { Sigma } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute(
  "/_authenticated/dashboard/services/",
)({
  head: () => sectionHead({ section: "dashboard", entityAr: "الخدمات", entityEn: "Services", path: "/dashboard/services" }),
  component: ServicesReportPage,
});

type Service = {
  id: string;
  to: string;
  icon: LucideIcon;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  featuresAr: string[];
  featuresEn: string[];
  category: "core" | "finance" | "ops" | "growth" | "admin" | "ai";
  hue: string; // tailwind gradient stops
};

const SERVICES: Service[] = [
  {
    id: "dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    titleAr: "لوحة التحكم",
    titleEn: "Dashboard",
    descAr: "نظرة عامة على المؤشرات والخدمات الأكثر استخدامًا.",
    descEn: "Overview of KPIs and most-used services.",
    featuresAr: ["بطاقات KPI", "توصيات ذكية", "خريطة السعودية التفاعلية"],
    featuresEn: ["KPI cards", "Smart recommendations", "Interactive Saudi map"],
    category: "core",
    hue: "from-primary/25 to-fuchsia-500/10",
  },
  {
    id: "valuation",
    to: "/dashboard/valuation",
    icon: Sparkles,
    titleAr: "التقييم الذكي بالـ AI",
    titleEn: "AI Valuation",
    descAr: "تقدير فوري لسعر البيع أو الإيجار مع مقارنات محلية وتوصيات لرفع القيمة.",
    descEn: "Instant sale/rent price estimates with local comparables and value tips.",
    featuresAr: ["تسعير فوري", "مقارنات محلية", "توصيات ذكية", "سجل التقييمات"],
    featuresEn: ["Instant pricing", "Local comparables", "Smart tips", "Valuation history"],
    category: "ai",
    hue: "from-primary/25 to-accent/10",
  },
  {
    id: "viewings",
    to: "/dashboard/viewings",
    icon: CalendarClock,
    titleAr: "حجز مواعيد الزيارات",
    titleEn: "Viewing Appointments",
    descAr: "جدولة جولات معاينة العقارات مع المستأجرين والمشترين وإدارة حالة كل موعد.",
    descEn: "Schedule property tours with prospective tenants/buyers and track each visit.",
    featuresAr: ["موعد جديد بضغطة", "تصفية بالحالة والفترة", "روابط اتصال وبريد", "مصادر متعددة"],
    featuresEn: ["One-click booking", "Filter by status & range", "Call/email links", "Multi-source"],
    category: "ops",
    hue: "from-info/25 to-info/10",
  },
  {
    id: "archive",
    to: "/dashboard/archive",
    icon: Archive,
    titleAr: "الأرشيف الإلكتروني",
    titleEn: "Electronic Archive",
    descAr: "أرشفة المستندات مع رفع الملفات وبحث ذكي وربط تلقائي بالعقارات والعملاء.",
    descEn: "Archive documents with uploads, smart search, and auto-linking to properties & clients.",
    featuresAr: ["رفع PDF/صور", "بحث بالعنوان والوسوم", "ربط تلقائي بالـ AI", "نسخ وإصدارات"],
    featuresEn: ["Upload PDFs/images", "Title & tag search", "AI auto-link", "Versioned files"],
    category: "ai",
    hue: "from-info/25 to-primary/10",
  },
  {
    id: "maintenance-log",
    to: "/dashboard/maintenance-log",
    icon: WrenchIcon,
    titleAr: "سجل الصيانة التفاعلي",
    titleEn: "Interactive Maintenance Log",
    descAr: "اربط بلاغات الصيانة بالفنيين وقطع الغيار وتابع الحالة والتكلفة لحظة بلحظة.",
    descEn: "Link tickets to technicians and spare parts with live status and cost tracking.",
    featuresAr: ["إسناد الفني بضغطة", "سجل قطع الغيار والتكلفة", "تحديث الحالة", "ملخّص لكل حالة"],
    featuresEn: ["One-click assignment", "Parts & cost ledger", "Status updates", "Per-status totals"],
    category: "ops",
    hue: "from-warning/25 to-warning/10",
  },
  {
    id: "properties",
    to: "/dashboard/properties",
    icon: Building2,
    titleAr: "إدارة العقارات",
    titleEn: "Property Management",
    descAr: "إدارة كاملة للعقارات والوحدات والتصنيفات.",
    descEn: "Full property, unit and classification management.",
    featuresAr: ["شقق/فلل/مكاتب/أراضٍ", "إضافة/تعديل/أرشفة", "حالات مفصلة"],
    featuresEn: ["Apartments/villas/offices/land", "CRUD + archive", "Detailed statuses"],
    category: "core",
    hue: "from-success/25 to-success/10",
  },
  {
    id: "contracts",
    to: "/dashboard/contracts",
    icon: FileText,
    titleAr: "العقود والإيجارات",
    titleEn: "Contracts & Leasing",
    descAr: "قوالب عقود جاهزة مع تذكيرات وسجل تدقيق.",
    descEn: "Contract templates with reminders and audit logs.",
    featuresAr: ["قوالب مرنة", "تذكيرات تجديد", "إيصالات وسندات"],
    featuresEn: ["Flexible templates", "Renewal reminders", "Receipts & vouchers"],
    category: "core",
    hue: "from-info/25 to-info/10",
  },
  {
    id: "accounting",
    to: "/accounting",
    icon: Wallet,
    titleAr: "المحاسبة",
    titleEn: "Accounting",
    descAr: "مصروفات، أرباح وخسائر، ضريبة القيمة المضافة (زاتكا).",
    descEn: "Expenses, P&L, and ZATCA VAT.",
    featuresAr: ["المصروفات", "P&L", "ضريبة القيمة المضافة", "تحويلات بنكية"],
    featuresEn: ["Expenses", "P&L", "VAT (ZATCA)", "Bank transfers"],
    category: "finance",
    hue: "from-warning/25 to-warning/10",
  },
  {
    id: "payments",
    to: "/dashboard/payments",
    icon: CreditCard,
    titleAr: "المدفوعات",
    titleEn: "Payments",
    descAr: "الفواتير والسندات وتتبع التحصيل.",
    descEn: "Invoices, vouchers and collection tracking.",
    featuresAr: ["فواتير", "سندات قبض/صرف", "تنبيهات استحقاق"],
    featuresEn: ["Invoices", "Receipts & vouchers", "Due alerts"],
    category: "finance",
    hue: "from-warning/25 to-warning/10",
  },
  {
    id: "maintenance",
    to: "/dashboard/maintenance",
    icon: Wrench,
    titleAr: "الصيانة",
    titleEn: "Maintenance",
    descAr: "طلبات صيانة مربوطة بالعقار والوحدة والفنيّ.",
    descEn: "Requests linked to property, unit and technician.",
    featuresAr: ["طلبات", "فنيّون", "ربط بالوحدة"],
    featuresEn: ["Requests", "Technicians", "Unit linking"],
    category: "ops",
    hue: "from-destructive/25 to-pink-500/10",
  },
  {
    id: "reports",
    to: "/dashboard/reports",
    icon: BarChart3,
    titleAr: "التقارير",
    titleEn: "Reports",
    descAr: "قوالب تقارير تنفيذية وباني تقارير مخصص + PDF.",
    descEn: "Executive templates + custom builder with PDF export.",
    featuresAr: ["قوالب جاهزة", "باني مخصص", "تصدير PDF"],
    featuresEn: ["Ready templates", "Custom builder", "PDF export"],
    category: "core",
    hue: "from-info/25 to-primary/10",
  },
  {
    id: "analytics-builder",
    to: "/reports/builder",
    icon: Sigma,
    titleAr: "باني تقارير التحليلات",
    titleEn: "Analytics Report Builder",
    descAr: "للمالية: أنشئ وجهات نظر مخصصة، احفظها كقوالب، وصدّر النتائج.",
    descEn: "For finance: build custom views, save as templates, and export results.",
    featuresAr: ["مصادر متعددة", "أعمدة وفلاتر", "قوالب محفوظة", "CSV/XLSX/JSON/PDF"],
    featuresEn: ["Multi source", "Columns & filters", "Saved views", "CSV/XLSX/JSON/PDF"],
    category: "core",
    hue: "from-primary/25 to-fuchsia-500/10",
  },
  {
    id: "assistant",
    to: "/assistant",
    icon: Bot,
    titleAr: "المساعد الذكي",
    titleEn: "AI Assistant",
    descAr: "محادثة ثنائية اللغة مع SQL آمن حسب الدور.",
    descEn: "Bilingual chat with role-based safe SQL.",
    featuresAr: ["عربي/إنجليزي", "أدوات تنفيذ آمنة", "سجل تدقيق"],
    featuresEn: ["AR/EN", "Safe tool-calls", "Audit trail"],
    category: "ai",
    hue: "from-primary/25 to-primary/10",
  },
  {
    id: "listings",
    to: "/listings",
    icon: Megaphone,
    titleAr: "الإعلانات والعملاء المحتملون",
    titleEn: "Listings & Leads",
    descAr: "إعلانات عامة + طلبات المستأجرين + CRM.",
    descEn: "Public listings, tenant applications and CRM.",
    featuresAr: ["إعلانات عامة", "طلبات مستأجرين", "CRM"],
    featuresEn: ["Public listings", "Tenant applications", "Leads CRM"],
    category: "growth",
    hue: "from-info/25 to-info/10",
  },
  {
    id: "auctions",
    to: "/dashboard/auctions",
    icon: Gavel,
    titleAr: "المزادات",
    titleEn: "Auctions",
    descAr: "مزادات عقارية مع فلاتر متقدمة.",
    descEn: "Property auctions with advanced filters.",
    featuresAr: ["إنشاء مزاد", "مزايدة", "فلاتر"],
    featuresEn: ["Create auction", "Bidding", "Filters"],
    category: "growth",
    hue: "from-warning/25 to-destructive/10",
  },
  {
    id: "portals",
    to: "/dashboard",
    icon: Users,
    titleAr: "البوابات",
    titleEn: "Portals",
    descAr: "بوابات المستأجر والمالك والموظف والعميل الذكي.",
    descEn: "Tenant, owner, employee and AI client portals.",
    featuresAr: ["مستأجر", "مالك", "موظف", "عميل AI"],
    featuresEn: ["Tenant", "Owner", "Employee", "AI client"],
    category: "growth",
    hue: "from-success/25 to-success/10",
  },
  {
    id: "subscriptions",
    to: "/dashboard/settings/billing",
    icon: Sparkles,
    titleAr: "الاشتراكات والفوترة",
    titleEn: "Subscriptions & Billing",
    descAr: "خطط Starter/Pro/Enterprise مع تحويل بنكي يدوي.",
    descEn: "Starter/Pro/Enterprise plans via manual bank transfer.",
    featuresAr: ["خطط متعددة", "تحويل بنكي", "تجديد تلقائي"],
    featuresEn: ["Multiple plans", "Bank transfer", "Auto-renew"],
    category: "finance",
    hue: "from-fuchsia-500/25 to-pink-500/10",
  },
  {
    id: "security",
    to: "/dashboard/settings",
    icon: ShieldCheck,
    titleAr: "الأمان",
    titleEn: "Security",
    descAr: "مصادقة ثنائية TOTP وأمان على مستوى الصفوف.",
    descEn: "TOTP 2FA and row-level security.",
    featuresAr: ["2FA/TOTP", "RLS", "أدوار وصلاحيات"],
    featuresEn: ["2FA/TOTP", "RLS", "RBAC"],
    category: "admin",
    hue: "from-lime-500/25 to-success/10",
  },
  {
    id: "settings",
    to: "/dashboard/settings",
    icon: Settings,
    titleAr: "الإعدادات",
    titleEn: "Settings",
    descAr: "معلومات الشركة والفروع وواجهات API.",
    descEn: "Company info, branches and APIs.",
    featuresAr: ["الشركة/الفروع", "API/زاتكا", "استيراد جماعي"],
    featuresEn: ["Company/branches", "APIs/ZATCA", "Bulk import"],
    category: "admin",
    hue: "from-slate-400/25 to-slate-500/10",
  },
  {
    id: "admin",
    to: "/admin",
    icon: LayoutDashboard,
    titleAr: "لوحة الإدارة",
    titleEn: "Admin Panel",
    descAr: "الشركات، الاشتراكات، المقاييس، القوالب.",
    descEn: "Companies, subscriptions, metrics and templates.",
    featuresAr: ["الشركات", "الفوترة", "التشخيص"],
    featuresEn: ["Companies", "Billing", "Diagnostics"],
    category: "admin",
    hue: "from-destructive/25 to-destructive/10",
  },
];

type CategoryKey = "all" | Service["category"];

const CATEGORIES: { key: CategoryKey; ar: string; en: string }[] = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "core", ar: "أساسية", en: "Core" },
  { key: "finance", ar: "مالية", en: "Finance" },
  { key: "ops", ar: "تشغيل", en: "Operations" },
  { key: "growth", ar: "نمو", en: "Growth" },
  { key: "ai", ar: "الذكاء الاصطناعي", en: "AI" },
  { key: "admin", ar: "الإدارة", en: "Admin" },
];

function ServicesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CategoryKey>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SERVICES.filter((s) => {
      if (cat !== "all" && s.category !== cat) return false;
      if (!q) return true;
      const hay = [
        s.titleAr,
        s.titleEn,
        s.descAr,
        s.descEn,
        ...s.featuresAr,
        ...s.featuresEn,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, cat]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 end-[-4rem] h-52 w-52 rounded-full bg-primary/20 blur-3xl"
        />
        <Badge variant="secondary" className="mb-3">
          {isAr ? "تقرير الخدمات" : "Services Report"}
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {isAr
            ? "جميع خدمات منصة عقاري في مكان واحد"
            : "All HBSpro services in one place"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {isAr
            ? "استعرض الأقسام كبطاقات تفاعلية، ابحث بسرعة، وتنقّل مباشرة إلى الخدمة التي تحتاجها."
            : "Browse sections as interactive cards, search fast, and jump straight to the service you need."}
        </p>

        {/* Search + filters */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground start-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? "ابحث عن خدمة..." : "Search services..."}
              className="ps-9"
              aria-label={isAr ? "بحث" : "Search"}
            />
          </div>
          <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((c) => {
              const active = cat === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCat(c.key)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {isAr ? c.ar : c.en}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quick nav */}
      <nav
        aria-label={isAr ? "تنقّل سريع" : "Quick navigation"}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {filtered.map((s) => (
          <a
            key={s.id}
            href={`#svc-${s.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            <s.icon className="size-3.5" />
            {isAr ? s.titleAr : s.titleEn}
          </a>
        ))}
      </nav>

      {/* Cards grid */}
      <motion.section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.04 } },
        }}
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((s) => {
            const Icon = s.icon;
            return (
              <motion.article
                id={`svc-${s.id}`}
                key={s.id}
                layout
                variants={{
                  hidden: { opacity: 0, y: 16, scale: 0.97 },
                  show: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 260, damping: 22 },
                  },
                }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                whileHover={{ y: -4 }}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[0_4px_20px_-12px_hsl(var(--primary)/0.35)] transition-colors hover:border-primary/40"
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-0 -top-12 h-32 bg-gradient-to-b ${s.hue} opacity-70 blur-2xl`}
                />
                <div className="relative z-10 flex items-start justify-between gap-3">
                  <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="size-5" />
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {isAr
                      ? CATEGORIES.find((c) => c.key === s.category)?.ar
                      : CATEGORIES.find((c) => c.key === s.category)?.en}
                  </Badge>
                </div>
                <h2 className="relative z-10 mt-4 text-base font-bold text-foreground">
                  {isAr ? s.titleAr : s.titleEn}
                </h2>
                <p className="relative z-10 mt-1 text-xs text-muted-foreground">
                  {isAr ? s.descAr : s.descEn}
                </p>
                <ul className="relative z-10 mt-3 flex flex-wrap gap-1.5">
                  {(isAr ? s.featuresAr : s.featuresEn).map((f) => (
                    <li
                      key={f}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="relative z-10 mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    {isAr ? "افتح الخدمة" : "Open service"}
                  </span>
                  <Link
                    to={s.to}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-primary-foreground"
                  >
                    {isAr ? "فتح" : "Open"}
                    <motion.span
                      animate={{ x: [0, isAr ? -3 : 3, 0] }}
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="inline-flex"
                    >
                      <Arrow className="size-3.5" />
                    </motion.span>
                  </Link>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </motion.section>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد نتائج مطابقة." : "No matching services."}
        </div>
      )}
    </div>
  );
}
