import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
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
} from "lucide-react";

/**
 * OpeningExperience — a "services theater" landing intro that opens the app
 * with a dramatic split-screen presentation of every service Aqari offers.
 *
 * Palette (locked, direction v2): Emerald Prestige
 *   ink   #064e3b   surface #0d7a5f   gold #c9a84c   cream #f5f0e0
 *
 * Typography: DM Serif Display (headings) + Fira Sans (body).
 * Fonts are loaded globally via <link> in __root.tsx / index.html.
 */

const INK = "#064e3b";
const SURFACE = "#0d7a5f";
const GOLD = "#c9a84c";
const CREAM = "#f5f0e0";

type Service = {
  icon: typeof Building2;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
};

const SERVICES: Service[] = [
  {
    icon: Building2,
    titleAr: "إدارة الوحدات",
    titleEn: "Units Management",
    descAr: "تتبع دقيق لكل متر مربع",
    descEn: "Precise tracking for every unit",
  },
  {
    icon: FileText,
    titleAr: "العقود والإيجارات",
    titleEn: "Contracts & Leases",
    descAr: "توثيق العقود وجدولة الدفعات",
    descEn: "Documented contracts & payment plans",
  },
  {
    icon: Calculator,
    titleAr: "الفواتير و ZATCA",
    titleEn: "Billing & ZATCA",
    descAr: "فوترة إلكترونية متوافقة بالكامل",
    descEn: "Fully compliant e-invoicing",
  },
  {
    icon: Users2,
    titleAr: "نظام CRM",
    titleEn: "CRM Suite",
    descAr: "إدارة الملاك والمستأجرين",
    descEn: "Owners & tenants pipeline",
  },
  {
    icon: Gavel,
    titleAr: "المزادات",
    titleEn: "Auctions",
    descAr: "مزادات ذكية وشفافة",
    descEn: "Smart, transparent auctions",
  },
  {
    icon: BarChart3,
    titleAr: "التقارير الذكية",
    titleEn: "Smart Reports",
    descAr: "بيانات تدعم اتخاذ القرار",
    descEn: "Insights that drive decisions",
  },
  {
    icon: Wrench,
    titleAr: "الصيانة",
    titleEn: "Maintenance",
    descAr: "جدولة ومتابعة المهام",
    descEn: "Schedule & track work orders",
  },
];

export function OpeningExperience() {
  const { i18n } = useTranslation();
  const ar = (i18n.language || "ar").startsWith("ar");
  const dir = ar ? "rtl" : "ltr";
  const Arrow = ar ? ArrowLeft : ArrowRight;

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
    featureTitle: ar ? "المساعد الذكي بالعربية" : "Arabic AI Assistant",
    featureBody: ar
      ? "حلول استباقية وتنبؤات مالية مدعومة بالذكاء الاصطناعي لفهم سوقك العقاري."
      : "Proactive answers and financial forecasts powered by AI, tuned for your portfolio.",
    joinTitle: ar ? "انضم لرواد العقار" : "Join the property leaders",
    joinSub: ar
      ? "أكثر من ١٠٠٠ شريك نجاح يثقون بـ Aqari"
      : "Over 1,000 partners already trust Aqari",
    servicesEyebrow: ar ? "خدمات المنصة" : "Platform services",
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
      {/* The "vault" opens on mount */}
      <motion.main
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="flex w-full max-w-7xl flex-col overflow-hidden rounded-[48px] border border-white/60 bg-white shadow-[0_40px_100px_-20px_rgba(6,78,59,0.25)] lg:flex-row"
      >
        {/* HERO PANEL — right in RTL, left in LTR */}
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
              <span
                className="inline-flex h-2 w-2 rounded-full"
                style={{ background: GOLD }}
              />
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
                style={{
                  borderColor: "rgba(245,240,224,0.25)",
                  color: CREAM,
                }}
              >
                <Play className="h-4 w-4" />
                {T.ctaSecondary}
              </Link>
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
                <span
                  className="text-lg font-bold"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
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
              <span
                className="text-lg font-bold"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
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
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px w-10" style={{ background: GOLD }} />
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: INK, opacity: 0.6 }}
            >
              {T.servicesEyebrow}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
            {/* Featured card — AI Assistant */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className="group relative col-span-2 overflow-hidden rounded-[2.5rem] p-8 shadow-lg transition-all hover:-translate-y-1"
              style={{ background: SURFACE }}
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
                  {T.featureTitle}
                </h3>
                <p className="text-sm leading-relaxed text-white/75">
                  {T.featureBody}
                </p>
              </div>
            </motion.div>

            {SERVICES.map((s, idx) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.titleEn}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + idx * 0.05, duration: 0.45 }}
                  className="group rounded-[2rem] border bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
                  style={{ borderColor: "rgba(6,78,59,0.08)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = GOLD;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(6,78,59,0.08)";
                  }}
                >
                  <div
                    className="mb-5 grid h-12 w-12 place-items-center rounded-xl transition-colors"
                    style={{ background: "rgba(6,78,59,0.06)" }}
                  >
                    <Icon className="h-6 w-6" style={{ color: INK }} />
                  </div>
                  <h3
                    className="mb-1 text-sm font-bold"
                    style={{ color: INK }}
                  >
                    {ar ? s.titleAr : s.titleEn}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    {ar ? s.descAr : s.descEn}
                  </p>
                </motion.div>
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
    </section>
  );
}

export default OpeningExperience;
