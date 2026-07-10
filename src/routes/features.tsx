import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle, BrandMark } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Building2,
  FileText,
  Receipt,
  Wallet,
  Wrench,
  Users,
  BarChart3,
  Bell,
  Bot,
  Calendar,
  ShieldCheck,
  Languages,
  Archive,
  Handshake,
  MessageSquare,
  FileCheck2,
} from "lucide-react";

const CANONICAL = "https://hrhbs.com/features";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "المزايا — HBSpro | Features" },
      {
        name: "description",
        content:
          "استكشف مزايا HBSpro: إدارة العقارات والوحدات، العقود، الفواتير الإلكترونية ZATCA، السندات، الصيانة، المساعد الذكي، والتقارير التنفيذية — كل ذلك بواجهة ثنائية اللغة.",
      },
      { property: "og:title", content: "مزايا HBSpro — منصة إدارة العقارات الذكية" },
      {
        property: "og:description",
        content:
          "أكثر من 16 وحدة تشغيلية: عقود، فواتير ZATCA، سندات، صيانة، تسويق، عمولات، مساعد ذكي، وأرشيف إلكتروني.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "مزايا HBSpro — Features" },
      {
        name: "twitter:description",
        content: "منصة SaaS واحدة لكل عمليات إدارة العقارات في المملكة.",
      },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "HBSpro Features",
          itemListElement: [
            "Property & Unit Management",
            "Contracts & E-Signature",
            "ZATCA E-Invoicing",
            "Vouchers & Payments",
            "Maintenance Workflows",
            "Bilingual AI Assistant",
            "Executive Reports",
            "Marketing & Listings CRM",
          ].map((name, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name,
          })),
        }),
      },
    ],
  }),
  component: FeaturesPage,
});

type Feature = {
  key: string;
  icon: typeof Building2;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  group: "ops" | "finance" | "intelligence" | "compliance";
};

const features: Feature[] = [
  {
    key: "properties",
    icon: Building2,
    group: "ops",
    titleAr: "العقارات والوحدات",
    titleEn: "Properties & Units",
    descAr: "شجرة كاملة للمباني والوحدات مع الحالة، الإيجار، والمستأجر الحالي.",
    descEn: "Complete tree of buildings and units with status, rent, and current tenant.",
  },
  {
    key: "tenants",
    icon: Users,
    group: "ops",
    titleAr: "المستأجرون",
    titleEn: "Tenants",
    descAr: "ملفات مستأجرين موحّدة مع الوثائق، العقود، والمدفوعات في مكان واحد.",
    descEn: "Unified tenant files with documents, contracts, and payments in one place.",
  },
  {
    key: "contracts",
    icon: FileText,
    group: "ops",
    titleAr: "العقود والتوقيع الإلكتروني",
    titleEn: "Contracts & E-Signature",
    descAr: "توليد العقود، الجدولة الهجرية/الميلادية، والتجديد التلقائي.",
    descEn: "Generate contracts, Hijri/Gregorian scheduling, and auto-renewal.",
  },
  {
    key: "maintenance",
    icon: Wrench,
    group: "ops",
    titleAr: "طلبات الصيانة",
    titleEn: "Maintenance Requests",
    descAr: "بوابة مستأجر لرفع الطلبات، تعيين الفنيين، وتتبّع التكلفة.",
    descEn: "Tenant portal to submit requests, assign technicians, and track cost.",
  },
  {
    key: "invoicing",
    icon: FileCheck2,
    group: "finance",
    titleAr: "الفوترة الإلكترونية ZATCA",
    titleEn: "ZATCA E-Invoicing",
    descAr: "فواتير موقّعة CSID وUBL 2.1 مرسلة إلى بوابة فاتورة تلقائياً.",
    descEn: "CSID-signed invoices and UBL 2.1 submitted to Fatoora automatically.",
  },
  {
    key: "vouchers",
    icon: Receipt,
    group: "finance",
    titleAr: "سندات القبض والصرف",
    titleEn: "Receipt & Payment Vouchers",
    descAr: "سندات مرقّمة، مطابقة بنكية، وربط مباشر بالفواتير والمصروفات.",
    descEn: "Numbered vouchers, bank reconciliation, and direct link to invoices and expenses.",
  },
  {
    key: "payments",
    icon: Wallet,
    group: "finance",
    titleAr: "جداول الدفع",
    titleEn: "Payment Schedules",
    descAr: "توليد الأقساط تلقائياً حسب العقد، وتحويلها إلى فواتير جاهزة.",
    descEn: "Auto-generate installments per contract and convert to ready invoices.",
  },
  {
    key: "commissions",
    icon: Handshake,
    group: "finance",
    titleAr: "العمولات والوسطاء",
    titleEn: "Commissions & Brokers",
    descAr: "احتساب عمولات الوسطاء تلقائياً مع كشوف صرف قابلة للتصدير.",
    descEn: "Auto-calculate broker commissions with exportable payout statements.",
  },
  {
    key: "reports",
    icon: BarChart3,
    group: "intelligence",
    titleAr: "التقارير التنفيذية",
    titleEn: "Executive Reports",
    descAr: "لوحات KPI لحظية: الإشغال، التحصيل، وربحية كل عقار.",
    descEn: "Real-time KPI dashboards: occupancy, collections, and per-property profitability.",
  },
  {
    key: "ai",
    icon: Bot,
    group: "intelligence",
    titleAr: "المساعد الذكي",
    titleEn: "AI Assistant",
    descAr: "مساعد ثنائي اللغة يقرأ العقود، يحسب المؤشرات، ويولّد التقارير بالمحادثة.",
    descEn: "Bilingual agent that reads contracts, computes KPIs, and drafts reports in chat.",
  },
  {
    key: "notifications",
    icon: Bell,
    group: "intelligence",
    titleAr: "إشعارات SMS وواتساب",
    titleEn: "SMS & WhatsApp Alerts",
    descAr: "تذكيرات آلية بالإيجار، انتهاء العقد، وطلبات الصيانة.",
    descEn: "Automated reminders for rent, contract expiry, and maintenance requests.",
  },
  {
    key: "listings",
    icon: MessageSquare,
    group: "intelligence",
    titleAr: "تسويق ووحدات معروضة (CRM)",
    titleEn: "Listings & Leads CRM",
    descAr: "نشر الوحدات، متابعة العملاء المحتملين، وتحويلهم إلى عقود.",
    descEn: "Publish units, track leads, and convert them into contracts.",
  },
  {
    key: "hijri",
    icon: Calendar,
    group: "compliance",
    titleAr: "دعم التقويم الهجري",
    titleEn: "Hijri Calendar Support",
    descAr: "عقود، أقساط، وتقارير بالتقويم الهجري والميلادي جنباً إلى جنب.",
    descEn: "Contracts, installments, and reports in Hijri and Gregorian side by side.",
  },
  {
    key: "rls",
    icon: ShieldCheck,
    group: "compliance",
    titleAr: "عزل بيانات صارم",
    titleEn: "Strict Data Isolation",
    descAr: "سياسات RLS على مستوى قاعدة البيانات — لا تداخل بين الشركات.",
    descEn: "Database-level RLS policies — zero cross-company leakage.",
  },
  {
    key: "archive",
    icon: Archive,
    group: "compliance",
    titleAr: "الأرشيف الإلكتروني",
    titleEn: "E-Archive",
    descAr: "تخزين آمن لكل الوثائق مع بحث فوري وربط بالسجلات.",
    descEn: "Secure storage of every document with instant search and record linkage.",
  },
  {
    key: "bilingual",
    icon: Languages,
    group: "compliance",
    titleAr: "واجهة ثنائية اللغة (RTL/LTR)",
    titleEn: "Bilingual UI (RTL/LTR)",
    descAr: "تبديل فوري بين العربية والإنجليزية عبر كل الوحدات والتقارير.",
    descEn: "Instant switch between Arabic and English across every module and report.",
  },
];

