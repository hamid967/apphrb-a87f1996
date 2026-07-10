import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  X,
  ArrowLeft,
  ArrowRight,
  UserCog,
  Users2,
  UserPlus,
  Building2,
  FileText,
  BarChart3,
  Wallet,
  Wrench,
  BellRing,
  Sparkles,
  Check,
} from "lucide-react";

/**
 * WelcomeTour — a short, interactive onboarding tour shown from the
 * landing page. Users switch between "Manager" and "Employee" tracks
 * and step through 4 first-use actions each. Uses the Emerald Prestige
 * palette to blend with OpeningExperience.
 */

const INK = "#064e3b";
const SURFACE = "#0d7a5f";
const GOLD = "#c9a84c";
const CREAM = "#f5f0e0";

type Role = "manager" | "employee";
type Step = {
  icon: typeof UserCog;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
};

const STEPS: Record<Role, Step[]> = {
  manager: [
    {
      icon: UserPlus,
      titleAr: "أنشئ حساب المنشأة",
      titleEn: "Create your company account",
      bodyAr:
        "سجّل الدخول ثم أدخل بيانات المنشأة (السجل التجاري، الرقم الضريبي، الشعار). كل شيء يُحفظ تلقائياً.",
      bodyEn:
        "Sign in and enter your establishment details (CR, VAT, logo). Everything auto-saves as you type.",
    },
    {
      icon: Users2,
      titleAr: "ادعُ فريقك",
      titleEn: "Invite your team",
      bodyAr:
        "من الإعدادات › المستخدمين، أضف الموظفين وحدد صلاحياتهم (محاسب، مسؤول عقود، فني صيانة…).",
      bodyEn:
        "From Settings › Users, add employees and pick a role (accountant, contracts officer, technician…).",
    },
    {
      icon: Building2,
      titleAr: "أضف أول عقار",
      titleEn: "Add your first property",
      bodyAr:
        "اضغط “عقار جديد”، أدخل الموقع والوحدات والصور. تظهر مباشرة على الخريطة التفاعلية.",
      bodyEn:
        "Click “New property”, fill in location, units and photos. It appears on the interactive map instantly.",
    },
    {
      icon: BarChart3,
      titleAr: "افتح لوحة القرار",
      titleEn: "Open your decision board",
      bodyAr:
        "لوحة المؤشرات تعرض الإشغال، التحصيل، والتنبيهات. ثبّت البطاقات المهمة لك.",
      bodyEn:
        "The KPI board shows occupancy, collection and alerts. Pin the cards that matter to you.",
    },
  ],
  employee: [
    {
      icon: UserCog,
      titleAr: "أكمل ملفك الشخصي",
      titleEn: "Complete your profile",
      bodyAr:
        "أضف صورتك ورقم جوالك للتحقق. هذا يفعّل التنبيهات وقناة الواتساب.",
      bodyEn:
        "Add your photo and verified mobile. This unlocks notifications and the WhatsApp channel.",
    },
    {
      icon: FileText,
      titleAr: "استلم مهامك اليومية",
      titleEn: "Pick up your daily tasks",
      bodyAr:
        "قائمة “مهامي” تجمع العقود والدفعات والصيانة المسندة إليك مرتبة حسب الأولوية.",
      bodyEn:
        "The “My tasks” list gathers contracts, payments and work orders assigned to you, sorted by priority.",
    },
    {
      icon: Wallet,
      titleAr: "أصدر أول فاتورة/سند",
      titleEn: "Issue your first invoice / voucher",
      bodyAr:
        "من قسم المدفوعات، أنشئ فاتورة ZATCA أو سند قبض في أقل من دقيقة مع QR تلقائي.",
      bodyEn:
        "In Payments, create a ZATCA invoice or receipt voucher in under a minute — QR is added automatically.",
    },
    {
      icon: Wrench,
      titleAr: "تابع طلبات الصيانة",
      titleEn: "Follow up on maintenance",
      bodyAr:
        "استلم الطلبات، حدّث حالتها وأرفق الصور. المستأجر يرى التقدم لحظياً.",
      bodyEn:
        "Receive requests, update status and attach photos. The tenant sees progress in real time.",
    },
  ],
};

