import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { Link, ClientOnly } from "@tanstack/react-router";
import {
  Building2,
  FileText,
  Users2,
  Calculator,
  Wrench,
  BarChart3,
  Bot,
  Zap,
  Cloud,
  UserCog,
  User,
  LineChart,
  Menu,
  X,
  ChevronDown,
  Check,
  Sparkles,
  Play,
  ArrowRight,
  MapPin,
  TrendingUp,
  ShieldCheck,
  Star,
  Twitter,
  Linkedin,
  Youtube,
  Mail,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { HBS } from "./tokens";
import { SaudiMap3D } from "./SaudiMap3D";
import { SaudiMap } from "./SaudiMap";
import { Particles } from "./Particles";
import { BookDemoDialog } from "./BookDemoDialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import unitVilla from "@/assets/units/villa-riyadh.jpg";
import unitApartment from "@/assets/units/apartment-jeddah.jpg";
import unitOffice from "@/assets/units/office-riyadh.jpg";
import unitCommercial from "@/assets/units/commercial-riyadh.jpg";
import unitWarehouse from "@/assets/units/warehouse-dammam.jpg";
import unitLand from "@/assets/units/land-yanbu.jpg";

// tiny shared store to open the demo dialog from any section
let demoOpen = false;
const demoListeners = new Set<() => void>();
export function openDemoModal() {
  demoOpen = true;
  demoListeners.forEach((l) => l());
}
function setDemoOpen(v: boolean) {
  demoOpen = v;
  demoListeners.forEach((l) => l());
}
export function DemoModalRoot() {
  const open = useSyncExternalStore(
    (cb) => {
      demoListeners.add(cb);
      return () => demoListeners.delete(cb);
    },
    () => demoOpen,
    () => false,
  );
  return <BookDemoDialog open={open} onOpenChange={setDemoOpen} />;
}

const HeroCanvas = lazy(() => import("./HeroCanvas"));

// ---------- Shared UI ---------- //

const glass =
  "rounded-3xl border backdrop-blur-xl bg-white/[0.03] shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)]";
const glassStyle = { borderColor: HBS.border };

function SectionHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-14 max-w-3xl text-center">
      <div className="mb-3 text-xs uppercase tracking-[0.3em]" style={{ color: HBS.gold }}>
        {eyebrow}
      </div>
      <h2 className="text-3xl font-bold text-white sm:text-5xl">{title}</h2>
      {sub && (
        <p className="mt-4 text-base" style={{ color: HBS.gray }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ---------- Navbar ---------- //

export function Navbar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 20);
    on();
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);
  const links: [string, string][] = [
    [t("hbspro.nav.features"), "#features"],
    [t("hbspro.nav.ai"), "#ai"],
    [t("hbspro.nav.pricing"), "#pricing"],
    [t("hbspro.nav.testimonials"), "#testimonials"],
    [t("hbspro.nav.faq"), "#faq"],
  ];
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all ${scrolled ? "py-2" : "py-4"}`}
      style={{
        background: scrolled ? "rgba(7,19,32,0.75)" : "transparent",
        backdropFilter: scrolled ? "blur(18px)" : "none",
        borderBottom: scrolled ? `1px solid ${HBS.border}` : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: `linear-gradient(135deg, ${HBS.gold}, ${HBS.blue})` }}
          >
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white">
            HBS<span style={{ color: HBS.gold }}>pro</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-5 lg:flex lg:gap-8">
          {links.map(([l, h]) => (
            <a key={l} href={h} className="text-sm text-slate-300 transition hover:text-white">
              {l}
            </a>
          ))}
          <Link to="/compare" className="text-sm text-slate-300 transition hover:text-white">
            {t("hbspro.nav.compare")}
          </Link>
        </nav>
        <div className="hidden items-center gap-2 md:flex lg:gap-3">
          <ThemeToggle />
          <Link to="/dashboard" className="text-sm text-slate-300 transition hover:text-white">
            {t("hbspro.nav.employeeDashboard")}
          </Link>
          <Link to="/admin" className="text-sm text-slate-300 transition hover:text-white">
            {t("hbspro.nav.adminDashboard")}
          </Link>
          <Link to="/auth" className="text-sm text-slate-300 hover:text-white">
            {t("hbspro.nav.signIn")}
          </Link>
          <button
            type="button"
            onClick={openDemoModal}
            className="rounded-full border px-4 py-2 text-sm text-white transition hover:bg-white/5"
            style={{ borderColor: HBS.border }}
          >
            {t("hbspro.nav.bookDemo")}
          </button>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="rounded-full px-5 py-2 text-sm font-semibold text-slate-900"
            style={{ background: HBS.gold }}
          >
            {t("hbspro.nav.signUp")}
          </Link>
        </div>
        <button
          className="md:hidden text-white"
          onClick={() => setOpen(!open)}
          aria-label={open ? "إغلاق قائمة التنقل" : "فتح قائمة التنقل"}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div
          className="md:hidden mx-6 mt-3 rounded-2xl border p-4"
          style={{ borderColor: HBS.border, background: "rgba(7,19,32,0.95)" }}
        >
          {links.map(([l, h]) => (
            <a
              key={l}
              href={h}
              className="block py-2 text-slate-200"
              onClick={() => setOpen(false)}
            >
              {l}
            </a>
          ))}
          <Link to="/compare" onClick={() => setOpen(false)} className="block py-2 text-slate-200">
            {t("hbspro.nav.compare")}
          </Link>
          <div className="mt-3 grid gap-2">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              onClick={() => setOpen(false)}
              className="block rounded-full px-4 py-2 text-center text-sm font-semibold text-slate-900"
              style={{ background: HBS.gold }}
            >
              {t("hbspro.nav.signUp")}
            </Link>
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="block rounded-full border px-4 py-2 text-center text-sm text-white"
              style={{ borderColor: HBS.border }}
            >
              {t("hbspro.nav.employeeDashboard")}
            </Link>
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="block rounded-full border px-4 py-2 text-center text-sm text-white"
              style={{ borderColor: HBS.border }}
            >
              {t("hbspro.nav.adminDashboard")}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

// ---------- Hero ---------- //

export function Hero() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const dir = isAr ? "rtl" : "ltr";

  const L = {
    titleTop: isAr ? "إدارة أملاكك" : "Manage your properties",
    titleBottom: isAr ? "بذكاء واحترافية" : "with intelligence & finesse",
    sub: isAr
      ? "منصة متكاملة لإدارة العقارات والعقود والمستأجرين والصيانة والمحاسبة مدعومة بالذكاء الاصطناعي."
      : "One platform for properties, contracts, tenants, maintenance and accounting — powered by AI.",
    startFree: isAr ? "ابدأ تجربة مجانية" : "Start Free Trial",
    bookDemo: isAr ? "احجز عرض توضيحي" : "Book a Demo",
    trust: [
      { icon: Sparkles, label: isAr ? "مدعوم بالذكاء الاصطناعي" : "AI Powered" },
      { icon: ShieldCheck, label: isAr ? "أمن وموثوق" : "Secure & Trusted" },
      { icon: Check, label: isAr ? "متوافق مع رؤية 2030" : "Vision 2030" },
    ] as const,
    kpis: [
      {
        icon: Building2,
        label: isAr ? "إجمالي العقارات" : "Total Properties",
        value: "24,568",
        delta: isAr ? "12.5%+ عن الشهر الماضي" : "+12.5% vs last month",
      },
      {
        icon: BarChart3,
        label: isAr ? "نسبة الإشغال" : "Occupancy Rate",
        value: "87.6%",
        delta: isAr ? "8.4%+ عن الشهر الماضي" : "+8.4% vs last month",
      },
      {
        icon: TrendingUp,
        label: isAr ? "إيرادات هذا الشهر" : "Monthly Revenue",
        value: "8,568,125",
        delta: isAr ? "15.7%+ عن الشهر الماضي" : "+15.7% vs last month",
      },
      {
        icon: Wrench,
        label: isAr ? "طلبات الصيانة" : "Maintenance",
        value: "142",
        delta: isAr ? "5.2%− عن الشهر الماضي" : "−5.2% vs last month",
      },
      {
        icon: FileText,
        label: isAr ? "العقود النشطة" : "Active Contracts",
        value: "6,245",
        delta: isAr ? "9.1%+" : "+9.1%",
      },
      {
        icon: Users2,
        label: isAr ? "المستأجرين" : "Tenants",
        value: "10,254",
        delta: isAr ? "6.3%+" : "+6.3%",
      },
    ] as const,
  };

  return (
    <section
      dir="ltr"
      className="relative overflow-hidden pt-28 pb-16"
      style={{ background: HBS.bg }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(1200px 700px at 70% 35%, rgba(59,111,160,0.20), transparent 60%), radial-gradient(900px 500px at 20% 20%, rgba(30,58,95,0.22), transparent 60%)`,
          }}
        />
        <Particles density={30} />
      </div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-12 items-center gap-8 px-6">
        {/* Text column */}
        <div
          dir={dir}
          className={`col-span-12 lg:col-span-5 lg:order-1 ${isAr ? "text-right" : "text-left"}`}
        >
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-4xl font-extrabold leading-[1.1] text-white sm:text-5xl lg:text-6xl"
          >
            <span className="block">{L.titleTop}</span>
            <span
              className="block"
              style={{
                background: `linear-gradient(90deg, ${HBS.gold}, ${HBS.goldSoft})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {L.titleBottom}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-5 max-w-xl text-base sm:text-lg"
            style={{ color: HBS.gray }}
          >
            {L.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a
              href="#cta"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5"
              style={{ background: HBS.gold, boxShadow: `0 12px 32px -10px ${HBS.gold}` }}
            >
              {L.startFree}
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={openDemoModal}
              className="inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
              style={{ borderColor: HBS.border }}
            >
              <Play className="h-4 w-4" /> {L.bookDemo}
            </button>
          </motion.div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            {L.trust.map((t) => {
              const Icon = t.icon;
              return (
                <span
                  key={t.label}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px]"
                  style={{
                    borderColor: HBS.border,
                    color: HBS.goldSoft,
                    background: "rgba(212,175,55,0.05)",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Map + KPI rail column */}
        <div dir="ltr" className="col-span-12 lg:col-span-7 lg:order-2">
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9 }}
              className="relative pr-40 sm:pr-48"
            >
              <div
                className="overflow-hidden rounded-3xl border"
                style={{
                  borderColor: HBS.border,
                  background: `radial-gradient(600px 400px at 55% 45%, rgba(30,136,229,0.18), rgba(7,19,32,0.9))`,
                  boxShadow: `0 30px 80px -30px rgba(212,175,55,0.35)`,
                }}
              >
                <SaudiMap compact />
              </div>
            </motion.div>

            {/* KPI rail — absolute on the far edge */}
            <div className="pointer-events-none absolute top-0 right-0 hidden h-full w-40 flex-col justify-between gap-2 lg:flex">
              {L.kpis.map((k, i) => {
                const Icon = k.icon;
                return (
                  <motion.div
                    key={k.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 + i * 0.07 }}
                    dir={dir}
                    className="pointer-events-auto rounded-xl border p-2.5 backdrop-blur-md"
                    style={{
                      borderColor: HBS.border,
                      background: "rgba(11,27,44,0.75)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[10px]" style={{ color: HBS.gray }}>
                          {k.label}
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-white">{k.value}</div>
                        <div className="mt-0.5 text-[9px]" style={{ color: HBS.goldSoft }}>
                          {k.delta}
                        </div>
                      </div>
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                        style={{ background: "rgba(212,175,55,0.14)", color: HBS.gold }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Saudi Map Section ---------- //

export function MapSection() {
  const { t } = useTranslation();
  return (
    <section id="map" className="relative py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={t("hbspro.map.eyebrow")}
          title={t("hbspro.map.title")}
          sub={t("hbspro.map.sub")}
        />
        <div className={`${glass} p-2 sm:p-4`} style={glassStyle}>
          <SaudiMap3D />
        </div>
      </div>
    </section>
  );
}

// ---------- Stats ---------- //

export function Stats() {
  const { t } = useTranslation();
  const filters: { id: "month" | "quarter" | "year"; label: string; mult: number }[] = [
    { id: "month", label: t("hbspro.stats.month", { defaultValue: "شهري" }), mult: 0.35 },
    { id: "quarter", label: t("hbspro.stats.quarter", { defaultValue: "ربع سنوي" }), mult: 0.7 },
    { id: "year", label: t("hbspro.stats.year", { defaultValue: "سنوي" }), mult: 1 },
  ];
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("year");
  const mult = filters.find((f) => f.id === period)?.mult ?? 1;
  const items = [
    { value: 12400 * mult, suffix: "+", prefix: "", v: t("hbspro.stats.managed"), delta: "+8.2%" },
    {
      value: 4.2 * mult,
      suffix: "B",
      prefix: "SAR ",
      decimals: 1,
      v: t("hbspro.stats.aum"),
      delta: "+12.4%",
    },
    { value: 480 * mult, suffix: "+", prefix: "", v: t("hbspro.stats.companies"), delta: "+5.1%" },
    {
      value: 99.98,
      suffix: "%",
      prefix: "",
      decimals: 2,
      v: t("hbspro.stats.uptime"),
      delta: "SLA",
    },
  ];
  return (
    <section
      className="border-y py-10 md:py-14"
      style={{ borderColor: HBS.border, background: "rgba(255,255,255,0.02)" }}
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em]" style={{ color: HBS.gold }}>
              {t("hbspro.stats.eyebrow", { defaultValue: "أرقام حية" })}
            </div>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              {t("hbspro.stats.title", { defaultValue: "أداء المنصة في لمحة" })}
            </h2>
          </div>
          <div
            className="inline-flex rounded-full border p-1"
            style={{ borderColor: HBS.border, background: "rgba(255,255,255,0.03)" }}
          >
            {filters.map((f) => {
              const active = period === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setPeriod(f.id)}
                  className="rounded-full px-4 py-1.5 text-xs font-medium transition-all"
                  style={{
                    background: active
                      ? `linear-gradient(90deg, ${HBS.gold}, ${HBS.blueSoft})`
                      : "transparent",
                    color: active ? "#0B1220" : HBS.gray,
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {items.map((s, i) => (
            <motion.div
              key={s.v}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="rounded-2xl border p-5 backdrop-blur-md"
              style={{ borderColor: HBS.border, background: "rgba(255,255,255,0.03)" }}
            >
              <div className="flex items-baseline justify-between">
                <div
                  className="text-3xl font-bold sm:text-4xl"
                  style={{
                    background: `linear-gradient(90deg, ${HBS.gold}, ${HBS.blueSoft})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.prefix}
                  <CountUp to={s.value} decimals={s.decimals ?? 0} />
                  {s.suffix}
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: "rgba(212,168,83,0.12)", color: HBS.gold }}
                >
                  {s.delta}
                </span>
              </div>
              <div className="mt-2 text-sm" style={{ color: HBS.gray }}>
                {s.v}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CountUp({
  to,
  decimals = 0,
  duration = 1200,
}: {
  to: number;
  decimals?: number;
  duration?: number;
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  const formatted = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString("en-US");
  return <>{formatted}</>;
}

// ---------- Features ---------- //

const FEATURES = [
  { i: Building2, k: "property" },
  { i: FileText, k: "lease" },
  { i: Users2, k: "crm" },
  { i: Calculator, k: "acc" },
  { i: Wrench, k: "maint" },
  { i: BarChart3, k: "reports" },
  { i: Bot, k: "ai" },
  { i: Zap, k: "auto" },
  { i: Cloud, k: "cloud" },
  { i: UserCog, k: "owner" },
  { i: User, k: "tenant" },
  { i: LineChart, k: "analytics" },
] as const;

export function Features() {
  const { t } = useTranslation();
  return (
    <section id="features" className="relative py-16 md:py-24">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(600px 300px at 50% 0%, ${HBS.gold}0d, transparent 70%)`,
        }}
      />
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={t("hbspro.features.eyebrow")}
          title={t("hbspro.features.title")}
          sub={t("hbspro.features.sub")}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURES.map(({ i: Icon, k }, idx) => (
            <motion.div
              key={k}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                delay: (idx % 4) * 0.06 + Math.floor(idx / 4) * 0.08,
                duration: 0.5,
                ease: "easeOut",
              }}
              whileHover={{ y: -8 }}
              className={`${glass} group relative overflow-hidden p-6 transition-colors`}
              style={glassStyle}
            >
              <div
                className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background: `radial-gradient(320px 220px at 50% 0%, ${HBS.gold}22, transparent 70%)`,
                }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                  background: `linear-gradient(90deg, transparent, ${HBS.gold}, transparent)`,
                }}
              />
              <motion.div
                whileHover={{ rotate: -6, scale: 1.08 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className="mb-4 grid h-12 w-12 place-items-center rounded-xl transition-colors group-hover:shadow-[0_0_24px_rgba(212,168,83,0.35)]"
                style={{
                  background: `${HBS.gold}18`,
                  color: HBS.gold,
                  border: `1px solid ${HBS.gold}30`,
                }}
              >
                <Icon className="h-5 w-5" />
              </motion.div>
              <h3 className="text-lg font-semibold text-white">
                {t(`hbspro.features.items.${k}.t`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: HBS.gray }}>
                {t(`hbspro.features.items.${k}.d`)}
              </p>
              <div
                className="mt-4 flex items-center gap-1 text-xs font-medium opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
                style={{ color: HBS.gold }}
              >
                <span>{t("hbspro.features.learn", { defaultValue: "اعرف المزيد" })}</span>
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Dashboard Preview ---------- //

export function DashboardPreview() {
  const { t, i18n } = useTranslation();
  const dir = i18n.language?.startsWith("ar") ? "rtl" : "ltr";
  const rev = Array.from({ length: 12 }).map((_, i) => ({
    m: `M${i + 1}`,
    v: 120 + Math.sin(i) * 20 + i * 8,
  }));
  const occ = [
    { n: "Occ", v: 78 },
    { n: "Empty", v: 22 },
  ];
  const kpis = [
    { id: "rev", l: t("hbspro.dashboard.kRevenue"), v: "SAR 2.84M", d: "+12%", icon: TrendingUp },
    { id: "occ", l: t("hbspro.dashboard.kOccupancy"), v: "96.4%", d: "+4.2%", icon: Building2 },
    { id: "tic", l: t("hbspro.dashboard.kTickets"), v: "18", d: "-6", icon: Wrench },
    { id: "ren", l: t("hbspro.dashboard.kRenewals"), v: "42", d: "+9", icon: FileText },
  ];
  const [active, setActive] = useState("rev");
  return (
    <section id="dashboard" dir={dir} className="relative py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={t("hbspro.dashboard.eyebrow")}
          title={t("hbspro.dashboard.title")}
        />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className={`${glass} overflow-hidden p-3`}
          style={glassStyle}
        >
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            {/* sidebar */}
            <aside
              className="hidden rounded-2xl p-4 md:block"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <div className="mb-6 flex items-center gap-2 text-white">
                <div
                  className="grid h-8 w-8 place-items-center rounded-lg"
                  style={{ background: HBS.gold, color: "#071320" }}
                >
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold">Aqari</span>
              </div>
              {(
                [
                  "overview",
                  "properties",
                  "contracts",
                  "invoices",
                  "tenants",
                  "owners",
                  "maintenance",
                  "reports",
                ] as const
              ).map((k, i) => (
                <div
                  key={k}
                  className={`mb-1 cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors hover:text-white hover:bg-white/5 ${i === 0 ? "text-white" : "text-slate-400"}`}
                  style={i === 0 ? { background: "rgba(212,175,55,0.15)" } : {}}
                >
                  {t(`hbspro.dashboard.side.${k}`)}
                </div>
              ))}
            </aside>
            {/* main */}
            <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs" style={{ color: HBS.gray }}>
                    {t("hbspro.dashboard.goodMorning")}
                  </div>
                  <div className="text-lg font-semibold text-white">
                    {t("hbspro.dashboard.overview")}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs" style={{ color: HBS.gray }}>
                  <span
                    className="rounded-full px-3 py-1"
                    style={{ background: "rgba(30,136,229,0.15)", color: HBS.blueSoft }}
                  >
                    {t("hbspro.dashboard.live")}
                  </span>
                  <span>{t("hbspro.dashboard.city")}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {kpis.map((c, i) => {
                  const isActive = active === c.id;
                  const Icon = c.icon;
                  return (
                    <motion.button
                      key={c.id}
                      onClick={() => setActive(c.id)}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06 }}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.97 }}
                      className="group relative overflow-hidden rounded-xl border p-4 text-start transition-colors"
                      style={{
                        borderColor: isActive ? HBS.gold : HBS.border,
                        background: isActive ? "rgba(212,168,83,0.08)" : "rgba(255,255,255,0.02)",
                        boxShadow: isActive ? `0 0 24px ${HBS.gold}33` : "none",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs" style={{ color: HBS.gray }}>
                          {c.l}
                        </div>
                        <Icon
                          className="h-4 w-4 transition-transform group-hover:scale-110"
                          style={{ color: HBS.gold }}
                        />
                      </div>
                      <div className="mt-1 text-xl font-bold text-white">{c.v}</div>
                      <div className="text-xs" style={{ color: HBS.gold }}>
                        {c.d}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div
                  className="rounded-xl border p-4 md:col-span-2"
                  style={{ borderColor: HBS.border }}
                  dir="ltr"
                >
                  <div className="mb-2 text-sm text-white">
                    {t("hbspro.dashboard.revenueTrend")}
                  </div>
                  <div className="h-40">
                    <ResponsiveContainer>
                      <AreaChart data={rev}>
                        <defs>
                          <linearGradient id="gr" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={HBS.blue} stopOpacity={0.6} />
                            <stop offset="100%" stopColor={HBS.blue} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Tooltip
                          contentStyle={{
                            background: "#071320",
                            border: `1px solid ${HBS.border}`,
                            borderRadius: 12,
                            color: "white",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="v"
                          stroke={HBS.blue}
                          strokeWidth={2}
                          fill="url(#gr)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: HBS.border }}
                  dir="ltr"
                >
                  <div className="mb-2 text-sm text-white">
                    {t("hbspro.dashboard.occupancyTitle")}
                  </div>
                  <div className="h-40">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={occ}
                          dataKey="v"
                          innerRadius={40}
                          outerRadius={60}
                          paddingAngle={4}
                        >
                          <Cell fill={HBS.gold} />
                          <Cell fill="#1e2a3a" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border p-4" style={{ borderColor: HBS.border }}>
                  <div className="mb-3 text-sm text-white">
                    {t("hbspro.dashboard.recentActivity")}
                  </div>
                  {(["a1", "a2", "a3", "a4"] as const).map((a) => (
                    <div
                      key={a}
                      className="cursor-pointer border-t py-2 text-xs transition-colors hover:text-white"
                      style={{ borderColor: HBS.border, color: HBS.gray }}
                    >
                      {t(`hbspro.dashboard.activity.${a}`)}
                    </div>
                  ))}
                </div>
                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: HBS.border }}
                  dir="ltr"
                >
                  <div className="mb-3 text-sm text-white">
                    {t("hbspro.dashboard.maintenanceLoad")}
                  </div>
                  <div className="h-32">
                    <ResponsiveContainer>
                      <BarChart
                        data={[
                          { n: "M", v: 8 },
                          { n: "T", v: 14 },
                          { n: "W", v: 10 },
                          { n: "T", v: 18 },
                          { n: "F", v: 12 },
                          { n: "S", v: 6 },
                          { n: "S", v: 4 },
                        ]}
                      >
                        <Bar dataKey="v" fill={HBS.gold} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ---------- Property Slider ---------- //

const PROPS = [
  { tk: "i1", typeK: "villa", locK: "riyadh", price: "SAR 3.2M", occK: "occupied", img: unitVilla },
  {
    tk: "i2",
    typeK: "apartment",
    locK: "jeddah",
    price: "SAR 1.8M",
    occLit: "94%",
    img: unitApartment,
  },
  { tk: "i3", typeK: "office", locK: "riyadh", price: "SAR 5.6M", occLit: "100%", img: unitOffice },
  {
    tk: "i4",
    typeK: "commercial",
    locK: "riyadh",
    price: "SAR 9.1M",
    occLit: "82%",
    img: unitCommercial,
  },
  {
    tk: "i5",
    typeK: "warehouse",
    locK: "dammam",
    price: "SAR 12M",
    occLit: "76%",
    img: unitWarehouse,
  },
  { tk: "i6", typeK: "land", locK: "yanbu", price: "SAR 24M", occK: "na", img: unitLand },
] as const;

export function PropertySlider() {
  const { t, i18n } = useTranslation();
  const dir = i18n.language?.startsWith("ar") ? "rtl" : "ltr";
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(PROPS.length - 1, i));
    const cardW = el.scrollWidth / PROPS.length;
    el.scrollTo({ left: (dir === "rtl" ? -1 : 1) * clamped * cardW, behavior: "smooth" });
  };
  const scrollBy = (delta: number) => goTo(index + delta);
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const cardW = el.scrollWidth / PROPS.length;
    const raw = Math.abs(el.scrollLeft) / cardW;
    setIndex(Math.min(PROPS.length - 1, Math.round(raw)));
  };
  // Autoplay: pause on hover/touch and when the tab is hidden.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      const el = scrollerRef.current;
      if (!el || document.hidden) return;
      const cardW = el.scrollWidth / PROPS.length;
      const raw = Math.abs(el.scrollLeft) / cardW;
      const cur = Math.round(raw);
      const next = (cur + 1) % PROPS.length;
      el.scrollTo({ left: (dir === "rtl" ? -1 : 1) * next * cardW, behavior: "smooth" });
    }, 4500);
    return () => window.clearInterval(id);
  }, [paused, dir]);
  return (
    <section className="py-12 sm:py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6" dir={dir}>
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:mb-8 sm:flex-row sm:items-end">
          <SectionHeader
            eyebrow={t("hbspro.portfolio.eyebrow")}
            title={t("hbspro.portfolio.title")}
          />
          <div className="flex shrink-0 items-center gap-2 self-end">
            <button
              onClick={() => scrollBy(-1)}
              aria-label="prev"
              className="grid h-10 w-10 place-items-center rounded-full border transition-all hover:scale-105 sm:h-11 sm:w-11"
              style={{
                borderColor: HBS.gold,
                color: HBS.gold,
                background: "rgba(212,168,83,0.08)",
              }}
            >
              <ArrowRight className="h-4 w-4 rotate-180 rtl:rotate-0" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label="next"
              className="grid h-10 w-10 place-items-center rounded-full transition-all hover:scale-105 sm:h-11 sm:w-11"
              style={{
                background: `linear-gradient(135deg, ${HBS.gold}, ${HBS.blueSoft})`,
                color: "#071320",
              }}
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </div>
        </div>
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          className="hbs-scroller flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-6 sm:gap-5"
          style={{
            scrollbarWidth: "none",
            scrollBehavior: "smooth",
            WebkitOverflowScrolling: "touch",
            scrollSnapType: "x mandatory",
          }}
        >
          {PROPS.map((p, i) => {
            const name = t(`hbspro.portfolio.items.${p.tk}`);
            const type = t(`hbspro.portfolio.types.${p.typeK}`);
            const city = t(`hbspro.portfolio.cities.${p.locK}`);
            const altText = t("hbspro.portfolio.alt", {
              type,
              name,
              city,
              defaultValue: `${type} — ${name} في ${city}`,
            });
            const summary = t(`hbspro.portfolio.summaries.${p.tk}`, {
              type,
              city,
              defaultValue: `${type} فاخر في ${city} بمواصفات عالية وإدارة ذكية.`,
            });
            return (
              <motion.div
                key={p.tk}
                whileHover={{ y: -8 }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.5, ease: "easeOut" }}
                className={`${glass} shrink-0 snap-center overflow-hidden basis-[88%] sm:basis-[48%] sm:snap-start lg:basis-[32%]`}
                style={glassStyle}
              >
                <div className="relative h-40 overflow-hidden sm:h-44">
                  <img
                    src={p.img}
                    alt={altText}
                    loading="lazy"
                    width={1024}
                    height={1024}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out hover:scale-105"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: "linear-gradient(rgba(7,19,32,0) 30%, rgba(7,19,32,0.92))",
                    }}
                  />
                  <div
                    className="absolute top-4 rounded-full px-3 py-1 text-xs font-semibold shadow-lg start-4"
                    style={{
                      background: `linear-gradient(135deg, ${HBS.gold}, #f0c674)`,
                      color: "#071320",
                    }}
                  >
                    {type}
                  </div>
                  <div className="absolute bottom-3 flex items-center gap-1 text-xs text-white start-4">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {city}
                  </div>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="text-base font-semibold text-white sm:text-lg">{name}</div>
                  <p
                    className="mt-1.5 line-clamp-2 text-xs leading-relaxed"
                    style={{ color: HBS.gray }}
                  >
                    {summary}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs sm:text-sm">
                    <span style={{ color: HBS.gold }}>{p.price}</span>
                    <span style={{ color: HBS.gray }}>
                      {"occK" in p ? t(`hbspro.portfolio.occ.${p.occK}`) : p.occLit}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 sm:mt-6">
          {PROPS.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`slide ${i + 1}`}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: index === i ? 28 : 10,
                background: index === i ? HBS.gold : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>
        {/* Unit cards grid under the slider */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-14 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {PROPS.map((p, i) => {
            const name = t(`hbspro.portfolio.items.${p.tk}`);
            const type = t(`hbspro.portfolio.types.${p.typeK}`);
            const city = t(`hbspro.portfolio.cities.${p.locK}`);
            const altText = t("hbspro.portfolio.alt", {
              type,
              name,
              city,
              defaultValue: `${type} — ${name} في ${city}`,
            });
            const summary = t(`hbspro.portfolio.summaries.${p.tk}`, {
              type,
              city,
              defaultValue: `${type} فاخر في ${city} بمواصفات عالية وإدارة ذكية.`,
            });
            return (
              <motion.article
                key={`card-${p.tk}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: "easeOut" }}
                whileHover={{ y: -4 }}
                className={`${glass} group flex flex-col overflow-hidden`}
                style={glassStyle}
              >
                <div className="relative h-40 overflow-hidden">
                  <img
                    src={p.img}
                    alt={altText}
                    loading="lazy"
                    width={1024}
                    height={1024}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: "linear-gradient(rgba(7,19,32,0) 35%, rgba(7,19,32,0.9))",
                    }}
                  />
                  <div
                    className="absolute top-3 rounded-full px-3 py-1 text-[11px] font-semibold shadow-lg start-3"
                    style={{
                      background: `linear-gradient(135deg, ${HBS.gold}, #f0c674)`,
                      color: "#071320",
                    }}
                  >
                    {type}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
                  <div className="text-base font-semibold text-white sm:text-lg">{name}</div>
                  <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: HBS.gray }}>
                    {summary}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: HBS.gray }}>
                    <MapPin
                      className="h-3.5 w-3.5"
                      style={{ color: HBS.gold }}
                      aria-hidden="true"
                    />
                    {city}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                    <div className="flex flex-col">
                      <span className="text-[11px]" style={{ color: HBS.gray }}>
                        {t("hbspro.portfolio.startingFrom", { defaultValue: "يبدأ من" })}
                      </span>
                      <span className="text-lg font-bold leading-tight" style={{ color: HBS.gold }}>
                        {p.price}
                      </span>
                    </div>
                    <Link
                      to="/auth"
                      aria-label={t("hbspro.portfolio.viewDetailsFor", {
                        name,
                        defaultValue: `عرض تفاصيل ${name}`,
                      })}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, ${HBS.gold}, ${HBS.blueSoft})`,
                        color: "#071320",
                      }}
                    >
                      {t("hbspro.portfolio.viewDetails", { defaultValue: "عرض التفاصيل" })}
                      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
      <style>{`.hbs-scroller::-webkit-scrollbar{display:none}.hbs-scroller>*{scroll-snap-stop:always}`}</style>
    </section>
  );
}

// ---------- AI Section ---------- //

const CHAT_KEYS = [
  { r: "u", k: "u1" },
  { r: "a", k: "a1" },
  { r: "u", k: "u2" },
  { r: "a", k: "a2" },
] as const;

export function AISection() {
  const { t } = useTranslation();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setShown((n) => (n + 1) % (CHAT_KEYS.length + 1)), 1800);
    return () => clearInterval(iv);
  }, []);
  const forecast = Array.from({ length: 10 }).map((_, i) => ({
    x: i,
    v: 60 + i * 4 + Math.sin(i) * 6,
  }));
  return (
    <section id="ai" className="relative py-16 md:py-24">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(700px 400px at 70% 40%, rgba(30,136,229,0.15), transparent 60%)`,
        }}
      />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
        <div>
          <SectionHeader
            eyebrow={t("hbspro.ai.eyebrow")}
            title={t("hbspro.ai.title")}
            sub={t("hbspro.ai.sub")}
          />
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["gen", "rental", "reports", "forecast"] as const).map((c) => (
              <div key={c} className={`${glass} flex items-center gap-3 p-4`} style={glassStyle}>
                <Sparkles className="h-4 w-4" style={{ color: HBS.gold }} />
                <span className="text-sm text-white">{t(`hbspro.ai.capabilities.${c}`)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className={`${glass} p-5`} style={glassStyle}>
            <div className="mb-3 flex items-center gap-2 text-xs" style={{ color: HBS.gray }}>
              <div
                className="grid h-8 w-8 place-items-center rounded-full"
                style={{ background: `${HBS.gold}22` }}
              >
                <Bot className="h-4 w-4" style={{ color: HBS.gold }} />
              </div>
              {t("hbspro.ai.online")}
            </div>
            <div className="space-y-2">
              {CHAT_KEYS.slice(0, shown).map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${c.r === "u" ? "ml-auto text-white" : "text-white"}`}
                  style={
                    c.r === "u"
                      ? { background: "rgba(30,136,229,0.25)" }
                      : { background: "rgba(212,175,55,0.15)" }
                  }
                >
                  {t(`hbspro.ai.chat.${c.k}`)}
                </motion.div>
              ))}
              {shown < CHAT_KEYS.length && (
                <div
                  className="flex gap-1 rounded-2xl px-3 py-2 text-xs"
                  style={{ color: HBS.gray }}
                >
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full"
                    style={{ background: HBS.gold }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full"
                    style={{ background: HBS.gold, animationDelay: "0.15s" }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full"
                    style={{ background: HBS.gold, animationDelay: "0.3s" }}
                  />
                </div>
              )}
            </div>
            <div className="mt-4 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="mb-1 text-xs" style={{ color: HBS.gray }}>
                {t("hbspro.ai.forecastCap")}
              </div>
              <div className="h-28">
                <ResponsiveContainer>
                  <AreaChart data={forecast}>
                    <defs>
                      <linearGradient id="grAI" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={HBS.blue} stopOpacity={0.6} />
                        <stop offset="100%" stopColor={HBS.blue} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke={HBS.blueSoft}
                      strokeWidth={2}
                      fill="url(#grAI)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Integrations ---------- //

export function Integrations() {
  const { t } = useTranslation();
  const logos = [
    "ZATCA",
    "STC Pay",
    "Mada",
    "SADAD",
    "Absher",
    "Ejar",
    "Google",
    "Slack",
    "WhatsApp",
    "Zapier",
  ];
  return (
    <section id="integrations" className="relative py-14 md:py-20">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(600px 300px at 50% 50%, ${HBS.gold}0d, transparent 70%)`,
        }}
      />
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={t("hbspro.integrations.eyebrow")}
          title={t("hbspro.integrations.title")}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {logos.map((l, i) => (
            <motion.div
              key={l}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: (i % 5) * 0.05 + Math.floor(i / 5) * 0.08, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className={`${glass} group grid h-20 place-items-center text-sm font-semibold transition-all hover:border-[${HBS.gold}]`}
              style={{ ...glassStyle, color: HBS.gray }}
            >
              <span className="transition-all group-hover:text-white group-hover:[text-shadow:0_0_18px_rgba(212,168,83,0.6)]">
                {l}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Testimonials ---------- //

const T_KEYS = ["t1", "t2", "t3"] as const;

export function Testimonials() {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setActive((n) => (n + 1) % T_KEYS.length), 5000);
    return () => clearInterval(iv);
  }, []);
  const Card = ({ k, isActive }: { k: (typeof T_KEYS)[number]; isActive?: boolean }) => {
    const n = t(`hbspro.testimonials.${k}.n`);
    const r = t(`hbspro.testimonials.${k}.r`);
    const q = t(`hbspro.testimonials.${k}.q`);
    return (
      <motion.div
        whileHover={{ y: -6 }}
        transition={{ duration: 0.3 }}
        className={`${glass} group relative overflow-hidden p-6 transition-all duration-500`}
        style={{
          ...glassStyle,
          borderColor: isActive ? HBS.gold : HBS.border,
          boxShadow: isActive ? `0 20px 60px -20px ${HBS.gold}55` : "none",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(320px 220px at 50% 0%, ${HBS.gold}22, transparent 70%)`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: `linear-gradient(90deg, transparent, ${HBS.gold}, transparent)` }}
        />
        <div className="mb-3 flex gap-1" style={{ color: HBS.gold }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-4 w-4 fill-current" />
          ))}
        </div>
        <p className="text-sm text-white/90 leading-relaxed">"{q}"</p>
        <div className="mt-5 flex items-center gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-full font-semibold text-slate-900 transition-shadow group-hover:shadow-[0_0_20px_rgba(212,168,83,0.6)]"
            style={{ background: `linear-gradient(135deg, ${HBS.gold}, ${HBS.goldSoft})` }}
          >
            {n[0]}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{n}</div>
            <div className="text-xs" style={{ color: HBS.gray }}>
              {r}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };
  return (
    <section id="testimonials" className="relative py-16 md:py-24">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(600px 300px at 50% 50%, ${HBS.gold}0d, transparent 70%)`,
        }}
      />
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={t("hbspro.testimonials.eyebrow")}
          title={t("hbspro.testimonials.title")}
        />

        {/* Desktop grid */}
        <div className="hidden gap-5 md:grid md:grid-cols-3">
          {T_KEYS.map((k, i) => (
            <motion.div
              key={k}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <Card k={k} />
            </motion.div>
          ))}
        </div>

        {/* Mobile carousel */}
        <div className="md:hidden">
          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={T_KEYS[active]}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4 }}
              >
                <Card k={T_KEYS[active]} isActive />
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2">
            {T_KEYS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                aria-label={`slide ${i + 1}`}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: active === i ? 28 : 8,
                  background: active === i ? HBS.gold : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Pricing ---------- //

const PLAN_KEYS = [
  { k: "starter", hot: false },
  { k: "growth", hot: true },
  { k: "enterprise", hot: false },
] as const;

export function Pricing() {
  const { t } = useTranslation();
  return (
    <section id="pricing" className="relative py-16 md:py-24">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(700px 350px at 50% 0%, ${HBS.gold}0f, transparent 70%)`,
        }}
      />
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          eyebrow={t("hbspro.pricing.eyebrow")}
          title={t("hbspro.pricing.title")}
          sub={t("hbspro.pricing.sub")}
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {PLAN_KEYS.map((pl, i) => {
            const n = t(`hbspro.pricing.${pl.k}.n`);
            const p = t(`hbspro.pricing.${pl.k}.p`);
            const d = t(`hbspro.pricing.${pl.k}.d`);
            const f = t(`hbspro.pricing.${pl.k}.f`, { returnObjects: true }) as string[];
            return (
              <motion.div
                key={pl.k}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                className={`${glass} group relative overflow-hidden p-6 ${pl.hot ? "md:-translate-y-3 md:scale-[1.03]" : ""}`}
                style={
                  pl.hot
                    ? {
                        ...glassStyle,
                        borderColor: HBS.gold,
                        background: "rgba(212,175,55,0.06)",
                        boxShadow: `0 20px 60px -20px ${HBS.gold}66`,
                      }
                    : glassStyle
                }
              >
                {pl.hot && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 h-px"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${HBS.gold}, transparent)`,
                      }}
                    />
                    <div
                      className="absolute end-5 top-5 rounded-full px-3 py-1 text-xs font-semibold text-slate-900 shadow-lg"
                      style={{ background: `linear-gradient(90deg, ${HBS.gold}, ${HBS.goldSoft})` }}
                    >
                      {t("hbspro.pricing.popular")}
                    </div>
                  </>
                )}
                <div className="text-sm" style={{ color: HBS.gold }}>
                  {n}
                </div>
                <div className="mt-2 text-4xl font-bold text-white">
                  {p}
                  <span className="text-sm font-normal" style={{ color: HBS.gray }}>
                    {t("hbspro.pricing.perMonth")}
                  </span>
                </div>
                <div className="mt-1 text-xs" style={{ color: HBS.gray }}>
                  {d}
                </div>
                <div className="my-5 h-px" style={{ background: HBS.border }} />
                <ul className="space-y-2 text-sm text-white/90">
                  {(Array.isArray(f) ? f : []).map((item, idx) => (
                    <motion.li
                      key={item}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 + idx * 0.05 + 0.2 }}
                      className="flex items-center gap-2"
                    >
                      <Check className="h-4 w-4 shrink-0" style={{ color: HBS.gold }} />
                      {item}
                    </motion.li>
                  ))}
                </ul>
                <motion.a
                  href="#cta"
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className="group/btn mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-center text-sm font-semibold transition-shadow"
                  style={
                    pl.hot
                      ? {
                          background: `linear-gradient(90deg, ${HBS.gold}, ${HBS.goldSoft})`,
                          color: "#071320",
                          boxShadow: `0 12px 40px -10px ${HBS.gold}`,
                        }
                      : {
                          border: `1px solid ${HBS.gold}55`,
                          color: "white",
                          background: "rgba(255,255,255,0.03)",
                        }
                  }
                >
                  {t("hbspro.pricing.choose", { plan: n })}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1 rtl:rotate-180 rtl:group-hover/btn:-translate-x-1" />
                </motion.a>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- FAQ ---------- //

