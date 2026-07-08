import { motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  Building2,
  Home,
  FileText,
  Wallet,
  Wrench,
  PieChart,
  Sparkles,
  LineChart,
} from "lucide-react";
import { HBS } from "../tokens";
import { SaudiMap } from "../SaudiMap";
import { useTranslation } from "react-i18next";

type Widget = {
  icon: typeof Building2;
  labelKey: string;
  value: number;
  tone: string;
  x: string;
  y: string;
  delay: number;
  currency?: string;
  suffix?: string;
};
const WIDGETS: Widget[] = [
  {
    icon: Building2,
    labelKey: "properties",
    value: 1284,
    tone: HBS.blue,
    x: "6%",
    y: "10%",
    delay: 0,
  },
  { icon: Home, labelKey: "units", value: 8642, tone: HBS.gold, x: "72%", y: "8%", delay: 0.4 },
  {
    icon: FileText,
    labelKey: "contracts",
    value: 5321,
    tone: HBS.blueSoft,
    x: "4%",
    y: "56%",
    delay: 0.8,
  },
  {
    icon: Wallet,
    labelKey: "revenue",
    value: 24_800_000,
    currency: "SAR",
    tone: HBS.gold,
    x: "74%",
    y: "52%",
    delay: 1.2,
  },
  {
    icon: Wrench,
    labelKey: "maintenance",
    value: 214,
    tone: HBS.blue,
    x: "10%",
    y: "80%",
    delay: 1.6,
  },
  {
    icon: PieChart,
    labelKey: "occupancy",
    value: 96,
    suffix: "%",
    tone: HBS.goldSoft,
    x: "70%",
    y: "80%",
    delay: 2.0,
  },
];

