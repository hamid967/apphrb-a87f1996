import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle, BrandMark } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Home,
  Shield,
  Database,
  Languages,
  Zap,
  Building2,
  FileCheck2,
  Cloud,
  Cpu,
  Sparkles,
} from "lucide-react";

const CANONICAL = "https://hrhbs.com/platform";

export const Route = createFileRoute("/platform")({
  head: () => ({
    meta: [
      { title: "منصة HBSpro — البنية التقنية للعقار الذكي | HBSpro Platform" },
      {
        name: "description",
        content:
          "منصة HBSpro موحّدة لإدارة العقارات: بنية متعددة المستأجرين، عزل بيانات على مستوى الصفوف، توافق ZATCA وPDPL، ذكاء اصطناعي ثنائي اللغة، ونشر سحابي داخل المملكة.",
      },
      { property: "og:title", content: "منصة HBSpro — البنية التقنية للعقار الذكي" },
      {
        property: "og:description",
        content:
          "منصة SaaS متكاملة مبنية على بنية متعددة المستأجرين، توافق ZATCA وPDPL، ومساعد ذكي عربي—إنجليزي.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "HBSpro",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: {
            "@type": "Offer",
            price: "499",
            priceCurrency: "SAR",
          },
          url: CANONICAL,
          description:
            "Unified Saudi property-management SaaS: multi-tenant, ZATCA-compliant, bilingual AI.",
        }),
      },
    ],
  }),
  component: PlatformPage,
});

type Pillar = {
  key: string;
  icon: typeof Shield;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
};

const pillars: Pillar[] = [
  {
    key: "multitenant",
    icon: Building2,
    titleAr: "بنية متعددة المستأجرين",
    titleEn: "Multi-Tenant Architecture",
    descAr: "كل شركة مساحة معزولة بالكامل مع company_id على كل جدول تشغيلي، بلا تسريب بيانات.",
    descEn: "Every company gets a fully isolated workspace with company_id on every operational table—zero data leakage.",
  },
  {
    key: "rls",
    icon: Shield,
    titleAr: "عزل على مستوى الصفوف (RLS)",
    titleEn: "Row-Level Security",
    descAr: "سياسات Postgres تفرض العزل داخل قاعدة البيانات نفسها، لا في الواجهة فقط.",
    descEn: "Postgres RLS policies enforce isolation at the database layer—never UI-only.",
  },
  {
    key: "zatca",
    icon: FileCheck2,
    titleAr: "توافق ZATCA المرحلة الثانية",
    titleEn: "ZATCA Phase-2 Compliant",
    descAr: "فوترة إلكترونية موقّعة رقمياً بـ CSID، وXML UBL 2.1 مرسل مباشرة إلى بوابة فاتورة.",
    descEn: "Digitally signed e-invoices with CSID, UBL 2.1 XML submitted directly to Fatoora.",
  },
  {
    key: "pdpl",
    icon: Database,
    titleAr: "PDPL — البيانات داخل المملكة",
    titleEn: "PDPL — In-Kingdom Data",
    descAr: "بنية تحتية سحابية داخل السعودية، متوافقة مع نظام حماية البيانات الشخصية.",
    descEn: "Cloud infrastructure hosted inside Saudi Arabia, aligned with the PDPL law.",
  },
  {
    key: "ai",
    icon: Sparkles,
    titleAr: "مساعد ذكي عربي—إنجليزي",
    titleEn: "Bilingual AI Assistant",
    descAr: "وكيل ذكي يفهم مصطلحات العقار السعودي، يقرأ العقود، ويولّد تقارير تنفيذية.",
    descEn: "An agent that understands Saudi real-estate terminology, reads contracts, and drafts executive reports.",
  },
  {
    key: "bilingual",
    icon: Languages,
    titleAr: "ثنائي اللغة بالكامل",
    titleEn: "Fully Bilingual",
    descAr: "واجهة، تقارير، فواتير، وإشعارات بالعربية RTL والإنجليزية LTR — مفتاح واحد.",
    descEn: "UI, reports, invoices, and notifications in Arabic (RTL) and English (LTR)—a single toggle.",
  },
];

type Stack = {
  key: string;
  icon: typeof Cpu;
  labelAr: string;
  labelEn: string;
  valueAr: string;
  valueEn: string;
};