const groups = {
  ops: { ar: "التشغيل اليومي", en: "Daily Operations" },
  finance: { ar: "المالية والفوترة", en: "Finance & Billing" },
  intelligence: { ar: "الذكاء والتواصل", en: "Intelligence & Outreach" },
  compliance: { ar: "الامتثال والحوكمة", en: "Compliance & Governance" },
} as const;

function FeaturesPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language !== "en";

  return (
    <div className="min-h-screen theme-luxe" dir={isAr ? "rtl" : "ltr"}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/platform" className="hover:text-foreground">
              {isAr ? "المنصة" : "Platform"}
            </Link>
            <Link to="/features" className="text-foreground font-medium">
              {isAr ? "المزايا" : "Features"}
            </Link>
            <Link to="/pricing" className="hover:text-foreground">
              {isAr ? "الأسعار" : "Pricing"}
            </Link>
            <Link to="/compare" className="hover:text-foreground">
              {isAr ? "المقارنة" : "Compare"}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button asChild size="sm">
              <Link to="/auth">{isAr ? "ابدأ" : "Start"}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs uppercase tracking-widest text-primary">
              {isAr ? "مزايا HBSpro" : "HBSpro Features"}
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              {isAr
                ? "كل ما تحتاجه لإدارة العقار — في منصة واحدة."
                : "Everything real estate needs — in one platform."}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              {isAr
                ? "16 وحدة تشغيلية متكاملة تغطي العمليات، المالية، الذكاء، والامتثال — بدون تكامل يدوي."
                : "16 integrated modules covering operations, finance, intelligence, and compliance — no manual glue."}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  {isAr ? "ابدأ التجربة المجانية" : "Start free trial"}
                  <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/pricing">{isAr ? "شاهد الأسعار" : "See pricing"}</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature groups */}
      {(Object.keys(groups) as Array<keyof typeof groups>).map((g, gi) => {
        const items = features.filter((f) => f.group === g);
        return (
          <section
            key={g}
            className={`border-t border-border/40 py-16 md:py-20 ${
              gi % 2 === 1 ? "bg-card/30" : ""
            }`}
          >
            <div className="mx-auto max-w-6xl px-4">
              <div className="mb-10">
                <h2 className="text-2xl font-bold text-foreground md:text-3xl">
                  {isAr ? groups[g].ar : groups[g].en}
                </h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {items.map((f, i) => (
                  <motion.div
                    key={f.key}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                    className="rounded-2xl border border-border/40 bg-card/50 p-6 backdrop-blur-sm"
                  >
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                      {isAr ? f.titleAr : f.titleEn}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {isAr ? f.descAr : f.descEn}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* CTA */}
      <section className="border-t border-border/40 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">
            {isAr ? "جاهز لتجربة المزايا بنفسك؟" : "Ready to try every feature yourself?"}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {isAr
              ? "ابدأ 30 يوماً مجاناً — بدون بطاقة، مع ترحيل بياناتك في أسبوع."
              : "Start a 30-day free trial — no card, with data migrated in a week."}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                {isAr ? "ابدأ الآن" : "Get started"}
                <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/contact">{isAr ? "تحدّث مع المبيعات" : "Talk to sales"}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
