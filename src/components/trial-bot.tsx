import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  X,
  ChevronRight,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Check,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNextActions } from "@/hooks/use-next-actions";
import { AlertTriangle, Zap } from "lucide-react";

// Ready-made quick questions per tour step path
const QUICK_FAQS: Record<string, { q: string; a: string }[]> = {
  "/dashboard": [
    {
      q: "كيف أخصّص لوحة KPIs؟",
      a: "افتح /dashboard/auto — يمكنك سحب وإفلات البطاقات وحفظ التخطيط تلقائيًا.",
    },
    {
      q: "من أين أفعّل التنبيهات؟",
      a: "من إعدادات المستخدم فعّل إشعارات المتصفح؛ التذكيرات تُرسل عبر run_reminders_scan كل ساعة.",
    },
  ],
  "/properties": [
    {
      q: "كيف أربط العقار بالمالك؟",
      a: "افتح صفحة العقار → قسم «الملاك» → اختر مالكًا موجودًا أو أضف جديدًا.",
    },
    {
      q: "هل يمكن رفع صور متعددة؟",
      a: "نعم، ارفع حتى 10 صور عالية الدقة وستظهر تلقائيًا في تقارير PDF.",
    },
  ],
  "/dashboard/crm/leads": [
    {
      q: "كيف أستورد عملاء بالجملة؟",
      a: "استخدم زر «Import CSV» أعلى الصفحة — يدعم الأعمدة: name, email, phone, source.",
    },
    {
      q: "كيف أنقل Lead بين المراحل؟",
      a: "اسحب البطاقة في لوحة Kanban أو غيّر الحالة من قائمة الحالة داخل البطاقة.",
    },
  ],
  "/dashboard/crm/deals": [
    {
      q: "متى تُحسب العمولة تلقائيًا؟",
      a: "عند تعليم الصفقة كـ won ووجود agent_id + agreed_amount + عمولة% في الإعدادات.",
    },
  ],
  "/tasks": [
    {
      q: "كيف تصلني التذكيرات؟",
      a: "اسمح بإشعارات المتصفح؛ سيرسل النظام إشعارات push قبل موعد كل مهمة.",
    },
  ],
  "/dashboard/reports": [
    {
      q: "ما القوالب المتاحة؟",
      a: "Classic، Modern، Minimal — كلها تدعم RTL وتُصدَّر PDF/CSV مع توقيع الجهة.",
    },
    {
      q: "كيف أخصّص الترويسة؟",
      a: "من /admin/report-branding يمكنك ربط بيانات الشركة وضبط موضع التوقيع لكل قالب.",
    },
  ],
  "/assistant": [
    {
      q: "هل يحترم صلاحياتي؟",
      a: "نعم — كل أداة تنفيذية تمرّ عبر RBAC ويُسجّل الوصول في audit_log.",
    },
    {
      q: "ما أنواع الملفات المدعومة؟",
      a: "PDF، صور PNG/JPG، وملفات نصية — يتم تحليلها ضمن سياق المحادثة.",
    },
  ],
  "/accounting": [
    {
      q: "كيف أضبط نسبة VAT؟",
      a: "من /admin/settings → قسم Tax، غيّر النسبة الافتراضية (15% للسعودية).",
    },
    {
      q: "كيف أعتمد مطالبة مصروف؟",
      a: "افتح /accounting/claims، افتح المطالبة، ثم Approve أو Reject مع سبب واضح.",
    },
  ],
  "/admin": [
    {
      q: "كيف أعتمد مستخدم جديد؟",
      a: "من /admin/users اضغط «اعتمد تجربة 7 أيام» — تُضبط trial_ends_at ويصله إشعار.",
    },
    {
      q: "كيف أنشئ دور مخصص؟",
      a: "من /admin/roles اختر Template أو أنشئ Role جديد وحدّد الصلاحيات ثم عيّنه للأعضاء.",
    },
  ],
  "/team": [
    {
      q: "كيف أدعو عضو جديد؟",
      a: "اضغط «Invite»، أدخل البريد والدور، سيصل رابط قبول صالح 7 أيام.",
    },
  ],
  "/owner/portal": [
    {
      q: "متى يصدر كشف الحساب؟",
      a: "شهريًا تلقائيًا؛ يمكن توليده يدويًا عبر generate_owner_statement لأي شهر.",
    },
  ],
  "/tenant/portal": [
    {
      q: "كيف أدفع الإيجار؟",
      a: "من صفحة «الدفعات» اختر الوسيلة المحفوظة واضغط «سدّد الآن» — يتم تحديث الحالة فورًا.",
    },
  ],
};