function useCounter(target: number, duration = 1600) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.floor(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function Widget({ w, i }: { w: (typeof WIDGETS)[number]; i: number }) {
  const n = useCounter(w.value);
  const Icon = w.icon;
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{ opacity: 1, y: [0, -6, 0], scale: 1 }}
      transition={{
        opacity: { delay: 0.3 + i * 0.12, duration: 0.7 },
        y: { duration: 6 + i, repeat: Infinity, ease: "easeInOut", delay: w.delay },
        scale: { delay: 0.3 + i * 0.12, duration: 0.6 },
      }}
      className="pointer-events-none absolute w-[168px] rounded-2xl border p-3 backdrop-blur-xl"
      style={{
        left: w.x,
        top: w.y,
        borderColor: HBS.border,
        background: "linear-gradient(140deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
        boxShadow: `0 10px 40px -20px ${w.tone}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid size-8 place-items-center rounded-lg"
          style={{ background: `${w.tone}22`, color: w.tone }}
        >
          <Icon className="size-4" />
        </span>
        <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: HBS.gray }}>
          {t(`hbspro.loginStage.${w.labelKey}`)}
        </div>
      </div>
      <div className="mt-2 font-semibold tabular-nums" style={{ color: HBS.white, fontSize: 20 }}>
        {w.currency ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString()}
        {w.suffix ?? ""}
        {w.currency && (
          <span className="ms-1 text-[10px] font-medium" style={{ color: HBS.goldSoft }}>
            {w.currency}
          </span>
        )}
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${60 + ((i * 7) % 40)}%` }}
          transition={{ delay: 0.6 + i * 0.15, duration: 1.2, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${w.tone}, ${HBS.gold})` }}
        />
      </div>
    </motion.div>
  );
}

function Skyline() {
  return (
    <svg
      viewBox="0 0 900 220"
      className="pointer-events-none absolute bottom-0 left-0 h-[38%] w-full opacity-70"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="sky-fog" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={HBS.blue} stopOpacity="0" />
          <stop offset="60%" stopColor={HBS.blue} stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="sky-tower" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0a2038" />
          <stop offset="100%" stopColor="#04101c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="900" height="220" fill="url(#sky-fog)" />
      {[
        [40, 140],
        [80, 90],
        [120, 130],
        [160, 60],
        [200, 110],
        [250, 40],
        [300, 100],
        [350, 70],
        [400, 30],
        [455, 20],
        [510, 80],
        [560, 120],
        [610, 60],
        [660, 100],
        [710, 50],
        [760, 130],
        [810, 90],
        [860, 140],
      ].map(([x, top], i) => (
        <g key={i}>
          <rect x={x} y={top} width="34" height={220 - top} fill="url(#sky-tower)" />
          <rect x={x + 4} y={top + 8} width="4" height="4" fill={HBS.gold} opacity="0.7">
            <animate
              attributeName="opacity"
              values="0.2;0.9;0.2"
              dur={`${3 + (i % 4)}s`}
              repeatCount="indefinite"
            />
          </rect>
          <rect x={x + 14} y={top + 20} width="4" height="4" fill={HBS.blueSoft} opacity="0.6">
            <animate
              attributeName="opacity"
              values="0.2;0.8;0.2"
              dur={`${4 + (i % 3)}s`}
              repeatCount="indefinite"
            />
          </rect>
          <rect x={x + 24} y={top + 40} width="4" height="4" fill={HBS.gold} opacity="0.5">
            <animate
              attributeName="opacity"
              values="0.1;0.7;0.1"
              dur={`${5 + (i % 5)}s`}
              repeatCount="indefinite"
            />
          </rect>
        </g>
      ))}
      {/* Kingdom Tower silhouette */}
      <path
        d="M430 220 L430 20 L440 6 L450 20 L450 220 Z"
        fill="#061426"
        stroke={HBS.gold}
        strokeOpacity="0.4"
      />
    </svg>
  );
}

function Particles() {
  const dots = Array.from({ length: 44 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    r: 0.6 + Math.random() * 1.6,
    d: 8 + Math.random() * 14,
    delay: Math.random() * 6,
    gold: Math.random() > 0.7,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.r * 2,
            height: p.r * 2,
            background: p.gold ? HBS.gold : HBS.blueSoft,
            boxShadow: `0 0 ${p.r * 6}px ${p.gold ? HBS.gold : HBS.blueSoft}`,
          }}
          animate={{ y: [-6, -60], opacity: [0, 0.9, 0] }}
          transition={{ duration: p.d, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function AIAssistant() {
  const { t, i18n } = useTranslation();
  const AI_LINES =
    (i18n.getResource(i18n.language, "translation", "hbspro.loginStage.aiLines") as string[]) ?? [];
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!AI_LINES.length) return;
    const line = AI_LINES[idx];
    let i = 0;
    setTyped("");
    const iv = setInterval(() => {
      i += 1;
      setTyped(line.slice(0, i));
      if (i >= line.length) {
        clearInterval(iv);
        setTimeout(() => setIdx((x) => (x + 1) % AI_LINES.length), 1800);
      }
    }, 45);
    return () => clearInterval(iv);
  }, [idx, AI_LINES]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: [0, -4, 0] }}
      transition={{
        opacity: { delay: 1.2, duration: 0.8 },
        y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
      }}
      dir="rtl"
      className="pointer-events-none absolute bottom-6 right-6 w-[260px] rounded-2xl border p-4 backdrop-blur-xl"
      style={{
        borderColor: HBS.border,
        background: "linear-gradient(140deg, rgba(30,136,229,0.18), rgba(212,175,55,0.08))",
        boxShadow: `0 20px 60px -20px ${HBS.blue}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid size-8 place-items-center rounded-lg"
          style={{ background: `${HBS.gold}22`, color: HBS.gold }}
        >
          <Sparkles className="size-4" />
        </span>
        <div>
          <div className="text-xs font-semibold" style={{ color: HBS.white }}>
            {t("hbspro.loginStage.assistantName")}
          </div>
          <div className="text-[10px]" style={{ color: HBS.gray }}>
            {t("hbspro.loginStage.workingNow")}
          </div>
        </div>
      </div>
      <div className="mt-3 min-h-[42px] text-xs leading-relaxed" style={{ color: HBS.white }}>
        {typed}
        <span
          className="ms-0.5 inline-block h-3 w-[2px] animate-pulse align-middle"
          style={{ background: HBS.gold }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {(["reports", "contracts", "maintenance", "tenants"] as const).map((c) => (
          <span
            key={c}
            className="rounded-full border px-2 py-0.5 text-[10px]"
            style={{ borderColor: HBS.border, color: HBS.goldSoft }}
          >
            {t(`hbspro.loginStage.chips.${c}`)}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function AnalyticsCard() {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0, y: [0, -5, 0] }}
      transition={{
        opacity: { delay: 1.4, duration: 0.7 },
        y: { duration: 7, repeat: Infinity, ease: "easeInOut" },
      }}
      className="pointer-events-none absolute bottom-6 left-6 w-[240px] rounded-2xl border p-4 backdrop-blur-xl"
      style={{
        borderColor: HBS.border,
        background: "rgba(7,19,32,0.7)",
        boxShadow: `0 20px 60px -20px ${HBS.gold}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LineChart className="size-4" style={{ color: HBS.gold }} />
          <div className="text-xs font-semibold" style={{ color: HBS.white }}>
            {t("hbspro.loginStage.analytics")}
          </div>
        </div>
        <span className="text-[10px]" style={{ color: HBS.goldSoft }}>
          +12.4%
        </span>
      </div>
      <svg viewBox="0 0 200 60" className="mt-3 h-14 w-full">
        <defs>
          <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={HBS.gold} stopOpacity="0.6" />
            <stop offset="100%" stopColor={HBS.gold} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,45 L20,40 L40,42 L60,30 L80,32 L100,22 L120,26 L140,18 L160,20 L180,10 L200,14 L200,60 L0,60 Z"
          fill="url(#spark)"
        />
        <path
          d="M0,45 L20,40 L40,42 L60,30 L80,32 L100,22 L120,26 L140,18 L160,20 L180,10 L200,14"
          fill="none"
          stroke={HBS.gold}
          strokeWidth="1.6"
        />
      </svg>
    </motion.div>
  );
}

export function LoginStage() {
  const { t } = useTranslation();
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: `radial-gradient(1200px 700px at 30% 20%, rgba(30,136,229,0.22), transparent 60%), radial-gradient(900px 600px at 80% 80%, rgba(212,175,55,0.18), transparent 60%), linear-gradient(160deg, ${HBS.bg}, #030a13)`,
      }}
    >
      <Particles />
      <Skyline />

      {/* Holographic platform */}
      <div className="pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2">
        {[320, 260, 200, 140].map((size, i) => (
          <motion.div
            key={size}
            className="absolute rounded-full border"
            style={{
              width: size,
              height: size / 3,
              left: -size / 2,
              top: -size / 6,
              borderColor: `${HBS.blueSoft}44`,
              boxShadow: `0 0 40px ${HBS.blueSoft}22 inset`,
            }}
            animate={{ rotate: 360, opacity: [0.4, 0.8, 0.4] }}
            transition={{
              rotate: { duration: 30 + i * 10, repeat: Infinity, ease: "linear" },
              opacity: { duration: 4 + i, repeat: Infinity, ease: "easeInOut" },
            }}
          />
        ))}
      </div>

      <div className="absolute inset-x-0 top-[6%] mx-auto h-[70%] w-[86%]">
        <SaudiMap compact />
      </div>

      {WIDGETS.map((w, i) => (
        <Widget key={w.labelKey} w={w} i={i} />
      ))}

      <AnalyticsCard />
      <AIAssistant />

      {/* Brand mark */}
      <div className="pointer-events-none absolute left-8 top-8 flex items-center gap-3">
        <span
          className="grid size-11 place-items-center rounded-2xl"
          style={{
            background: `linear-gradient(140deg, ${HBS.gold}, ${HBS.blue})`,
            boxShadow: `0 12px 30px -10px ${HBS.gold}`,
          }}
        >
          <Building2 className="size-5 text-white" />
        </span>
        <div>
          <div className="text-lg font-bold tracking-tight text-white">
            HBSpro <span style={{ color: HBS.gold }}>AI</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: HBS.gray }}>
            {t("hbspro.loginStage.intelligence")}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginStage;
