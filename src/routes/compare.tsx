import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle, BrandMark } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import compareArAsset from "@/assets/compare-ar.png.asset.json";
import { buildOgImageUrl } from "@/lib/og-image";
import compareEnAsset from "@/assets/compare-en.png.asset.json";
// Responsive AVIF + WebP variants (built at asset-upload time)
import arAvif480 from "@/assets/compare-ar-480.avif.asset.json";
import arAvif900 from "@/assets/compare-ar-900.avif.asset.json";
import arAvif1600 from "@/assets/compare-ar-1600.avif.asset.json";
import arWebp480 from "@/assets/compare-ar-480.webp.asset.json";
import arWebp900 from "@/assets/compare-ar-900.webp.asset.json";
import arWebp1600 from "@/assets/compare-ar-1600.webp.asset.json";
import enAvif480 from "@/assets/compare-en-480.avif.asset.json";
import enAvif900 from "@/assets/compare-en-900.avif.asset.json";
import enAvif1600 from "@/assets/compare-en-1600.avif.asset.json";
import enWebp480 from "@/assets/compare-en-480.webp.asset.json";
import enWebp900 from "@/assets/compare-en-900.webp.asset.json";
import enWebp1600 from "@/assets/compare-en-1600.webp.asset.json";
import { CompareGallery } from "@/components/compare/CompareGallery";
import { CompareIntroVideo } from "@/components/compare/CompareIntroVideo";
import {
  Check,
  X,
  Minus,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Wallet,
  Bot,
  Map,
  Users2,
  FileText,
  Building2,
} from "lucide-react";

