import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Check,
  ChevronRight,
  X,
  UserCircle2,
  Building2,
  Receipt,
  Users2,
  BellRing,
} from "lucide-react";
import {
  getOnboardingProgress,
  setOnboardingStep,
  REQUIRED_ONBOARDING_STEPS,
} from "@/lib/onboarding.functions";
import { useAuth } from "@/hooks/use-auth";

type StepDef = {
  id: string;
  required: boolean;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
  to: string;
  icon: typeof UserCircle2;
};

const STEPS: StepDef[] = [
  {
    id: "profile",
    required: true,
    labelAr: "أكمل ملفك الشخصي",
    labelEn: "Complete your profile",
    descAr: "اسمك الكامل وصورتك ورقم جوالك.",
    descEn: "Your full name, photo and mobile.",
    to: "/onboarding/profile",
    icon: UserCircle2,
  },
  {
    id: "company",
    required: true,
    labelAr: "أضف بيانات المنشأة",
    labelEn: "Add company details",
    descAr: "السجل التجاري والرقم الضريبي والشعار.",
    descEn: "CR, VAT and logo.",
    to: "/onboarding/company",
    icon: Building2,
  },
  {
    id: "first_receipt",
    required: true,
    labelAr: "ارفع أول إيصال",
    labelEn: "Upload your first receipt",
    descAr: "افتح شاشة المطالبة وارفق صورة الإيصال.",
    descEn: "Open the claim screen and attach a receipt.",
    to: "/dashboard/expenses/claim",
    icon: Receipt,
  },
  {
    id: "invite_team",
    required: false,
    labelAr: "ادعُ زملاءك",
    labelEn: "Invite your team",
    descAr: "أضف الموظفين وحدد صلاحياتهم.",
    descEn: "Add employees & assign roles.",
    to: "/team",
    icon: Users2,
  },
  {
    id: "reminders",
    required: false,
    labelAr: "فعّل التذكيرات",
    labelEn: "Turn on reminders",
    descAr: "تنبيهات العقود والدفعات تلقائياً.",
    descEn: "Automatic contracts & payments alerts.",
    to: "/dashboard/settings/reminders",
    icon: BellRing,
  },
];

const DISMISS_KEY = "aqary:welcome-checklist:dismissed";

/**
 * Post-login welcome checklist. Shows a friendly hello + a short list of
 * setup steps with progress and quick links. Dismissible; auto-hides once
 * every required step is done, and stays hidden after user dismissal.
 */
export function WelcomeChecklist({ isAr }: { isAr: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const getProgress = useServerFn(getOnboardingProgress);
  const markStep = useServerFn(setOnboardingStep);

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DISMISS_KEY) === "1";
  });

  const progressQ = useQuery({
    queryKey: ["onboarding-progress", user?.id],
    queryFn: () => getProgress(),
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const markMut = useMutation({
    mutationFn: (step: string) => markStep({ data: { step, done: true } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["onboarding-progress", user?.id] }),
  });

  const progress = progressQ.data?.progress ?? {};
  const requiredDone = useMemo(
    () => REQUIRED_ONBOARDING_STEPS.every((s) => progress[s]?.done === true),
    [progress],
  );
  const doneCount = STEPS.filter((s) => progress[s.id]?.done).length;
  const pct = Math.round((doneCount / STEPS.length) * 100);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  // Hide entirely if dismissed, or once all required steps are complete
  // AND the user has opened optional steps at least once.
  if (dismissed) return null;
  if (progressQ.isLoading || !user) return null;
  if (requiredDone && doneCount === STEPS.length) return null;

  const firstName =
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user.email?.split("@")[0] ??
    (isAr ? "أهلاً" : "there");

  const T = {
    hi: isAr ? `أهلاً بك، ${firstName} 👋` : `Welcome, ${firstName} 👋`,
    sub: isAr
      ? "دعنا نجهّز حسابك في أقل من ٣ دقائق. اتبع الخطوات بالترتيب."
      : "Let's set up your account in under 3 minutes. Follow the steps in order.",
    progress: isAr
      ? `${doneCount} من ${STEPS.length} خطوات مكتملة`
      : `${doneCount} of ${STEPS.length} steps done`,
    dismiss: isAr ? "إخفاء" : "Dismiss",
    open: isAr ? "افتح" : "Open",
    optional: isAr ? "اختياري" : "Optional",
    markDone: isAr ? "تم" : "Mark done",
    allDoneTitle: isAr ? "أساسيات الحساب جاهزة 🎉" : "Core setup complete 🎉",
    allDoneSub: isAr
      ? "أكمل الخطوات الاختيارية لتحصل على أفضل تجربة."
      : "Finish the optional steps for the best experience.",
  };

  return (
    <AnimatePresence>
      <motion.section
        key="welcome-checklist"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        aria-labelledby="welcome-checklist-title"
        className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-5 shadow-sm sm:p-6"
      >
        {/* Decorative glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 end-[-4rem] h-56 w-56 rounded-full bg-primary/10 blur-3xl"
        />

        {/* Header */}
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2
                id="welcome-checklist-title"
                className="truncate text-base font-bold text-foreground sm:text-lg"
              >
                {requiredDone ? T.allDoneTitle : T.hi}
              </h2>
              <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                {requiredDone ? T.allDoneSub : T.sub}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={T.dismiss}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Progress bar */}
        <div className="relative mt-5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>{T.progress}</span>
            <span aria-hidden>{pct}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={T.progress}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        {/* Steps */}
        <ol className="relative mt-5 grid gap-2 sm:grid-cols-2">
          {STEPS.map((step) => {
            const done = progress[step.id]?.done === true;
            const Icon = step.icon;
            return (
              <li key={step.id}>
                <div
                  className={`group flex items-center gap-3 rounded-xl border p-3 transition ${
                    done
                      ? "border-primary/20 bg-primary/5"
                      : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.03]"
                  }`}
                >
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
                      done
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary"
                    }`}
                    aria-hidden
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`truncate text-sm font-semibold ${
                          done ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                      >
                        {isAr ? step.labelAr : step.labelEn}
                      </span>
                      {!step.required && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {T.optional}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-1 text-[11px] text-muted-foreground">
                      {isAr ? step.descAr : step.descEn}
                    </p>
                  </div>
                  {!done && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        to={step.to}
                        aria-label={`${T.open}: ${isAr ? step.labelAr : step.labelEn}`}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        {T.open}
                        <ChevronRight
                          className="h-3 w-3 rtl:rotate-180"
                          aria-hidden
                        />
                      </Link>
                      {!step.required && (
                        <button
                          type="button"
                          onClick={() => markMut.mutate(step.id)}
                          disabled={markMut.isPending}
                          aria-label={`${T.markDone}: ${isAr ? step.labelAr : step.labelEn}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </motion.section>
    </AnimatePresence>
  );
}

export default WelcomeChecklist;
