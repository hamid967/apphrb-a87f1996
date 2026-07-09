import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X, ChevronRight, ChevronLeft, CheckCircle2, Sparkles } from "lucide-react";
import { setOnboardingStep } from "@/lib/onboarding.functions";

/**
 * Coach Marks — auto-launching, step-by-step guided hints.
 *
 * Trigger: any URL with `?coach=<stepId>` renders this overlay.
 * A tour is defined per checklist step (see TOURS below). For each hint:
 *  - If a target element (by CSS selector, incl. `[data-coach="key"]`) exists,
 *    the card anchors near it and a spotlight highlights the element.
 *  - Otherwise the card centers on screen so the tour still runs on pages
 *    that don't (yet) declare targets.
 *
 * Completion is remembered per stepId in localStorage so a returning user
 * isn't re-nagged; the WelcomeChecklist can re-open it explicitly.
 */

type Hint = {
  selector?: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  placement?: "top" | "bottom" | "auto";
};

type Tour = {
  id: string;
  hints: Hint[];
};

const TOURS: Record<string, Tour> = {
  profile: {
    id: "profile",
    hints: [
      {
        selector: '[data-coach="profile-name"], input[name="full_name"], input[name="fullName"]',
        titleAr: "أدخل اسمك الكامل",
        titleEn: "Enter your full name",
        bodyAr: "اكتب اسمك كما تريده أن يظهر على الفواتير والتقارير.",
        bodyEn: "Use the name you want to appear on invoices & reports.",
      },
      {
        selector: '[data-coach="profile-phone"], input[name="phone"], input[type="tel"]',
        titleAr: "أضف رقم جوالك",
        titleEn: "Add your mobile",
        bodyAr: "يُستخدم لاستلام التنبيهات ورموز التحقق.",
        bodyEn: "Used for alerts and verification codes.",
      },
      {
        selector: '[data-coach="profile-save"], button[type="submit"]',
        titleAr: "احفظ التغييرات",
        titleEn: "Save your changes",
        bodyAr: "اضغط حفظ لإكمال هذه الخطوة.",
        bodyEn: "Hit save to complete this step.",
      },
    ],
  },
  company: {
    id: "company",
    hints: [
      {
        selector: '[data-coach="company-name"], input[name="company_name"], input[name="name"]',
        titleAr: "اسم المنشأة",
        titleEn: "Company name",
        bodyAr: "الاسم القانوني لمنشأتك كما في السجل التجاري.",
        bodyEn: "Your legal company name as on the CR.",
      },
      {
        selector: '[data-coach="company-cr"], input[name="cr_number"], input[name="crNumber"]',
        titleAr: "السجل التجاري والرقم الضريبي",
        titleEn: "CR & VAT numbers",
        bodyAr: "أدخلها الآن لتظهر تلقائياً على الفواتير الضريبية.",
        bodyEn: "Add them now to appear on tax invoices automatically.",
      },
      {
        selector: '[data-coach="company-save"], button[type="submit"]',
        titleAr: "احفظ بيانات المنشأة",
        titleEn: "Save company details",
        bodyAr: "بعد الحفظ يمكنك دعوة زملائك وإصدار الفواتير.",
        bodyEn: "After saving you can invite teammates & issue invoices.",
      },
    ],
  },
  first_receipt: {
    id: "first_receipt",
    hints: [
      {
        selector: '[data-coach="receipt-upload"]',
        titleAr: "ارفع صورة/ملف الإيصال",
        titleEn: "Upload the receipt image/file",
        bodyAr: "اسحب الملف هنا أو اضغط لاختياره (صورة أو PDF حتى 10MB). سنبدأ استخراج البيانات تلقائياً بعد الرفع.",
        bodyEn: "Drag the file here or click to pick one (image or PDF, up to 10MB). OCR starts automatically after upload.",
      },
      {
        selector: '[data-coach="receipt-amount"]',
        titleAr: "المبلغ والتاريخ يُعبَّآن تلقائياً",
        titleEn: "Amount & date fill in automatically",
        bodyAr: "بمجرد انتهاء الفحص الذكي سيظهر شارة «تعبئة تلقائية» على الحقول — راجعها وعدّلها إن لزم قبل المتابعة.",
        bodyEn: "As soon as OCR finishes you'll see an ‘auto-filled’ badge — review the values and tweak if needed before you continue.",
      },
      {
        selector: '[data-coach="receipt-submit"]',
        titleAr: "أرسل المطالبة",
        titleEn: "Submit the claim",
        bodyAr: "بعد المراجعة اضغط «إرسال» — ستُحال للمدير المالي للاعتماد.",
        bodyEn: "After review, click Submit — it goes to your finance manager for approval.",
      },
    ],
  },
  invite_team: {
    id: "invite_team",
    hints: [
      {
        selector: '[data-coach="team-invite"], button:has(svg + span), a[href*="invite"]',
        titleAr: "اضغط «دعوة عضو جديد»",
        titleEn: "Click “Invite member”",
        bodyAr: "افتح نموذج الدعوة لإدخال البريد وتحديد الدور.",
        bodyEn: "Open the invite form to enter an email and role.",
      },
      {
        selector: '[data-coach="team-role"], select, [role="combobox"]',
        titleAr: "حدد الدور المناسب",
        titleEn: "Pick the right role",
        bodyAr: "الدور يحدد الصلاحيات — يمكنك تعديله لاحقاً.",
        bodyEn: "Role controls permissions — you can change it later.",
      },
      {
        selector: '[data-coach="team-send"], button[type="submit"]',
        titleAr: "أرسل الدعوة",
        titleEn: "Send the invite",
        bodyAr: "سيصل رابط انضمام على البريد خلال ثوانٍ.",
        bodyEn: "A join link is emailed within seconds.",
      },
    ],
  },
  reminders: {
    id: "reminders",
    hints: [
      {
        selector: '[data-coach="reminders-contracts"], [role="switch"]',
        titleAr: "فعّل تذكيرات العقود",
        titleEn: "Enable contract reminders",
        bodyAr: "تنبيه تلقائي قبل انتهاء أي عقد.",
        bodyEn: "Auto alert before any contract ends.",
      },
      {
        selector: '[data-coach="reminders-payments"]',
        titleAr: "فعّل تذكيرات الدفعات",
        titleEn: "Enable payment reminders",
        bodyAr: "تنبيه للمستأجرين وللفريق قبل موعد الاستحقاق.",
        bodyEn: "Alerts tenants & your team before due dates.",
      },
      {
        selector: '[data-coach="reminders-save"], button[type="submit"]',
        titleAr: "احفظ الإعدادات",
        titleEn: "Save preferences",
        bodyAr: "تسري التذكيرات فوراً على منشأتك.",
        bodyEn: "Reminders apply immediately for your company.",
      },
    ],
  },
};