// ---------- Bilingual content ----------
const COPY = {
  ar: {
    metaTitle: "مقارنة HBSpro بمنصات إدارة العقارات في السعودية | Aqari vs Mogod / Nozol / Simaat",
    metaDesc:
      "قارن HBSpro (عقاري) مع أبرز منصات إدارة الأملاك في السعودية والخليج: موجود، نزل، سمات، أساس. لوحة سوبر أدمن، تحويلات بنكية يدوية، مساعد ذكي حسب الدور، وأدوار غير محدودة.",
    heroKicker: "لماذا HBSpro",
    heroTitle: "المنصة الوحيدة التي تجمع كل ما تحتاجه فرق العقارات — دون تنازلات.",
    heroSub:
      "أجرينا مقارنة مباشرة مع أبرز منصات إدارة الأملاك في السوق السعودي والخليجي. النتائج تكشف فجوات حقيقية.",
    ctaPrimary: "ابدأ مجانًا",
    ctaSecondary: "استعرض الأسعار",
    gapsTitle: "الفجوات التي نُغطّيها ولا يُغطّيها المنافسون",
    gapsSub: "سبع مزايا حاسمة تُميّز HBSpro عن أقرب البدائل في السوق.",
    tableTitle: "مقارنة مباشرة بالمزايا",
    tableSub: "بيانات جُمعت من مواقع المنتجات الرسمية ومراجعات العملاء (2026).",
    us: "HBSpro",
    yes: "متوفر",
    no: "غير متوفر",
    partial: "جزئي",
    footNote:
      "المقارنات مبنية على المعلومات المتاحة علنًا في مواقع المنتجات وقت النشر. تختلف حزم الخطط بين المزوّدين.",
    ctaBottomTitle: "جاهز للانتقال إلى منصة بلا تنازلات؟",
    ctaBottomSub: "جرّب HBSpro الآن أو تحدّث مع فريقنا لتخصيص عرض يناسب حجم أعمالك.",
    videoTitle: "شاهد كيف تختار خطتك في 30 ثانية",
    videoSub: "جولة سريعة على المقارنة والخطط — من الفكرة إلى الاشتراك.",
    videoPlay: "شغّل فيديو المقارنة",
    videoDuration: "٠٠:٣٠ · فيديو تعريفي",
    videoDialog: "فيديو مقارنة HBSpro",
    showcaseTitle: "شاهد المقارنة بلغتك",
    showcaseSub: "لقطات حقيقية من صفحة المقارنة بواجهتين عربية وإنجليزية.",
    showcaseAr: "الواجهة العربية (RTL)",
    showcaseEn: "الواجهة الإنجليزية (LTR)",
    galleryPrev: "السابق",
    galleryNext: "التالي",
    galleryGoTo: "انتقل إلى الشريحة",
    galleryHint: "اسحب أو مرّر للتنقل",
    captionAr: "تصميم متسق بالكامل من اليمين إلى اليسار",
    captionEn: "Same design, mirrored for LTR reading",
    features: [
      {
        icon: ShieldCheck,
        t: "لوحة سوبر أدمن كاملة",
        d: "إدارة مركزية للشركات، الاشتراكات، الفواتير، والتذاكر — بينما تعتمد أغلب المنصات على بوابات دفع فقط دون إشراف بشري.",
      },
      {
        icon: Wallet,
        t: "تحويلات بنكية يدوية معتمدة",
        d: "قبول التحويلات البنكية السعودية مع مراجعة يدوية من السوبر أدمن. أغلب المنافسين يفرضون بوابة دفع إلكترونية فقط.",
      },
      {
        icon: Bot,
        t: "مساعد ذكي لكل دور",
        d: "AI يستدعي دوال SQL آمنة حسب صلاحية المستخدم. المنافسون يقدمون شات بوت عام فقط أو بلا AI.",
      },
      {
        icon: Users2,
        t: "أدوار وصلاحيات غير محدودة",
        d: "RBAC ديناميكي — لا تُحصر بأدوار جاهزة. أغلب المنافسين يحدّون بـ 3-5 أدوار ثابتة.",
      },
      {
        icon: Map,
        t: "خريطة السعودية ثلاثية الأبعاد",
        d: "تجربة تسويقية سينمائية 8 ثوانٍ مع 25 مدينة — تُميّز الهوية البصرية عن التصاميم النمطية.",
      },
      {
        icon: FileText,
        t: "هجري + ZATCA + عقود + عمولات + أرشيف",
        d: "كل الوحدات في منصة واحدة. المنافسون يقدمون 2-3 منها فقط أو يعتمدون على تكاملات خارجية.",
      },
      {
        icon: ShieldCheck,
        t: "2FA إلزامي + تليمتري متقدم",
        d: "AAL2 (TOTP) إلزامي للسوبر أدمن + سجل تنبيهات بريد مع فلاتر. أغلب المنافسين يكتفي بكلمة مرور.",
      },
    ],
    rows: [
      {
        k: "واجهة عربية RTL أصلية",
        us: "yes",
        mogod: "yes",
        nozol: "yes",
        simaat: "yes",
        asaas: "yes",
      },
      {
        k: "تقويم هجري كامل",
        us: "yes",
        mogod: "partial",
        nozol: "partial",
        simaat: "yes",
        asaas: "no",
      },
      {
        k: "فوترة إلكترونية ZATCA فاز 2",
        us: "yes",
        mogod: "partial",
        nozol: "yes",
        simaat: "yes",
        asaas: "no",
      },
      { k: "تكامل شبكة إيجار", us: "yes", mogod: "no", nozol: "no", simaat: "yes", asaas: "no" },
      {
        k: "تحويلات بنكية يدوية (بدون بوابة إلزامية)",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "أدوار وصلاحيات ديناميكية",
        us: "yes",
        mogod: "no",
        nozol: "partial",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "مساعد ذكي حسب الدور (Tool-calling)",
        us: "yes",
        mogod: "partial",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "خريطة تفاعلية 3D للسعودية",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "بوابة ملاك + بوابة مستأجرين",
        us: "yes",
        mogod: "yes",
        nozol: "yes",
        simaat: "yes",
        asaas: "partial",
      },
      {
        k: "إدارة عمولات وسطاء",
        us: "yes",
        mogod: "no",
        nozol: "partial",
        simaat: "no",
        asaas: "yes",
      },
      {
        k: "أرشيف إلكتروني للوثائق",
        us: "yes",
        mogod: "partial",
        nozol: "yes",
        simaat: "yes",
        asaas: "no",
      },
      {
        k: "نظام تذاكر دعم مدمج",
        us: "yes",
        mogod: "no",
        nozol: "partial",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "2FA إلزامي (TOTP AAL2)",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "تليمتري بريدي مع فلاتر",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "لوحة سوبر أدمن للتشغيل",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
    ],
  },
  en: {
    metaTitle: "HBSpro vs Saudi Property Management Platforms | Aqary Comparison",
    metaDesc:
      "Compare HBSpro (Aqary) with leading Saudi/GCC property management platforms: Mogod, Nozol, Simaat, Asaas. Super-admin panel, manual bank transfers, role-aware AI, unlimited RBAC.",
    heroKicker: "Why HBSpro",
    heroTitle:
      "The only platform that combines everything real-estate teams need — with no compromises.",
    heroSub:
      "We ran a head-to-head comparison against leading Saudi/GCC property management platforms. The gaps are real.",
    ctaPrimary: "Start free",
    ctaSecondary: "See pricing",
    gapsTitle: "Gaps we cover — that competitors don't",
    gapsSub: "Seven decisive advantages that set HBSpro apart from the closest alternatives.",
    tableTitle: "Direct feature comparison",
    tableSub: "Data gathered from official product sites and customer reviews (2026).",
    us: "HBSpro",
    yes: "Yes",
    no: "No",
    partial: "Partial",
    footNote:
      "Comparisons are based on publicly available information on product sites at publish time. Plan bundles vary by vendor.",
    ctaBottomTitle: "Ready to move to a no-compromise platform?",
    ctaBottomSub: "Try HBSpro now or talk to our team to tailor a plan for your business.",
    videoTitle: "See how to pick your plan in 30 seconds",
    videoSub: "A quick tour of the comparison and plans — from idea to signup.",
    videoPlay: "Play comparison video",
    videoDuration: "00:30 · Intro video",
    videoDialog: "HBSpro comparison video",
    showcaseTitle: "See the comparison in your language",
    showcaseSub: "Real screenshots of the comparison page in Arabic and English.",
    showcaseAr: "Arabic UI (RTL)",
    showcaseEn: "English UI (LTR)",
    galleryPrev: "Previous",
    galleryNext: "Next",
    galleryGoTo: "Go to slide",
    galleryHint: "Swipe or drag to navigate",
    captionAr: "Fully consistent right-to-left layout",
    captionEn: "Same design, mirrored for LTR reading",
    features: [
      {
        icon: ShieldCheck,
        t: "Full super-admin panel",
        d: "Central control over tenants, subscriptions, invoices, tickets — while most platforms rely on payment gateways with no human oversight.",
      },
      {
        icon: Wallet,
        t: "Approved manual bank transfers",
        d: "Accept Saudi bank transfers with super-admin review. Most competitors force an online payment gateway.",
      },
      {
        icon: Bot,
        t: "Role-aware AI assistant",
        d: "AI that calls secure SQL functions scoped by user role. Competitors offer generic chatbots or no AI at all.",
      },
      {
        icon: Users2,
        t: "Unlimited roles & permissions",
        d: "Dynamic RBAC — no fixed role ceiling. Most competitors cap you at 3-5 preset roles.",
      },
      {
        icon: Map,
        t: "3D map of Saudi Arabia",
        d: "Cinematic 8-second marketing experience with 25 cities — a distinctive visual identity, not a generic template.",
      },
      {
        icon: FileText,
        t: "Hijri + ZATCA + contracts + commissions + archive",
        d: "Every module under one platform. Competitors ship 2-3 of these or rely on external integrations.",
      },
      {
        icon: ShieldCheck,
        t: "Mandatory 2FA + advanced telemetry",
        d: "AAL2 (TOTP) required for super-admin + filtered email alert log. Most competitors stop at a password.",
      },
    ],
    rows: [
      {
        k: "Native Arabic RTL UI",
        us: "yes",
        mogod: "yes",
        nozol: "yes",
        simaat: "yes",
        asaas: "yes",
      },
      {
        k: "Full Hijri calendar",
        us: "yes",
        mogod: "partial",
        nozol: "partial",
        simaat: "yes",
        asaas: "no",
      },
      {
        k: "ZATCA Phase 2 e-invoicing",
        us: "yes",
        mogod: "partial",
        nozol: "yes",
        simaat: "yes",
        asaas: "no",
      },
      {
        k: "Ejar network integration",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "yes",
        asaas: "no",
      },
      {
        k: "Manual bank transfers (no forced gateway)",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "Dynamic roles & permissions",
        us: "yes",
        mogod: "no",
        nozol: "partial",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "Role-aware AI (tool-calling)",
        us: "yes",
        mogod: "partial",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "Interactive 3D Saudi map",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "Owner + tenant portals",
        us: "yes",
        mogod: "yes",
        nozol: "yes",
        simaat: "yes",
        asaas: "partial",
      },
      {
        k: "Broker commission management",
        us: "yes",
        mogod: "no",
        nozol: "partial",
        simaat: "no",
        asaas: "yes",
      },
      {
        k: "Electronic document archive",
        us: "yes",
        mogod: "partial",
        nozol: "yes",
        simaat: "yes",
        asaas: "no",
      },
      {
        k: "Built-in support tickets",
        us: "yes",
        mogod: "no",
        nozol: "partial",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "Mandatory 2FA (TOTP AAL2)",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "Email telemetry with filters",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
      {
        k: "Operations super-admin panel",
        us: "yes",
        mogod: "no",
        nozol: "no",
        simaat: "no",
        asaas: "no",
      },
    ],
  },
} as const;

const OG = buildOgImageUrl({
  title: "قارن Aqari بأنظمة أخرى",
  subtitle: "Aqari · Compare",
  kind: "page",
  lang: "ar",
});

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: COPY.ar.metaTitle },
      { name: "description", content: COPY.ar.metaDesc },
      { property: "og:title", content: COPY.ar.metaTitle },
      { property: "og:description", content: COPY.ar.metaDesc },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/compare" },
      { property: "og:image", content: OG },
      { name: "twitter:image", content: OG },
      { property: "og:image:alt", content: "Aqari — Compare" },
      { property: "og:image:secure_url", content: OG },
      { property: "og:locale", content: "ar_SA" },
      { property: "og:locale:alternate", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/compare" }],
  }),
  component: ComparePage,
});

