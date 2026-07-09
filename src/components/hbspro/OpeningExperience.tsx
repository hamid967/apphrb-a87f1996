import { useState, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { WelcomeTour } from "./WelcomeTour";
import {
  Building2,
  FileText,
  Calculator,
  Users2,
  Gavel,
  BarChart3,
  Wrench,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  Play,
  Zap,
  X,
  Check,
} from "lucide-react";

/**
 * OpeningExperience — a "services theater" landing intro that opens the app
 * with a dramatic split-screen presentation of every service Aqari offers.
 * Clicking any service card opens a detailed modal with key features + how to start.
 *
 * Palette (locked, direction v2): Emerald Prestige
 *   ink #064e3b · surface #0d7a5f · gold #c9a84c · cream #f5f0e0
 * Typography: DM Serif Display (headings) + Fira Sans (body).
 */

const INK = "#064e3b";
const SURFACE = "#0d7a5f";
const GOLD = "#c9a84c";
const CREAM = "#f5f0e0";

type Service = {
  id: string;
  icon: typeof Building2;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  featuresAr: string[];
  featuresEn: string[];
  stepsAr: string[];
  stepsEn: string[];
  ctaPath: string;
};

const SERVICES: Service[] = [
  {
    id: "units",
    icon: Building2,
    titleAr: "إدارة الوحدات",
    titleEn: "Units Management",
    descAr: "تتبع دقيق لكل متر مربع",
    descEn: "Precise tracking for every unit",
    featuresAr: [
      "تسجيل غير محدود للعقارات والوحدات",
      "خرائط تفاعلية لحالة الإشغال",
      "صور ومستندات مربوطة بكل وحدة",
      "تنبيهات انتهاء العقود تلقائياً",
    ],
    featuresEn: [
      "Unlimited properties & units registry",
      "Interactive occupancy maps",
      "Photos & documents per unit",
      "Automatic contract expiry alerts",
    ],
    stepsAr: [
      "أنشئ حسابك المجاني",
      "أضف أول عقار في أقل من دقيقة",
      "اربط الوحدات بالمستأجرين",
    ],
    stepsEn: [
      "Create your free account",
      "Add your first property in under a minute",
      "Link units to tenants",
    ],
    ctaPath: "/auth",
  },
  {
    id: "contracts",
    icon: FileText,
    titleAr: "العقود والإيجارات",
    titleEn: "Contracts & Leases",
    descAr: "توثيق العقود وجدولة الدفعات",
    descEn: "Documented contracts & payment plans",
    featuresAr: [
      "قوالب عقود جاهزة قابلة للتخصيص",
      "توقيع إلكتروني معتمد",
      "جدولة تلقائية للدفعات الشهرية",
      "أرشيف رقمي بحث فوري",
    ],
    featuresEn: [
      "Ready customizable contract templates",
      "Certified e-signatures",
      "Automated monthly payment schedules",
      "Instant-search digital archive",
    ],
    stepsAr: [
      "اختر قالباً أو ارفع عقدك",
      "اضبط شروط الدفع",
      "أرسله للتوقيع بضغطة زر",
    ],
    stepsEn: [
      "Pick a template or upload yours",
      "Set payment terms",
      "Send for signature in one click",
    ],
    ctaPath: "/auth",
  },
  {
    id: "billing",
    icon: Calculator,
    titleAr: "الفواتير و ZATCA",
    titleEn: "Billing & ZATCA",
    descAr: "فوترة إلكترونية متوافقة بالكامل",
    descEn: "Fully compliant e-invoicing",
    featuresAr: [
      "فواتير ضريبية بصيغة ZATCA المرحلة الثانية",
      "QR + توقيع رقمي تلقائي",
      "تصدير XML و PDF/A-3",
      "تكامل مباشر مع هيئة الزكاة",
    ],
    featuresEn: [
      "ZATCA Phase 2 e-invoices",
      "Automatic QR + digital signature",
      "XML and PDF/A-3 export",
      "Direct ZATCA integration",
    ],
    stepsAr: [
      "أدخل بيانات المنشأة",
      "فعّل التكامل الضريبي",
      "أصدر أول فاتورة متوافقة",
    ],
    stepsEn: [
      "Enter your establishment info",
      "Enable tax integration",
      "Issue your first compliant invoice",
    ],
    ctaPath: "/auth",
  },
  {
    id: "crm",
    icon: Users2,
    titleAr: "نظام CRM",
    titleEn: "CRM Suite",
    descAr: "إدارة الملاك والمستأجرين",
    descEn: "Owners & tenants pipeline",
    featuresAr: [
      "قاعدة بيانات موحدة للملاك والمستأجرين",
      "تتبع الفرص وحالات التواصل",
      "رسائل واتساب و SMS مباشرة",
      "بوابة ذاتية الخدمة للمستأجر",
    ],
    featuresEn: [
      "Unified owners & tenants database",
      "Deal & conversation tracking",
      "Direct WhatsApp & SMS messaging",
      "Self-service tenant portal",
    ],
    stepsAr: [
      "استورد جهات اتصالك من Excel",
      "فعّل قنوات المراسلة",
      "ابدأ متابعة أول صفقة",
    ],
    stepsEn: [
      "Import contacts from Excel",
      "Enable messaging channels",
      "Start tracking your first deal",
    ],
    ctaPath: "/auth",
  },
  {
    id: "auctions",
    icon: Gavel,
    titleAr: "المزادات",
    titleEn: "Auctions",
    descAr: "مزادات ذكية وشفافة",
    descEn: "Smart, transparent auctions",
    featuresAr: [
      "مزادات مباشرة بالوقت الفعلي",
      "تحقق من هوية المزايدين",
      "شفافية كاملة وسجل عروض",
      "إشعارات فورية للفائزين",
    ],
    featuresEn: [
      "Real-time live auctions",
      "Bidder identity verification",
      "Full transparency & bid log",
      "Instant notifications for winners",
    ],
    stepsAr: [
      "أنشئ مزاداً جديداً",
      "ادع المزايدين المؤهلين",
      "أدر الجلسة وأصدر التقرير",
    ],
    stepsEn: [
      "Create a new auction",
      "Invite qualified bidders",
      "Run the session & issue the report",
    ],
    ctaPath: "/auth",
  },
  {
    id: "reports",
    icon: BarChart3,
    titleAr: "التقارير الذكية",
    titleEn: "Smart Reports",
    descAr: "بيانات تدعم اتخاذ القرار",
    descEn: "Insights that drive decisions",
    featuresAr: [
      "لوحات مؤشرات مباشرة",
      "تقارير مالية وتشغيلية جاهزة",
      "تصدير Excel / PDF بضغطة",
      "مقارنات بين الفترات والفروع",
    ],
    featuresEn: [
      "Live KPI dashboards",
      "Ready financial & ops reports",
      "One-click Excel / PDF export",
      "Compare periods & branches",
    ],
    stepsAr: [
      "افتح لوحة التقارير",
      "اختر الفترة والمقياس",
      "شارك التقرير مع فريقك",
    ],
    stepsEn: [
      "Open the reports panel",
      "Pick period & metric",
      "Share the report with your team",
    ],
    ctaPath: "/auth",
  },
  {
    id: "maintenance",
    icon: Wrench,
    titleAr: "الصيانة",
    titleEn: "Maintenance",
    descAr: "جدولة ومتابعة المهام",
    descEn: "Schedule & track work orders",
    featuresAr: [
      "طلبات صيانة من المستأجر مباشرة",
      "توزيع تلقائي على الفنيين",
      "تتبع التكاليف والمهل",
      "أرشيف مرفقات وصور قبل/بعد",
    ],
    featuresEn: [
      "Tenant-submitted requests",
      "Auto-dispatch to technicians",
      "Cost & SLA tracking",
      "Before/after photo archive",
    ],
    stepsAr: [
      "أضف فريق الصيانة",
      "فعّل بوابة الطلبات",
      "تابع الطلبات من لوحة واحدة",
    ],
    stepsEn: [
      "Add your maintenance team",
      "Enable the requests portal",
      "Track everything from one board",
    ],
    ctaPath: "/auth",
  },
];

const FEATURED_SERVICE: Service = {
  id: "assistant",
  icon: Zap,
  titleAr: "المساعد الذكي بالعربية",
  titleEn: "Arabic AI Assistant",
  descAr: "حلول استباقية وتنبؤات مالية مدعومة بالذكاء الاصطناعي",
  descEn: "Proactive answers and financial forecasts powered by AI",
  featuresAr: [
    "فهم كامل للغة العربية والمصطلحات العقارية",
    "توقعات مالية وتحليل عوائد",
    "إجابات فورية على بياناتك الخاصة",
    "توليد تقارير وعقود بالمحادثة",
  ],
  featuresEn: [
    "Native Arabic & real-estate terminology",
    "Financial forecasts & ROI analysis",
    "Instant answers on your own data",
    "Generate reports & contracts by chat",
  ],
  stepsAr: [
    "افتح المساعد من الشريط الجانبي",
    "اسأل بلغتك الطبيعية",
    "طبّق الاقتراح بضغطة",
  ],
  stepsEn: [
    "Open the assistant from the sidebar",
    "Ask in natural language",
    "Apply the suggestion in one click",
  ],
  ctaPath: "/auth",
};

export function OpeningExperience() {
  const { i18n } = useTranslation();
  const ar = (i18n.language || "ar").startsWith("ar");
  const dir = ar ? "rtl" : "ltr";
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const [active, setActive] = useState<Service | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  // Close on ESC
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Lock scroll while modal open
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  const T = {
    badge: "Aqari by HRHBS",
    heroLine1: ar ? "نهضة عقارية" : "A property renaissance",
    heroLine2: ar ? "بلمسة ذكية" : "with intelligent finesse",
    heroBody: ar
      ? "المنصة المتكاملة لإدارة الأملاك والوحدات في المملكة. من العقود المؤتمتة إلى الفواتير الضريبية، كل ما تحتاجه في مكان واحد."
      : "The integrated platform for property management in Saudi Arabia — from automated contracts to tax-compliant invoices, all in one place.",
    ctaPrimary: ar ? "ابدأ الآن مجاناً" : "Start free",
    ctaSecondary: ar ? "شاهد ديمو" : "Watch demo",
    trust1Title: "ZATCA",
    trust1Sub: ar ? "متوافق مع المرحلة الثانية" : "Phase 2 compliant",
    trust2Title: "2.5K+",
    trust2Sub: ar ? "وحدة مُدارة" : "Managed units",
    joinTitle: ar ? "انضم لرواد العقار" : "Join the property leaders",
    joinSub: ar
      ? "أكثر من ١٠٠٠ شريك نجاح يثقون بـ Aqari"
      : "Over 1,000 partners already trust Aqari",
    servicesEyebrow: ar ? "خدمات المنصة" : "Platform services",
    tapHint: ar ? "اضغط للتفاصيل" : "Tap for details",
    modalFeatures: ar ? "الميزات الرئيسية" : "Key features",
    modalSteps: ar ? "كيف تبدأ" : "How to start",
    modalClose: ar ? "إغلاق" : "Close",
    modalCta: ar ? "ابدأ استخدام الخدمة" : "Start using this service",
  };

  return (
    <section
      dir={dir}
      className="relative flex min-h-screen w-full items-center justify-center p-4 lg:p-8"
      style={{
        background: CREAM,
        fontFamily: "'Fira Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif",
      }}
      aria-label={T.servicesEyebrow}
    >
      <motion.main
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="flex w-full max-w-7xl flex-col overflow-hidden rounded-[48px] border border-white/60 bg-white shadow-[0_40px_100px_-20px_rgba(6,78,59,0.25)] lg:flex-row"
      >
        {/* HERO PANEL */}
        <motion.div
          initial={{ x: ar ? 40 : -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex w-full flex-col justify-center overflow-hidden p-10 text-white lg:w-[45%] lg:p-20"
          style={{ background: INK }}
        >
          <div
            className="pointer-events-none absolute -top-32 h-80 w-80 rounded-full opacity-40 blur-[120px]"
            style={{ background: SURFACE, insetInlineStart: "-8rem" }}
          />
          <div
            className="pointer-events-none absolute -bottom-32 h-80 w-80 rounded-full opacity-10 blur-[150px]"
            style={{ background: GOLD, insetInlineEnd: "-8rem" }}
          />

          <div className="relative z-10">
            <div
              className="mb-10 inline-flex items-center gap-3 rounded-2xl border px-5 py-2.5"
              style={{
                background: "rgba(13,122,95,0.4)",
                borderColor: "rgba(201,168,76,0.25)",
              }}
            >
              <span className="inline-flex h-2 w-2 rounded-full" style={{ background: GOLD }} />
              <span
                className="text-xs font-medium uppercase tracking-widest"
                style={{ color: CREAM }}
              >
                {T.badge}
              </span>
            </div>

            <h1
              className="mb-8 text-5xl font-bold leading-[1.1] lg:text-7xl"
              style={{ color: CREAM, fontFamily: "'DM Serif Display', serif" }}
            >
              {T.heroLine1}
              <br />
              <span className="italic" style={{ color: GOLD }}>
                {T.heroLine2}
              </span>
            </h1>

            <p
              className="mb-12 max-w-md text-lg leading-relaxed lg:text-xl"
              style={{ color: "rgba(245,240,224,0.75)" }}
            >
              {T.heroBody}
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 rounded-2xl px-8 py-4 font-bold shadow-xl transition-all hover:scale-105"
                style={{ background: GOLD, color: INK }}
              >
                <Sparkles className="h-4 w-4" />
                {T.ctaPrimary}
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 rounded-2xl border px-8 py-4 font-semibold transition-all hover:bg-white/5"
                style={{ borderColor: "rgba(245,240,224,0.25)", color: CREAM }}
              >
                <Play className="h-4 w-4" />
                {T.ctaSecondary}
              </Link>
              <button
                type="button"
                onClick={() => setTourOpen(true)}
                className="group inline-flex items-center gap-2 rounded-2xl px-6 py-4 text-sm font-bold underline-offset-4 transition-all hover:underline"
                style={{ color: GOLD }}
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full"
                  style={{ background: "rgba(201,168,76,0.15)" }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                {ar ? "خذ جولة سريعة (60 ثانية)" : "Take a 60-second tour"}
              </button>
            </div>
          </div>

          <div
            className="relative z-10 mt-16 flex items-center gap-10 border-t pt-8"
            style={{ borderColor: "rgba(255,255,255,0.1)" }}
          >
            <div className="flex flex-col">
              <div className="mb-1 flex items-center gap-2">
                <div
                  className="grid h-6 w-6 place-items-center rounded-md"
                  style={{ background: "rgba(201,168,76,0.2)" }}
                >
                  <ShieldCheck className="h-4 w-4" style={{ color: GOLD }} />
                </div>
                <span className="text-lg font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {T.trust1Title}
                </span>
              </div>
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "rgba(245,240,224,0.55)" }}
              >
                {T.trust1Sub}
              </span>
            </div>
            <div className="h-12 w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
            <div className="flex flex-col">
              <span className="text-lg font-bold" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {T.trust2Title}
              </span>
              <span
                className="text-[10px] uppercase tracking-widest"
                style={{ color: "rgba(245,240,224,0.55)" }}
              >
                {T.trust2Sub}
              </span>
            </div>
          </div>
        </motion.div>

        {/* SERVICES PANEL */}
        <motion.div
          initial={{ x: ar ? -40 : 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full flex-col justify-center p-8 lg:w-[55%] lg:p-16"
          style={{ background: "rgba(245,240,224,0.3)" }}
        >
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="h-px w-10" style={{ background: GOLD }} />
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: INK, opacity: 0.6 }}
            >
              {T.servicesEyebrow}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-stone-500">
              {T.tapHint}
            </span>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="ms-auto"
            >
              <Link
                to="/auth"
                aria-label={ar ? "بدء سريع — تسجيل الدخول" : "Quick start — sign in"}
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm font-bold shadow-lg transition-all hover:scale-[1.03] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ background: INK, color: CREAM }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{
                    background: `linear-gradient(120deg, transparent 30%, ${GOLD}33 50%, transparent 70%)`,
                  }}
                />
                <span
                  className="relative grid h-6 w-6 place-items-center rounded-full"
                  style={{ background: GOLD, color: INK }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="relative">
                  {ar ? "بدء سريع" : "Quick start"}
                </span>
                <Arrow className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Link>
            </motion.div>
          </div>

          <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
            {/* Featured card — clickable */}
            <motion.button
              type="button"
              onClick={() => setActive(FEATURED_SERVICE)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="group relative col-span-2 overflow-hidden rounded-[2.5rem] p-8 text-start shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ background: SURFACE }}
              aria-label={ar ? FEATURED_SERVICE.titleAr : FEATURED_SERVICE.titleEn}
            >
              <div className="absolute top-6 end-6">
                <div
                  className="grid h-14 w-14 place-items-center rounded-2xl shadow-inner"
                  style={{ background: GOLD }}
                >
                  <Zap className="h-8 w-8" style={{ color: INK }} />
                </div>
              </div>
              <div className="mt-12">
                <h3 className="mb-2 text-xl font-bold text-white">
                  {ar ? FEATURED_SERVICE.titleAr : FEATURED_SERVICE.titleEn}
                </h3>
                <p className="text-sm leading-relaxed text-white/75">
                  {ar ? FEATURED_SERVICE.descAr : FEATURED_SERVICE.descEn}
                </p>
              </div>
            </motion.button>

            {SERVICES.map((s, idx) => {
              const Icon = s.icon;
              return (
                <motion.button
                  type="button"
                  key={s.id}
                  onClick={() => setActive(s)}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + idx * 0.05, duration: 0.45 }}
                  whileHover={{ y: -4 }}
                  className="group rounded-[2rem] border bg-white p-6 text-start shadow-sm transition-all hover:shadow-xl focus-visible:outline-none focus-visible:ring-2"
                  style={{ borderColor: "rgba(6,78,59,0.08)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = GOLD;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(6,78,59,0.08)";
                  }}
                  aria-label={ar ? s.titleAr : s.titleEn}
                >
                  <div
                    className="mb-5 grid h-12 w-12 place-items-center rounded-xl transition-colors"
                    style={{ background: "rgba(6,78,59,0.06)" }}
                  >
                    <Icon className="h-6 w-6" style={{ color: INK }} />
                  </div>
                  <h3 className="mb-1 text-sm font-bold" style={{ color: INK }}>
                    {ar ? s.titleAr : s.titleEn}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    {ar ? s.descAr : s.descEn}
                  </p>
                </motion.button>
              );
            })}
          </div>

          <div
            className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6"
            style={{ background: "rgba(6,78,59,0.06)" }}
          >
            <div className="flex items-center gap-3">
              <div className="flex -space-x-3 rtl:space-x-reverse">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="grid h-11 w-11 place-items-center rounded-full border-4 border-white text-xs font-bold shadow-sm"
                    style={{
                      background: i === 0 ? INK : i === 1 ? SURFACE : GOLD,
                      color: i === 2 ? INK : CREAM,
                    }}
                  >
                    {["A", "Q", "R"][i]}
                  </div>
                ))}
                <div
                  className="grid h-11 w-11 place-items-center rounded-full border-4 border-white text-[10px] font-bold shadow-sm"
                  style={{ background: GOLD, color: INK }}
                >
                  +1K
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-bold" style={{ color: INK }}>
                {T.joinTitle}
              </p>
              <p className="text-[11px] text-stone-500">{T.joinSub}</p>
            </div>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all hover:scale-105"
              style={{ background: INK, color: CREAM }}
            >
              {T.ctaPrimary}
              <Arrow className="h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </motion.main>

      {/* SERVICE DETAILS MODAL */}
      <AnimatePresence>
        {active && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md"
            style={{ background: "rgba(6,78,59,0.55)" }}
            role="dialog"
            aria-modal="true"
            aria-label={ar ? active.titleAr : active.titleEn}
            dir={dir}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl overflow-hidden rounded-[32px] bg-white shadow-2xl"
              style={{
                fontFamily:
                  "'Fira Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif",
              }}
            >
              {/* Header band */}
              <div
                className="relative flex items-start gap-4 p-8"
                style={{ background: INK, color: CREAM }}
              >
                <div
                  className="pointer-events-none absolute -top-16 h-40 w-40 rounded-full opacity-40 blur-3xl"
                  style={{ background: SURFACE, insetInlineStart: "-2rem" }}
                />
                <div
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl shadow-inner"
                  style={{ background: GOLD }}
                >
                  <active.icon className="h-7 w-7" style={{ color: INK }} />
                </div>
                <div className="relative z-10 flex-1">
                  <h2
                    className="text-2xl font-bold leading-tight lg:text-3xl"
                    style={{ fontFamily: "'DM Serif Display', serif" }}
                  >
                    {ar ? active.titleAr : active.titleEn}
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: "rgba(245,240,224,0.75)" }}>
                    {ar ? active.descAr : active.descEn}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  aria-label={T.modalClose}
                  className="relative z-10 grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/10"
                  style={{ color: CREAM }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="grid gap-8 p-8 md:grid-cols-2">
                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-px flex-1" style={{ background: "rgba(6,78,59,0.15)" }} />
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: INK, opacity: 0.6 }}
                    >
                      {T.modalFeatures}
                    </span>
                    <div className="h-px flex-1" style={{ background: "rgba(6,78,59,0.15)" }} />
                  </div>
                  <ul className="space-y-3">
                    {(ar ? active.featuresAr : active.featuresEn).map((f, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                          style={{ background: "rgba(13,122,95,0.15)" }}
                        >
                          <Check className="h-3 w-3" style={{ color: SURFACE }} />
                        </span>
                        <span className="text-sm leading-relaxed text-stone-700">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="h-px flex-1" style={{ background: "rgba(6,78,59,0.15)" }} />
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: INK, opacity: 0.6 }}
                    >
                      {T.modalSteps}
                    </span>
                    <div className="h-px flex-1" style={{ background: "rgba(6,78,59,0.15)" }} />
                  </div>
                  <ol className="space-y-3">
                    {(ar ? active.stepsAr : active.stepsEn).map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                          style={{ background: GOLD, color: INK }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-sm leading-relaxed text-stone-700">{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Footer */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 border-t px-8 py-5"
                style={{ borderColor: "rgba(6,78,59,0.08)", background: "rgba(245,240,224,0.4)" }}
              >
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="text-sm font-semibold text-stone-500 transition hover:text-stone-800"
                >
                  {T.modalClose}
                </button>
                <Link
                  to={active.ctaPath}
                  onClick={() => setActive(null)}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-md transition hover:scale-105"
                  style={{ background: INK, color: CREAM }}
                >
                  {T.modalCta}
                  <Arrow className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <WelcomeTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </section>
  );
}

export default OpeningExperience;