export type BotRole = "admin" | "finance" | "employee" | "owner_portal" | "tenant_portal";

type Step = {
  path: string;
  title: string;
  tip: string;
  cta?: string;
  roles?: BotRole[];
};

const TOUR: Step[] = [
  {
    path: "/dashboard",
    title: "لوحة التحكم",
    tip: "تابع مؤشرات الأداء اليومية والتنبيهات.",
    cta: "افتح اللوحة",
  },
  {
    path: "/properties",
    title: "العقارات",
    tip: "أضف عقارًا جديدًا واربطه بالمُلاك والمستأجرين.",
    cta: "استعرض العقارات",
    roles: ["admin", "employee"],
  },
  {
    path: "/dashboard/crm/leads",
    title: "العملاء المحتملون",
    tip: "استخدم Kanban لسحب الفرص بين المراحل.",
    cta: "افتح Leads",
    roles: ["admin", "employee"],
  },
  {
    path: "/dashboard/crm/deals",
    title: "الصفقات",
    tip: "أنشئ عرضًا وتتبّع العمولات تلقائيًا.",
    cta: "افتح الصفقات",
    roles: ["admin", "employee"],
  },
  {
    path: "/tasks",
    title: "المهام والتذكيرات",
    tip: "فعّل إشعارات المتصفح للتذكيرات.",
    cta: "افتح المهام",
  },
  {
    path: "/dashboard/reports",
    title: "التقارير",
    tip: "صدّر تقارير CSV/PDF بثلاثة قوالب.",
    cta: "افتح التقارير",
  },
  {
    path: "/assistant",
    title: "المساعد الذكي",
    tip: "اسأل عن بياناتك — يحترم صلاحياتك.",
    cta: "افتح المساعد",
  },
  {
    path: "/accounting",
    title: "المحاسبة",
    tip: "راجع الفواتير والمصروفات وضبط VAT.",
    cta: "افتح المحاسبة",
    roles: ["admin", "finance"],
  },
  {
    path: "/admin",
    title: "لوحة الأدمن",
    tip: "اعتمد المستخدمين وأدر السياسات والصلاحيات.",
    cta: "افتح الأدمن",
    roles: ["admin"],
  },
  {
    path: "/team",
    title: "الفريق والدعوات",
    tip: "ادعُ أعضاء جدد وحدّد أدوارهم.",
    cta: "افتح الفريق",
    roles: ["admin"],
  },
  {
    path: "/owner/portal",
    title: "بوابة المالك",
    tip: "استعرض كشوفاتك الشهرية ومدفوعاتك.",
    cta: "افتح البوابة",
    roles: ["owner_portal"],
  },
  {
    path: "/tenant/portal",
    title: "بوابة المستأجر",
    tip: "ادفع الإيجار وأنشئ طلبات صيانة.",
    cta: "افتح البوابة",
    roles: ["tenant_portal"],
  },
];

type RouteTip = { match: RegExp; text: string; roles?: BotRole[] };