type Cell = "yes" | "no" | "partial";

function StatusCell({
  value,
  labels,
}: {
  value: Cell;
  labels: { yes: string; no: string; partial: string };
}) {
  if (value === "yes") {
    return (
      <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400">
        <Check className="h-4 w-4" strokeWidth={2.5} />
        <span className="text-xs font-medium">{labels.yes}</span>
      </div>
    );
  }
  if (value === "partial") {
    return (
      <div className="flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400">
        <Minus className="h-4 w-4" strokeWidth={2.5} />
        <span className="text-xs font-medium">{labels.partial}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-600">
      <X className="h-4 w-4" strokeWidth={2.5} />
      <span className="text-xs">{labels.no}</span>
    </div>
  );
}

function ComparePage() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("ar") ? "ar" : "en";
  const c = COPY[lang];
  const labels = { yes: c.yes, no: c.no, partial: c.partial };

  // Build srcSet strings for <picture> — smaller files served on mobile.
  const arAvifSet = `${arAvif480.url} 480w, ${arAvif900.url} 900w, ${arAvif1600.url} 1600w`;
  const arWebpSet = `${arWebp480.url} 480w, ${arWebp900.url} 900w, ${arWebp1600.url} 1600w`;
  const enAvifSet = `${enAvif480.url} 480w, ${enAvif900.url} 900w, ${enAvif1600.url} 1600w`;
  const enWebpSet = `${enWebp480.url} 480w, ${enWebp900.url} 900w, ${enWebp1600.url} 1600w`;

  const competitors = [
    { key: "us", name: c.us, highlight: true },
    { key: "mogod", name: "موجود / Mogod" },
    { key: "nozol", name: "نُزل / Nozol" },
    { key: "simaat", name: "سمات / Simaat" },
    { key: "asaas", name: "أساس / Asaas" },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button asChild size="sm">
              <Link to="/auth">{c.ctaPrimary}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(60% 60% at 50% 0%, hsl(var(--primary) / 0.18), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-6 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="outline" className="mb-6 border-primary/40 text-primary">
              <Sparkles className="me-1.5 h-3.5 w-3.5" />
              {c.heroKicker}
            </Badge>
            <h1 className="mb-5 text-balance text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              {c.heroTitle}
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-balance text-lg text-muted-foreground">
              {c.heroSub}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link to="/auth">
                  {c.ctaPrimary}
                  <ArrowRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/pricing">{c.ctaSecondary}</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Intro video */}
      <section className="border-b border-border/60 py-10 sm:py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <CompareIntroVideo
            title={c.videoTitle}
            subtitle={c.videoSub}
            playLabel={c.videoPlay}
            duration={c.videoDuration}
            dialogTitle={c.videoDialog}
          />
        </div>
      </section>

      {/* Gaps */}
      <section className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">{c.gapsTitle}</h2>
            <p className="text-muted-foreground">{c.gapsSub}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {c.features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.t}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                >
                  <Card className="h-full border-border/60 p-6 transition hover:border-primary/40 hover:shadow-lg">
                    <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mb-2 font-semibold">{f.t}</h3>
                    <p className="text-sm text-muted-foreground">{f.d}</p>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      {/* Showcase — bilingual screenshots */}
      <section className="border-b border-border/60 bg-muted/20 py-12 sm:py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-12">
            <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              {c.showcaseTitle}
            </h2>
            <p className="text-sm text-muted-foreground sm:text-base">{c.showcaseSub}</p>
          </div>
          <div className="mx-auto max-w-5xl">
            <CompareGallery
              isRTL={lang === "ar"}
              autoPlayMs={6000}
              ariaLabels={{
                prev: c.galleryPrev,
                next: c.galleryNext,
                goTo: c.galleryGoTo,
              }}
              shots={[
                {
                  src: compareArAsset.url,
                  sources: [
                    { type: "image/avif", srcSet: arAvifSet },
                    { type: "image/webp", srcSet: arWebpSet },
                  ],
                  label: c.showcaseAr,
                  caption: c.captionAr,
                  dir: "rtl",
                },
                {
                  src: compareEnAsset.url,
                  sources: [
                    { type: "image/avif", srcSet: enAvifSet },
                    { type: "image/webp", srcSet: enWebpSet },
                  ],
                  label: c.showcaseEn,
                  caption: c.captionEn,
                  dir: "ltr",
                },
              ]}
            />
            <p className="mt-4 text-center text-xs text-muted-foreground sm:hidden">
              {c.galleryHint}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border/60 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">{c.tableTitle}</h2>
            <p className="text-muted-foreground">{c.tableSub}</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="p-4 text-start font-semibold">
                    <Building2 className="inline-block me-2 h-4 w-4 text-muted-foreground" />
                    {lang === "ar" ? "الميزة" : "Feature"}
                  </th>
                  {competitors.map((v) => (
                    <th
                      key={v.key}
                      className={`p-4 text-center font-semibold ${
                        "highlight" in v && v.highlight ? "bg-primary/10 text-primary" : ""
                      }`}
                    >
                      {v.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row, i) => (
                  <tr
                    key={row.k}
                    className={`border-b border-border/40 last:border-0 ${
                      i % 2 === 1 ? "bg-muted/20" : ""
                    }`}
                  >
                    <td className="p-4 font-medium">{row.k}</td>
                    {competitors.map((v) => (
                      <td
                        key={v.key}
                        className={`p-4 ${"highlight" in v && v.highlight ? "bg-primary/5" : ""}`}
                      >
                        <StatusCell
                          value={row[v.key as keyof typeof row] as Cell}
                          labels={labels}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">{c.footNote}</p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">{c.ctaBottomTitle}</h2>
          <p className="mb-8 text-muted-foreground">{c.ctaBottomSub}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">
                {c.ctaPrimary}
                <ArrowRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">{c.ctaSecondary}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
