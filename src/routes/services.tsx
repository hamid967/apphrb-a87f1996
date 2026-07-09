import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle, BrandMark } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Building2,
  FileText,
  Wallet,
  Wrench,
  BarChart3,
  Users2,
  Sparkles,
  Home,
} from "lucide-react";
import propertiesShot from "@/assets/service-properties.webp";
import contractsShot from "@/assets/service-contracts.webp";
import paymentsShot from "@/assets/service-payments.webp";
import maintenanceShot from "@/assets/service-maintenance.webp";
import reportsShot from "@/assets/service-reports.webp";
import tenantsShot from "@/assets/service-tenants.webp";
import leadsShot from "@/assets/service-leads.webp";
import ownerPortalShot from "@/assets/service-owner-portal.webp";
import ogServices from "@/assets/og-services.jpg.asset.json";

const OG_SERVICES = `https://hrhbs.com${ogServices.url}`;

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "خدمات Aqari — منصة SaaS للقطاع العقاري | Services" },
      {
        name: "description",
        content:
          "استكشف وحدات Aqari: العقارات، العقود، المدفوعات، الصيانة، التقارير التنفيذية، CRM للمستأجرين، خط العملاء المحتملين، وبوابة الملاك.",
      },
      { property: "og:title", content: "خدمات Aqari — منصة SaaS للقطاع العقاري" },
      {
        property: "og:description",
        content:
          "ثماني وحدات جاهزة للإنتاج تُشغّل فرق العقارات الحديثة — مع معاينات واقعية للواجهات.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/services" },
      { property: "og:image", content: OG_SERVICES },
      { name: "twitter:image", content: OG_SERVICES },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/services" }],
  }),
  component: ServicesPage,
});

type ServiceItem = {
  key: string;
  icon: typeof Building2;
  title: string;
  titleAr: string;
  desc: string;
  descAr: string;
  bullets: [string, string, string];
  bulletsAr: [string, string, string];
  image: string;
  href?: string;
};

const services: ServiceItem[] = [
  {
    key: "properties",
    icon: Building2,
    title: "Property Management",
    titleAr: "إدارة العقارات",
    desc: "Central portfolio with maps, filters, and live occupancy across every unit.",
    descAr: "محفظة موحّدة مع خرائط، فلاتر، ومعدل إشغال لحظي لكل الوحدات.",
    bullets: ["Portfolio map", "Occupancy KPIs", "Unit-level insights"],
    bulletsAr: ["خريطة المحفظة", "مؤشرات الإشغال", "تحليل لكل وحدة"],
    image: propertiesShot,
    href: "/properties",
  },
  {
    key: "contracts",
    icon: FileText,
    title: "Contracts",
    titleAr: "العقود",
    desc: "Lease lifecycle with digital signatures, renewals, and expiry alerts.",
    descAr: "دورة حياة العقد مع توقيع رقمي، تجديدات، وتنبيهات الانتهاء.",
    bullets: ["e-Signature", "Renewal reminders", "Bulk actions"],
    bulletsAr: ["توقيع إلكتروني", "تذكير التجديد", "عمليات جماعية"],
    image: contractsShot,
    href: "/owners/contracts",
  },
  {
    key: "payments",
    icon: Wallet,
    title: "Payments & Invoicing",
    titleAr: "المدفوعات والفواتير",
    desc: "Mada, Visa, and Apple Pay with automatic reconciliation and reminders.",
    descAr: "مدى، فيزا وApple Pay مع مطابقة تلقائية وتذكيرات ذكية.",
    bullets: ["MRR tracking", "Auto reconciliation", "Multi-method"],
    bulletsAr: ["تتبع الإيرادات", "مطابقة تلقائية", "طرق دفع متعددة"],
    image: paymentsShot,
    href: "/accounting",
  },
  {
    key: "maintenance",
    icon: Wrench,
    title: "Maintenance",
    titleAr: "الصيانة",
    desc: "Kanban tickets, technician dispatch, and before/after photo trails.",
    descAr: "تذاكر كانبان، تعيين فنيين، وأرشيف صور قبل وبعد.",
    bullets: ["Priority triage", "Technician SLA", "Photo evidence"],
    bulletsAr: ["فرز الأولويات", "SLA للفنيين", "توثيق مصوّر"],
    image: maintenanceShot,
    href: "/maintenance",
  },
  {
    key: "reports",
    icon: BarChart3,
    title: "Executive Reports",
    titleAr: "التقارير التنفيذية",
    desc: "Revenue, occupancy, ADR, and RevPAR in one real-time boardroom view.",
    descAr: "الإيرادات، الإشغال، ADR وRevPAR في لوحة تنفيذية لحظية.",
    bullets: ["Real-time KPIs", "Custom exports", "Trend analysis"],
    bulletsAr: ["مؤشرات لحظية", "تصدير مخصص", "تحليل اتجاهات"],
    image: reportsShot,
    href: "/reports",
  },
  {
    key: "tenants",
    icon: Users2,
    title: "Tenants CRM",
    titleAr: "إدارة المستأجرين",
    desc: "360° tenant profiles with lease timeline, payments, and communication log.",
    descAr: "ملف مستأجر شامل مع خط زمني، مدفوعات، وسجل اتصالات.",
    bullets: ["Unified profile", "Communication log", "Quick actions"],
    bulletsAr: ["ملف موحد", "سجل التواصل", "إجراءات سريعة"],
    image: tenantsShot,
    href: "/contacts",
  },
  {
    key: "leads",
    icon: Sparkles,
    title: "Leads Pipeline",
    titleAr: "خط العملاء المحتملين",
    desc: "Kanban pipeline from lead to closed deal with hot/warm/cold scoring.",
    descAr: "خط أنابيب كانبان من عميل محتمل إلى صفقة مغلقة مع تقييم ذكي.",
    bullets: ["Drag-and-drop", "Lead scoring", "Assignment rules"],
    bulletsAr: ["سحب وإفلات", "تقييم العملاء", "قواعد الإسناد"],
    image: leadsShot,
    href: "/leads",
  },
  {
    key: "owner",
    icon: Home,
    title: "Owner Portal",
    titleAr: "بوابة الملاك",
    desc: "Monthly statements with income/expense breakdown and PDF downloads.",
    descAr: "كشوف شهرية مع تفصيل الدخل/المصروفات وتصدير PDF.",
    bullets: ["Net payout", "Property performance", "PDF export"],
    bulletsAr: ["صافي الدفعة", "أداء العقار", "تصدير PDF"],
    image: ownerPortalShot,
    href: "/owner/portal",
  },
];