const ROUTE_TIPS: RouteTip[] = [
  // Admin-focused
  {
    match: /^\/dashboard/,
    roles: ["admin"],
    text: "💡 كمسؤول: راجع /dashboard/auto لتوليد لوحة KPIs مقترحة، وأنشئ تقرير تنفيذي أسبوعي.",
  },
  {
    match: /^\/admin/,
    roles: ["admin"],
    text: "💡 /admin/users لاعتماد تجربة 7 أيام، /admin/roles لمنح الصلاحيات، /admin/audit-log لمراجعة النشاط.",
  },
  {
    match: /^\/team/,
    roles: ["admin"],
    text: "💡 ادعُ الأعضاء ببريدهم وحدّد الدور (owner/admin/agent/viewer) قبل الإرسال.",
  },
  {
    match: /^\/reports/,
    roles: ["admin"],
    text: "💡 اذهب لـ /admin/report-branding لتخصيص التوقيع والترويسة قبل التصدير.",
  },

  // Finance / Accountant
  {
    match: /^\/accounting/,
    roles: ["finance", "admin"],
    text: "💡 كمحاسب: اضبط نسبة VAT، راجع /accounting/pnl شهريًا، وصدّر /accounting/vat للإقرار.",
  },
  {
    match: /^\/dashboard/,
    roles: ["finance"],
    text: "💡 كمحاسب: ركّز على مؤشرات التحصيل والمصروفات، وأنشئ كشف مالك من /owners.",
  },
  {
    match: /^\/reports/,
    roles: ["finance"],
    text: "💡 قوالب مالية: Commissions Summary وExpense Claims Status جاهزة للتصدير.",
  },

  // Employee / Agent
  {
    match: /^\/dashboard/,
    roles: ["employee"],
    text: "💡 كموظف: ابدأ يومك من المهام المستحقة، ثم تحديث حالة صفقاتك المفتوحة.",
  },
  {
    match: /^\/leads/,
    roles: ["employee", "admin"],
    text: "💡 استورد Leads من CSV، وصنّفها حسب المصدر قبل التوزيع.",
  },
  {
    match: /^\/deals/,
    roles: ["employee", "admin"],
    text: "💡 اربط كل صفقة بـ Lead + Property لحساب عمولتك تلقائيًا.",
  },
  {
    match: /^\/properties/,
    roles: ["employee", "admin"],
    text: "💡 ارفع صورًا عالية الدقة لعرض العقار في تقارير PDF بشكل احترافي.",
  },
  { match: /^\/tasks/, text: "💡 اسمح بإشعارات المتصفح لتصلك التذكيرات فورًا." },
  {
    match: /^\/maintenance/,
    roles: ["employee", "admin"],
    text: "💡 أسند التذاكر لفني مناسب، وحدّد الأولوية والموعد المتوقع.",
  },
  { match: /^\/assistant/, text: "💡 ارفع ملف PDF/صورة في المحادثة وسيتم تحليله ضمن صلاحياتك." },

  // Portals
  {
    match: /^\/owner\/portal/,
    roles: ["owner_portal"],
    text: "💡 كمالك: راجع كشف شهر سابق واطلب توضيحًا عبر المساعد الذكي.",
  },
  {
    match: /^\/tenant\/portal/,
    roles: ["tenant_portal"],
    text: "💡 كمستأجر: احفظ وسيلة دفع لتسديد الإيجار بضغطة واحدة.",
  },
];

const LS_KEY = "hbspro.trialbot.v2";

type Persisted = {
  dismissed?: boolean;
  visited?: string[];
  completed?: string[]; // step paths marked done
  skipped?: string[]; // step paths skipped
  lastStepPath?: string; // last active step (resume point)
};