export function WelcomeTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { i18n } = useTranslation();
  const ar = (i18n.language || "ar").startsWith("ar");
  const dir = ar ? "rtl" : "ltr";
  const Prev = ar ? ArrowRight : ArrowLeft;
  const Next = ar ? ArrowLeft : ArrowRight;

  const [role, setRole] = useState<Role>("manager");
  const [idx, setIdx] = useState(0);
  const steps = useMemo(() => STEPS[role], [role]);
  const step = steps[idx];
  const Icon = step.icon;
  const isLast = idx === steps.length - 1;

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, steps.length]);

  // Lock scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Reset index when role changes
  useEffect(() => setIdx(0), [role]);

  const T = {
    eyebrow: ar ? "جولة ترحيبية" : "Welcome tour",
    heading: ar ? "خطواتك الأولى مع HBSpro" : "Your first steps with HBSpro",
    sub: ar
      ? "اختر دورك واستعرض الخطوات الأربع الأولى في أقل من دقيقة."
      : "Pick your role and walk through the first four moves in under a minute.",
    manager: ar ? "مدير" : "Manager",
    employee: ar ? "موظف" : "Employee",
    step: ar ? "خطوة" : "Step",
    of: ar ? "من" : "of",
    prev: ar ? "السابق" : "Back",
    next: ar ? "التالي" : "Next",
    skip: ar ? "تخطي" : "Skip",
    finish: ar ? "ابدأ الآن" : "Start now",
    finishHint: ar
      ? "ستفتح صفحة تسجيل الدخول لبدء الاستخدام."
      : "This opens sign-in so you can get started.",
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="tour-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          dir={dir}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-md"
          style={{
            background: "rgba(6,78,59,0.6)",
            fontFamily:
              "'Fira Sans', 'IBM Plex Sans Arabic', system-ui, sans-serif",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={T.heading}
        >
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl overflow-hidden rounded-[32px] bg-white shadow-2xl"
          >
            {/* Header */}
            <div
              className="relative flex flex-wrap items-center gap-4 p-8"
              style={{ background: INK, color: CREAM }}
            >
              <div
                className="pointer-events-none absolute -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
                style={{ background: SURFACE, insetInlineStart: "-3rem" }}
              />
              <div
                className="pointer-events-none absolute -bottom-20 h-40 w-40 rounded-full opacity-20 blur-3xl"
                style={{ background: GOLD, insetInlineEnd: "-2rem" }}
              />

              <div className="relative z-10 flex-1 min-w-[200px]">
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    borderColor: "rgba(201,168,76,0.35)",
                    color: GOLD,
                  }}
                >
                  <Sparkles className="h-3 w-3" />
                  {T.eyebrow}
                </span>
                <h2
                  className="mt-3 text-2xl font-bold leading-tight lg:text-3xl"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  {T.heading}
                </h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "rgba(245,240,224,0.75)" }}
                >
                  {T.sub}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label={T.skip}
                className="relative z-10 grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/10"
                style={{ color: CREAM }}
              >
                <X className="h-5 w-5" />
              </button>

              {/* Role switcher */}
              <div
                className="relative z-10 flex w-full items-center gap-1 rounded-2xl p-1"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                {(
                  [
                    { key: "manager" as Role, label: T.manager, Icon: UserCog },
                    { key: "employee" as Role, label: T.employee, Icon: Users2 },
                  ] as const
                ).map((r) => {
                  const active = role === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRole(r.key)}
                      className="relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition"
                      style={{
                        background: active ? GOLD : "transparent",
                        color: active ? INK : "rgba(245,240,224,0.8)",
                      }}
                      aria-pressed={active}
                    >
                      <r.Icon className="h-4 w-4" />
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step body */}
            <div className="grid gap-6 p-8 md:grid-cols-[auto,1fr] md:items-center">
              <div
                className="grid h-24 w-24 place-items-center rounded-3xl"
                style={{
                  background: "rgba(13,122,95,0.1)",
                  border: `1px solid ${GOLD}55`,
                }}
              >
                <Icon className="h-11 w-11" style={{ color: INK }} />
              </div>
              <div className="min-w-0">
                <div
                  className="mb-2 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: SURFACE }}
                >
                  {T.step} {idx + 1} {T.of} {steps.length}
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${role}-${idx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                  >
                    <h3
                      className="mb-2 text-xl font-bold leading-tight lg:text-2xl"
                      style={{ color: INK, fontFamily: "'DM Serif Display', serif" }}
                    >
                      {ar ? step.titleAr : step.titleEn}
                    </h3>
                    <p className="text-sm leading-relaxed text-stone-600">
                      {ar ? step.bodyAr : step.bodyEn}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 pb-4">
              {steps.map((_, i) => {
                const done = i < idx;
                const active = i === idx;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-label={`${T.step} ${i + 1}`}
                    className="grid place-items-center transition"
                    style={{
                      height: 10,
                      width: active ? 28 : 10,
                      borderRadius: 999,
                      background: active ? INK : done ? SURFACE : "rgba(6,78,59,0.15)",
                    }}
                  >
                    {done && <Check className="h-2.5 w-2.5" style={{ color: CREAM }} />}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-t px-8 py-5"
              style={{
                borderColor: "rgba(6,78,59,0.08)",
                background: "rgba(245,240,224,0.4)",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 transition hover:text-stone-800"
              >
                <BellRing className="h-4 w-4" />
                {T.skip}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIdx((i) => Math.max(i - 1, 0))}
                  disabled={idx === 0}
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40"
                  style={{ borderColor: "rgba(6,78,59,0.15)", color: INK }}
                >
                  <Prev className="h-4 w-4" />
                  {T.prev}
                </button>
                {isLast ? (
                  <Link
                    to="/auth"
                    onClick={onClose}
                    title={T.finishHint}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-md transition hover:scale-105"
                    style={{ background: INK, color: CREAM }}
                  >
                    {T.finish}
                    <Next className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setIdx((i) => Math.min(i + 1, steps.length - 1))
                    }
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-md transition hover:scale-105"
                    style={{ background: INK, color: CREAM }}
                  >
                    {T.next}
                    <Next className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default WelcomeTour;