const DONE_KEY = (id: string) => `aqari:coach:${id}:done`;

export function CoachMarks() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const markStep = useServerFn(setOnboardingStep);
  const search = useRouterState({ select: (s) => s.location.searchStr ?? "" });
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const coachId = useMemo(() => {
    try {
      const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      return p.get("coach");
    } catch {
      return null;
    }
  }, [search]);

  const tour = coachId ? TOURS[coachId] : null;
  const isAr = typeof document !== "undefined" && document.documentElement.lang !== "en";

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Reset when tour changes / page changes
  useEffect(() => {
    setIndex(0);
    setReady(false);
  }, [coachId, pathname]);

  const currentHint = tour?.hints[index] ?? null;

  // Locate target element for the current hint (retry briefly while page mounts)
  useLayoutEffect(() => {
    if (!currentHint) return;
    let cancelled = false;
    let attempts = 0;

    const tick = () => {
      if (cancelled) return;
      attempts += 1;
      let el: Element | null = null;
      if (currentHint.selector) {
        try {
          el = document.querySelector(currentHint.selector);
        } catch {
          el = null;
        }
      }
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
        setReady(true);
        try {
          (el as HTMLElement).scrollIntoView({
            behavior: reduce ? "auto" : "smooth",
            block: "center",
          });
        } catch {
          /* ignore */
        }
      } else if (attempts < 20) {
        rafRef.current = window.setTimeout(tick, 150) as unknown as number;
      } else {
        setRect(null);
        setReady(true); // fall back to centered card
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (rafRef.current) {
        clearTimeout(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [currentHint, reduce, pathname]);

  // Keep the spotlight aligned on resize / scroll
  useEffect(() => {
    if (!currentHint?.selector) return;
    const update = () => {
      try {
        const el = document.querySelector(currentHint.selector!);
        if (el) setRect(el.getBoundingClientRect());
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [currentHint]);

  // ESC to skip
  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, index]);

  if (!tour || !currentHint || typeof document === "undefined") return null;

  const total = tour.hints.length;
  const isLast = index >= total - 1;

  function stripCoachParam() {
    try {
      const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
      p.delete("coach");
      const rest = p.toString();
      // Use replace to avoid history clutter; keep any other params.
      navigate({
        to: pathname,
        search: rest ? (Object.fromEntries(p.entries()) as never) : ({} as never),
        replace: true,
      });
    } catch {
      /* ignore */
    }
  }

  function close(completed: boolean) {
    if (completed && tour) {
      try {
        localStorage.setItem(DONE_KEY(tour.id), "1");
      } catch {
        /* ignore */
      }
      // Mirror completion to the user's profile so the "done" state follows
      // them across devices. Fire-and-forget — never block the UI.
      void markStep({ data: { step: `__coach_${tour.id}`, done: true } }).catch(
        () => {
          /* ignore — local flag is enough */
        },
      );
    }
    stripCoachParam();
  }

  function next() {
    if (isLast) close(true);
    else setIndex((i) => i + 1);
  }
  function prev() {
    setIndex((i) => Math.max(0, i - 1));
  }

  // Card positioning
  const PAD = 12;
  const CARD_W = 320;
  const CARD_H = 180;
  let cardStyle: React.CSSProperties = {
    position: "fixed",
    left: `calc(50% - ${CARD_W / 2}px)`,
    top: `calc(50% - ${CARD_H / 2}px)`,
    width: CARD_W,
    zIndex: 10001,
  };
  let spotlightStyle: React.CSSProperties | null = null;
  if (rect && rect.width > 0 && rect.height > 0) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom;
    const placeBelow = spaceBelow > CARD_H + PAD + 20 || rect.top < CARD_H + PAD + 20;
    const top = placeBelow ? rect.bottom + PAD : rect.top - CARD_H - PAD;
    let left = rect.left + rect.width / 2 - CARD_W / 2;
    left = Math.max(12, Math.min(vw - CARD_W - 12, left));
    cardStyle = {
      position: "fixed",
      top: Math.max(12, Math.min(vh - CARD_H - 12, top)),
      left,
      width: CARD_W,
      zIndex: 10001,
    };
    spotlightStyle = {
      position: "fixed",
      top: rect.top - 6,
      left: rect.left - 6,
      width: rect.width + 12,
      height: rect.height + 12,
      borderRadius: 12,
      boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.55)",
      pointerEvents: "none",
      zIndex: 10000,
      transition: reduce ? undefined : "all 240ms cubic-bezier(0.22,1,0.36,1)",
    };
  }

  const T = {
    step: isAr ? `الخطوة ${index + 1} من ${total}` : `Step ${index + 1} of ${total}`,
    skip: isAr ? "تخطي" : "Skip",
    next: isAr ? "التالي" : "Next",
    prev: isAr ? "السابق" : "Back",
    finish: isAr ? "إنهاء" : "Finish",
    guide: isAr ? "دليل سريع" : "Quick guide",
  };

  const overlay = (
    <AnimatePresence>
      {ready && (
        <>
          {/* Backdrop — dim the page. When we have a spotlight rect we use a
              cutout via the spotlightStyle box-shadow; otherwise a soft scrim. */}
          {!spotlightStyle && (
            <motion.div
              key="coach-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px]"
              style={{ zIndex: 9999 }}
              onClick={() => close(false)}
            />
          )}
          {spotlightStyle && (
            <motion.div
              key="coach-spot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={spotlightStyle}
              className="ring-2 ring-primary/70"
            />
          )}
          <motion.div
            key={`coach-card-${index}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-title"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={cardStyle}
            className="rounded-2xl border border-primary/30 bg-background/95 p-4 shadow-2xl shadow-primary/10 backdrop-blur-md"
            dir={isAr ? "rtl" : "ltr"}
          >
            <div className="mb-2 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  {T.guide}
                </div>
                <div className="text-[10px] text-muted-foreground">{T.step}</div>
              </div>
              <button
                type="button"
                onClick={() => close(false)}
                aria-label={T.skip}
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <h3 id="coach-title" className="text-sm font-bold text-foreground">
              {isAr ? currentHint.titleAr : currentHint.titleEn}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {isAr ? currentHint.bodyAr : currentHint.bodyEn}
            </p>

            {/* Progress dots */}
            <div className="mt-3 flex items-center gap-1.5" aria-hidden>
              {tour.hints.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index
                      ? "w-6 bg-primary"
                      : i < index
                        ? "w-1.5 bg-primary/60"
                        : "w-1.5 bg-muted"
                  }`}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="text-xs font-semibold text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:underline"
              >
                {T.skip}
              </button>
              <div className="flex items-center gap-2">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={prev}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <ChevronLeft className="h-3 w-3 rtl:rotate-180" aria-hidden />
                    {T.prev}
                  </button>
                )}
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {isLast ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      {T.finish}
                    </>
                  ) : (
                    <>
                      {T.next}
                      <ChevronRight className="h-3 w-3 rtl:rotate-180" aria-hidden />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(overlay, document.body);
}

export default CoachMarks;