const stack: Stack[] = [
  { key: "runtime", icon: Zap, labelAr: "تشغيل", labelEn: "Runtime", valueAr: "Edge — Cloudflare Workers", valueEn: "Edge — Cloudflare Workers" },
  { key: "db", icon: Database, labelAr: "قاعدة البيانات", labelEn: "Database", valueAr: "Postgres مع RLS", valueEn: "Postgres with RLS" },
  { key: "framework", icon: Cpu, labelAr: "الإطار", labelEn: "Framework", valueAr: "TanStack Start · React 19", valueEn: "TanStack Start · React 19" },
  { key: "cloud", icon: Cloud, labelAr: "الاستضافة", labelEn: "Hosting", valueAr: "داخل المملكة العربية السعودية", valueEn: "Inside the Kingdom of Saudi Arabia" },
];

function PlatformPage() {
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
            <Link to="/platform" className="text-foreground font-medium">
              {isAr ? "المنصة" : "Platform"}
            </Link>
            <Link to="/services" className="hover:text-foreground">
              {isAr ? "الخدمات" : "Services"}
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
              <Home className="h-3.5 w-3.5" />
              {isAr ? "منصة HBSpro" : "HBSpro Platform"}
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-6xl">
              {isAr ? "البنية التقنية للعقار الذكي." : "The Operating System for Saudi Real Estate."}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              {isAr
                ? "منصة SaaS واحدة — متعددة المستأجرين، متوافقة مع ZATCA وPDPL، مبنية على الذكاء الاصطناعي، مستضافة داخل المملكة."
                : "One SaaS platform — multi-tenant, ZATCA & PDPL compliant, AI-native, hosted inside the Kingdom."}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  {isAr ? "ابدأ التجربة المجانية" : "Start free trial"}
                  <ArrowRight className="ms-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/services">{isAr ? "استكشف الوحدات" : "Explore modules"}</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pillars */}
      <section className="border-t border-border/40 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              {isAr ? "ستة أعمدة تشغّل المنصة" : "Six pillars power the platform"}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {isAr
                ? "قرارات معمارية متعمّدة — لا حلول مؤقتة."
                : "Deliberate architectural choices — no shortcuts."}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p, i) => (
              <motion.div
                key={p.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="rounded-2xl border border-border/40 bg-card/50 p-6 backdrop-blur-sm"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {isAr ? p.titleAr : p.titleEn}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isAr ? p.descAr : p.descEn}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="border-t border-border/40 bg-card/30 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-foreground md:text-4xl">
              {isAr ? "شفافية تامة في البنية التقنية" : "Full technical transparency"}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {isAr
                ? "نُعلن الأدوات التي نبني عليها — لأن المؤسسات تستحق أن تعرف."
                : "We disclose the tools we build on—because enterprises deserve to know."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stack.map((s) => (
              <div
                key={s.key}
                className="rounded-xl border border-border/40 bg-background/60 p-5"
              >
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {isAr ? s.labelAr : s.labelEn}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {isAr ? s.valueAr : s.valueEn}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-t border-border/40 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid gap-8 text-center md:grid-cols-4">
            {[
              { v: "2,500+", ar: "وحدة مُدارة", en: "Units managed" },
              { v: "99.9%", ar: "توفّر النظام", en: "Uptime" },
              { v: "14", ar: "يوم للانطلاق", en: "Days to launch" },
              { v: "SAR", ar: "التسعير بالريال", en: "Native currency" },
            ].map((s) => (
              <div key={s.v}>
                <div className="text-3xl font-bold text-primary md:text-4xl">{s.v}</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {isAr ? s.ar : s.en}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-foreground md:text-4xl">
            {isAr ? "جاهز لرؤية المنصة؟" : "Ready to see the platform?"}
          </h2>
          <p className="mt-4 text-muted-foreground">
            {isAr
              ? "ابدأ تجربة 30 يوماً مجاناً — بدون بطاقة، مع ترحيل بياناتك في أسبوع."
              : "Start a 30-day free trial — no card, with your data migrated in a week."}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                {isAr ? "ابدأ الآن" : "Get started"}
                <ArrowRight className="ms-2 h-4 w-4" />
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