export function TrialBot({ role = "employee" }: { role?: BotRole }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [autoTour, setAutoTour] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [visited, setVisited] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [lastStepPath, setLastStepPath] = useState<string | null>(null);
  const [showFaqs, setShowFaqs] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const hydrated = useRef(false);

  // Hydrate once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Persisted;
        setDismissed(!!s.dismissed);
        setVisited(Array.isArray(s.visited) ? s.visited : []);
        setCompleted(Array.isArray(s.completed) ? s.completed : []);
        setSkipped(Array.isArray(s.skipped) ? s.skipped : []);
        setLastStepPath(typeof s.lastStepPath === "string" ? s.lastStepPath : null);
      }
    } catch {
      /* noop */
    }
    hydrated.current = true;
  }, []);

  // Persist state
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      const payload: Persisted = {
        dismissed,
        visited,
        completed,
        skipped,
        lastStepPath: lastStepPath ?? undefined,
      };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }, [dismissed, visited, completed, skipped, lastStepPath]);

  // Track visited routes + auto-mark matching step complete when user actually lands there
  useEffect(() => {
    setVisited((prev) => (prev.includes(pathname) ? prev : [...prev, pathname].slice(-40)));
    const match = TOUR.find((s) => pathname === s.path || pathname.startsWith(s.path + "/"));
    if (match) {
      setCompleted((prev) => (prev.includes(match.path) ? prev : [...prev, match.path]));
    }
  }, [pathname]);

  // Auto-tour advance
  useEffect(() => {
    if (!autoTour) return;
    const id = setInterval(() => {
      setStepIdx((i) => (i + 1) % TOUR.length);
    }, 6000);
    return () => clearInterval(id);
  }, [autoTour]);

  const scopedTour = useMemo(() => TOUR.filter((s) => !s.roles || s.roles.includes(role)), [role]);

  // Resume from lastStepPath (or first uncompleted/unskipped) whenever role/scoped tour changes
  useEffect(() => {
    if (!hydrated.current || scopedTour.length === 0) return;
    const resumeIdx = lastStepPath ? scopedTour.findIndex((s) => s.path === lastStepPath) : -1;
    if (resumeIdx >= 0) {
      setStepIdx(resumeIdx);
      return;
    }
    const nextIdx = scopedTour.findIndex(
      (s) => !completed.includes(s.path) && !skipped.includes(s.path),
    );
    setStepIdx(nextIdx >= 0 ? nextIdx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, scopedTour.length]);

  // Persist last step path whenever it changes
  useEffect(() => {
    const cur = scopedTour[stepIdx];
    if (cur) setLastStepPath(cur.path);
  }, [stepIdx, scopedTour]);

  const routeTip = useMemo(() => {
    const matches = ROUTE_TIPS.filter((r) => r.match.test(pathname));
    return (
      matches.find((r) => r.roles?.includes(role))?.text ?? matches.find((r) => !r.roles)?.text
    );
  }, [pathname, role]);

  const doneSet = useMemo(() => new Set([...completed, ...skipped]), [completed, skipped]);
  const recommendations = useMemo(
    () => scopedTour.filter((s) => !doneSet.has(s.path)).slice(0, 3),
    [doneSet, scopedTour],
  );
  const { data: nextActions = [] } = useNextActions(role);
  const topActions = nextActions.slice(0, 4);
  const doneCount = scopedTour.filter((s) => doneSet.has(s.path)).length;
  const progress = scopedTour.length ? Math.round((doneCount / scopedTour.length) * 100) : 0;

  const goNextIncomplete = () => {
    const next = scopedTour.findIndex(
      (s, i) => i !== stepIdx && !completed.includes(s.path) && !skipped.includes(s.path),
    );
    setStepIdx(next >= 0 ? next : (stepIdx + 1) % Math.max(scopedTour.length, 1));
  };

  const skipCurrent = () => {
    const cur = scopedTour[stepIdx];
    if (!cur) return;
    setSkipped((prev) => (prev.includes(cur.path) ? prev : [...prev, cur.path]));
    goNextIncomplete();
  };

  const resetProgress = () => {
    setCompleted([]);
    setSkipped([]);
    setLastStepPath(null);
    setStepIdx(0);
  };

  if (dismissed && !open) {
    return (
      <button
        onClick={() => {
          setDismissed(false);
          setOpen(true);
        }}
        className="fixed bottom-4 end-4 z-50 rounded-full bg-primary/90 p-3 text-primary-foreground shadow-lg backdrop-blur hover:bg-primary"
        aria-label="فتح بوت التجربة"
      >
        <Bot className="size-5" />
      </button>
    );
  }

  const current = scopedTour[stepIdx % Math.max(scopedTour.length, 1)] ?? scopedTour[0];
  if (!current) return null;
  const faqs = QUICK_FAQS[current.path] ?? [];
  const currentDone = completed.includes(current.path);
  const currentSkipped = skipped.includes(current.path);

  const roleLabel: Record<BotRole, string> = {
    admin: "مسؤول",
    finance: "محاسب",
    employee: "موظف",
    owner_portal: "مالك",
    tenant_portal: "مستأجر",
  };

  return (
    <>
      {!open && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-4 end-4 z-50 flex items-center gap-2 rounded-full border border-primary/30 bg-gradient-to-r from-primary to-primary/70 px-4 py-2.5 text-primary-foreground shadow-xl backdrop-blur hover:brightness-110"
        >
          <Bot className="size-4" />
          <span className="text-xs font-medium">مساعد التجربة</span>
          {(topActions.length || recommendations.length) > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-bold">
              {topActions.length || recommendations.length}
            </span>
          )}
        </motion.button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-4 end-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-border/50 bg-gradient-to-r from-primary/15 to-accent/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-primary/20 p-1.5">
                  <Bot className="size-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold">مساعد تجربة النظام</div>
                  <div className="text-[10px] text-muted-foreground">
                    توصيات مخصّصة لدورك: {roleLabel[role]}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0"
                  onClick={() => {
                    setDismissed(true);
                    setOpen(false);
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    تقدم الاستكشاف — {doneCount}/{scopedTour.length}
                  </span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {lastStepPath && (
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>
                      آخر خطوة:{" "}
                      {scopedTour.find((s) => s.path === lastStepPath)?.title ?? lastStepPath}
                    </span>
                    <button className="text-primary hover:underline" onClick={resetProgress}>
                      إعادة التشغيل
                    </button>
                  </div>
                )}
              </div>

              {routeTip && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed">
                  {routeTip}
                </div>
              )}

              {topActions.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Zap className="size-3 text-amber-500" /> الخطوة التالية الأنسب
                  </div>
                  <div className="space-y-1.5">
                    {topActions.map((a) => (
                      <Link
                        key={a.key}
                        to={a.path}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs transition",
                          a.tone === "warning"
                            ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
                            : "border-primary/30 bg-primary/5 hover:bg-primary/10",
                        )}
                      >
                        <div className="flex min-w-0 items-start gap-1.5">
                          {a.tone === "warning" && (
                            <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium">{a.title}</div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {a.reason}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="mt-0.5 size-3 shrink-0 opacity-60 rtl:rotate-180" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Sparkles className="size-3.5 text-primary" />
                    جولة تفاعلية
                    {currentDone && (
                      <span className="ms-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600">
                        <Check className="size-2.5" />
                        تم
                      </span>
                    )}
                    {currentSkipped && !currentDone && (
                      <span className="ms-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                        تم التخطي
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-6 p-0"
                      title="إعادة التشغيل من البداية"
                      onClick={resetProgress}
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-6 p-0"
                      title={autoTour ? "إيقاف التشغيل التلقائي" : "تشغيل تلقائي"}
                      onClick={() => setAutoTour((v) => !v)}
                    >
                      {autoTour ? <Pause className="size-3" /> : <Play className="size-3" />}
                    </Button>
                    {faqs.length > 0 && (
                      <Button
                        size="sm"
                        variant={showFaqs ? "secondary" : "ghost"}
                        className="size-6 p-0"
                        title="أسئلة سريعة"
                        onClick={() => {
                          setShowFaqs((v) => !v);
                          setOpenFaq(null);
                        }}
                      >
                        <HelpCircle className="size-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold">{current.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {current.tip}
                </div>
                <AnimatePresence initial={false}>
                  {showFaqs && faqs.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-2 overflow-hidden"
                    >
                      <div className="rounded-lg border border-primary/20 bg-background/60 p-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          أسئلة شائعة عن «{current.title}»
                        </div>
                        <div className="space-y-1">
                          {faqs.map((f, i) => (
                            <div key={i} className="rounded-md border border-border/50 bg-muted/20">
                              <button
                                type="button"
                                onClick={() => setOpenFaq((o) => (o === i ? null : i))}
                                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-right text-[11px] font-medium hover:bg-muted/40"
                              >
                                <span className="truncate">{f.q}</span>
                                <ChevronRight
                                  className={cn(
                                    "size-3 shrink-0 opacity-60 transition-transform rtl:rotate-180",
                                    openFaq === i && "rotate-90 rtl:-rotate-90",
                                  )}
                                />
                              </button>
                              {openFaq === i && (
                                <div className="border-t border-border/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                                  {f.a}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {(stepIdx % scopedTour.length) + 1} / {scopedTour.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={skipCurrent}
                    >
                      <SkipForward className="size-3" /> تخطي
                    </Button>
                    <Link
                      to={current.path}
                      onClick={() => {
                        setCompleted((prev) =>
                          prev.includes(current.path) ? prev : [...prev, current.path],
                        );
                        setOpen(false);
                      }}
                    >
                      <Button size="sm" className="h-7 gap-1 text-xs">
                        {current.cta ?? "اذهب"} <ChevronRight className="size-3 rtl:rotate-180" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>

              {recommendations.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    توصيات لك
                  </div>
                  <div className="space-y-1.5">
                    {recommendations.map((r) => (
                      <Link
                        key={r.path}
                        to={r.path}
                        onClick={() => {
                          setCompleted((prev) =>
                            prev.includes(r.path) ? prev : [...prev, r.path],
                          );
                          setOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/70 px-2.5 py-2 text-xs transition hover:border-primary/40 hover:bg-primary/5",
                        )}
                      >
                        <span className="truncate">{r.title}</span>
                        <ChevronRight className="size-3 shrink-0 opacity-60 rtl:rotate-180" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