const FAQ_KEYS = ["1", "2", "3", "4", "5"] as const;

export function FAQ() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number>(0);
  return (
    <section id="faq" className="relative py-16 md:py-24">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(500px 300px at 50% 0%, ${HBS.gold}0d, transparent 70%)`,
        }}
      />
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader eyebrow={t("hbspro.faq.eyebrow")} title={t("hbspro.faq.title")} />
        <div className="space-y-3">
          {FAQ_KEYS.map((k, i) => {
            const q = t(`hbspro.faq.q${k}`);
            const a = t(`hbspro.faq.a${k}`);
            const isOpen = open === i;
            return (
              <motion.div
                key={k}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <button
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className={`${glass} w-full p-5 text-start transition-colors`}
                  style={{
                    ...glassStyle,
                    borderColor: isOpen ? HBS.gold : HBS.border,
                    boxShadow: isOpen ? `0 0 30px -10px ${HBS.gold}66` : "none",
                  }}
                >
                  <div className="flex items-center justify-between gap-4 text-white">
                    <span className="font-medium">{q}</span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 transition-transform"
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "none",
                        color: isOpen ? HBS.gold : "white",
                      }}
                    />
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.p
                        key="a"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="mt-3 overflow-hidden text-sm leading-relaxed"
                        style={{ color: HBS.gray }}
                      >
                        {a}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- CTA ---------- //

export function CTA() {
  const { t } = useTranslation();
  return (
    <section id="cta" className="relative py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className={`${glass} relative overflow-hidden p-10 text-center sm:p-16`}
          style={glassStyle}
        >
          <div
            className="absolute inset-0 -z-10"
            style={{
              background: `radial-gradient(600px 300px at 50% 0%, rgba(212,175,55,0.18), transparent 60%), radial-gradient(600px 300px at 50% 100%, rgba(30,136,229,0.18), transparent 60%)`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${HBS.gold}, transparent)` }}
          />
          <div
            className="mb-3 flex items-center justify-center gap-2 text-xs"
            style={{ color: HBS.gold }}
          >
            <ShieldCheck className="h-4 w-4" /> {t("hbspro.cta.badge")}
          </div>
          <h2 className="text-3xl font-bold text-white sm:text-5xl">{t("hbspro.cta.title")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-base" style={{ color: HBS.gray }}>
            {t("hbspro.cta.sub")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <motion.a
              href="/auth"
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-slate-900 transition-shadow"
              style={{
                background: `linear-gradient(90deg, ${HBS.gold}, ${HBS.goldSoft})`,
                boxShadow: `0 12px 40px -10px ${HBS.gold}, 0 0 0 1px ${HBS.gold}55`,
              }}
            >
              {t("hbspro.cta.start")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
            </motion.a>
            <motion.a
              href="mailto:sales@hrhbs.com"
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-full border px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/5"
              style={{ borderColor: `${HBS.gold}55` }}
            >
              {t("hbspro.cta.sales")}
            </motion.a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ---------- Footer ---------- //

export function Footer() {
  const { t } = useTranslation();
  const cols: { title: string; keys: string[] }[] = [
    {
      title: t("hbspro.footer.product"),
      keys: ["features", "ai", "pricing", "changelog", "roadmap"],
    },
    {
      title: t("hbspro.footer.company"),
      keys: ["aboutUs", "compare", "careers", "press", "partners", "contact"],
    },
    { title: t("hbspro.footer.legal"), keys: ["privacy", "terms", "pdpl", "security", "cookies"] },
  ];
  const routeMap: Record<string, string> = {
    compare: "/compare",
    pricing: "/pricing",
    features: "/services",
    aboutUs: "/about",
    contact: "/contact",
  };

  return (
    <footer
      className="border-t py-14"
      style={{ borderColor: HBS.border, background: "rgba(0,0,0,0.25)" }}
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <div
                className="grid h-9 w-9 place-items-center rounded-xl"
                style={{ background: `linear-gradient(135deg, ${HBS.gold}, ${HBS.blue})` }}
              >
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">
                HBS<span style={{ color: HBS.gold }}>pro</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm" style={{ color: HBS.gray }}>
              {t("hbspro.footer.about")}
            </p>
            <div className="mt-4 flex gap-3" style={{ color: HBS.gray }}>
              <a href="#">
                <Twitter className="h-4 w-4" />
              </a>
              <a href="#">
                <Linkedin className="h-4 w-4" />
              </a>
              <a href="#">
                <Youtube className="h-4 w-4" />
              </a>
              <a href="mailto:hello@hrhbs.com">
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div className="mb-3 text-xs uppercase tracking-widest" style={{ color: HBS.gold }}>
                {c.title}
              </div>
              <ul className="space-y-2 text-sm" style={{ color: HBS.gray }}>
                {c.keys.map((k) => (
                  <li key={k}>
                    {routeMap[k] ? (
                      <Link to={routeMap[k]} className="hover:text-white">
                        {t(`hbspro.footer.links.${k}`)}
                      </Link>
                    ) : (
                      <a href="#" className="hover:text-white">
                        {t(`hbspro.footer.links.${k}`)}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          className="mt-10 border-t pt-6 text-xs"
          style={{ borderColor: HBS.border, color: HBS.gray }}
        >
          © {new Date().getFullYear()} Aqari · HRHBS. {t("hbspro.footer.rights")}
        </div>
      </div>
    </footer>
  );
}