function ServicesPage() {
  const { i18n, t } = useTranslation();
  // Keep first client render aligned with SSR (always "en"/"ltr").
  // Flip to the real language only after hydration to avoid mismatch.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const isAr = hydrated ? i18n.language?.startsWith("ar") : false;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="theme-luxe min-h-app bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark size={32} />
            <span className="text-display text-lg">{t("brand", { defaultValue: "Aqari" })}</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button asChild size="sm" className="ms-2">
              <Link to="/auth">{isAr ? "ابدأ الآن" : "Get started"}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at top, color-mix(in oklab, var(--color-primary) 22%, transparent), transparent 60%), radial-gradient(ellipse at bottom, color-mix(in oklab, var(--color-accent) 18%, transparent), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 py-20 text-center sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              {isAr ? "٨ خدمات • جاهزة للإنتاج" : "8 modules • production-ready"}
            </div>
            <h1 className="text-display mx-auto max-w-3xl bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-4xl text-transparent sm:text-6xl">
              {isAr ? "خدمات Aqari" : "Aqari Services"}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
              {isAr
                ? "منصة موحّدة تدير عقاراتك، عقودك، مدفوعاتك، صيانتك، وعلاقاتك مع العملاء — بواجهات فاخرة وذكاء اصطناعي مدمج."
                : "One platform for properties, contracts, payments, maintenance, and client relations — with luxury UI and built-in AI."}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Services alternating rows */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="space-y-24">
          {services.map((svc, i) => {
            const Icon = svc.icon;
            const reverse = i % 2 === 1;
            return (
              <motion.article
                key={svc.key}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${reverse ? "lg:[direction:rtl]" : ""}`}
              >
                <div className={reverse ? "lg:[direction:ltr]" : undefined}>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    {String(i + 1).padStart(2, "0")} / {services.length}
                  </div>
                  <h2 className="text-display text-3xl sm:text-4xl">
                    {isAr ? svc.titleAr : svc.title}
                  </h2>
                  <p className="mt-3 text-base text-muted-foreground sm:text-lg">
                    {isAr ? svc.descAr : svc.desc}
                  </p>
                  <ul className="mt-6 space-y-2">
                    {(isAr ? svc.bulletsAr : svc.bullets).map((b) => (
                      <li key={b} className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="text-foreground">{b}</span>
                      </li>
                    ))}
                  </ul>
                  {svc.href && (
                    <Button asChild variant="outline" size="sm" className="mt-6">
                      <Link to={svc.href}>
                        {isAr ? "استكشف الوحدة" : "Explore module"}
                        <ArrowRight className="ms-1 h-4 w-4 rtl:rotate-180" />
                      </Link>
                    </Button>
                  )}
                </div>
                <div
                  className={`surface-card overflow-hidden ${reverse ? "lg:[direction:ltr]" : ""}`}
                >
                  <img
                    src={svc.image}
                    alt={isAr ? svc.titleAr : svc.title}
                    width={1600}
                    height={1024}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full"
                  />
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-display text-3xl sm:text-4xl">
            {isAr ? "جاهز لتشغيل عملياتك؟" : "Ready to run your operation?"}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            {isAr
              ? "ابدأ بحساب مطوّر واستكشف جميع الوحدات في دقائق."
              : "Start with a developer workspace and explore every module in minutes."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">{isAr ? "إنشاء حساب" : "Create account"}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/">{isAr ? "الصفحة الرئيسية" : "Back to home"}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
