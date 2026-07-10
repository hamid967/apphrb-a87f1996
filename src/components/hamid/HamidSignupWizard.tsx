import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, MicOff, Send, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { submitSignupRequest } from "@/lib/signup-requests.functions";
import { cn } from "@/lib/utils";

type Speak = (text: string) => void;

type Step = "name" | "phone" | "email" | "company" | "city" | "activity" | "notes" | "confirm" | "done";

type Draft = {
  full_name: string;
  phone: string;
  email: string;
  company_name: string;
  city: string;
  activity_type: string;
  notes: string;
};

const STEPS: Array<{ id: Step; label: string; prompt: string; optional?: boolean; validator?: (v: string) => string | null }> = [
  {
    id: "name",
    label: "الاسم الكامل",
    prompt: "طيّب، عطني اسمك الكامل من فضلك.",
    validator: (v) => (v.trim().length < 2 ? "الاسم قصير، قلها مرة ثانية." : null),
  },
  {
    id: "phone",
    label: "رقم الجوال",
    prompt: "زين. الآن قل لي رقم جوالك.",
    validator: (v) => {
      const digits = v.replace(/[^\d+]/g, "");
      return digits.length < 6 ? "الرقم ما وضح، جرّب مرة ثانية." : null;
    },
  },
  {
    id: "email",
    label: "الإيميل",
    prompt: "الحين قل لي الإيميل، أو اكتبه لو أوضح.",
    validator: (v) => (!/^\S+@\S+\.\S+$/.test(v.trim()) ? "الإيميل ما ظهر لي واضح، أكتبه من فضلك." : null),
  },
  {
    id: "company",
    label: "اسم الشركة أو المكتب",
    prompt: "اسم الشركة أو المكتب؟ لو ما عندك، قل تخطّى.",
    optional: true,
  },
  {
    id: "city",
    label: "المدينة",
    prompt: "من أي مدينة أنت؟",
    optional: true,
  },
  {
    id: "activity",
    label: "نوع النشاط",
    prompt: "وش نوع نشاطك؟ ملّاك، وسيط، أو مدير عقارات؟",
    optional: true,
  },
  {
    id: "notes",
    label: "ملاحظات",
    prompt: "أي ملاحظات تبي تضيفها للأدمن؟ لو ما فيه، قل تخطّى.",
    optional: true,
  },
  { id: "confirm", label: "تأكيد", prompt: "" },
  { id: "done", label: "تم", prompt: "" },
];

const SKIP_WORDS = /^(تخط[ىا]|تخطي|تخط|skip|لا شيء|ولا شي|تجاوز|next)$/i;

type SpeechRecognitionCtor = new () => any;
function getRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function HamidSignupWizard({
  speak,
  onClose,
}: {
  speak: Speak;
  onClose: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    full_name: "",
    phone: "",
    email: "",
    company_name: "",
    city: "",
    activity_type: "",
    notes: "",
  });
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const Rec = useMemo(getRecognition, []);
  const submitFn = useServerFn(submitSignupRequest);

  const step = STEPS[stepIdx];

  // Speak the prompt on step change
  const promptedFor = useRef<Step | null>(null);
  useEffect(() => {
    if (step.id === "done" || step.id === "confirm") return;
    if (promptedFor.current === step.id) return;
    promptedFor.current = step.id;
    if (step.prompt) speak(step.prompt);
  }, [step, speak]);

  const applyValue = useCallback((rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    if (step.optional && SKIP_WORDS.test(value)) {
      setInput("");
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
      return;
    }
    const err = step.validator?.(value);
    if (err) {
      setError(err);
      speak(err);
      return;
    }
    setError(null);
    setDraft((d) => {
      const next = { ...d };
      switch (step.id) {
        case "name": next.full_name = value; break;
        case "phone": next.phone = value.replace(/[^\d+]/g, ""); break;
        case "email": next.email = value.toLowerCase(); break;
        case "company": next.company_name = value; break;
        case "city": next.city = value; break;
        case "activity": next.activity_type = value; break;
        case "notes": next.notes = value; break;
      }
      return next;
    });
    setInput("");
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }, [step, speak]);

  const startVoice = useCallback(() => {
    if (!Rec || listening) return;
    const r = new Rec();
    r.lang = "ar-SA";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e: any) => {
      const t = Array.from(e.results as ArrayLike<any>)
        .map((res: any) => res[0]?.transcript || "")
        .join(" ")
        .trim();
      setInput(t);
      applyValue(t);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recRef.current = r;
    r.start();
    setListening(true);
  }, [Rec, listening, applyValue]);

  const stopVoice = () => {
    recRef.current?.stop();
    setListening(false);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitFn({
        data: {
          full_name: draft.full_name,
          phone: draft.phone,
          email: draft.email,
          company_name: draft.company_name || null,
          city: draft.city || null,
          activity_type: draft.activity_type || null,
          notes: draft.notes || null,
          source: "hamid_voice",
        },
      });
      setRequestId(res.id);
      setStepIdx(STEPS.findIndex((s) => s.id === "done"));
      speak("تمام، رفعت طلبك للأدمن. بيتواصل معك بأقرب وقت. جزاك الله خير.");
    } catch (e) {
      const msg = (e as Error).message || "تعذّر رفع الطلب";
      setError(msg);
      speak("عفواً، ما قدرت أرفع الطلب. جرّب مرة ثانية.");
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    setError(null);
    setStepIdx((i) => Math.max(0, i - 1));
    promptedFor.current = null;
  };

  return (
    <div dir="rtl" className="mx-4 mb-3 space-y-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-slate-900/40 to-slate-950/60 p-4 text-xs text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-white">طلب تسجيل جديد</div>
          <div className="text-[10px] text-slate-400">
            خطوة {Math.min(stepIdx + 1, STEPS.length - 1)} من {STEPS.length - 1}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 p-1.5 text-slate-200 hover:bg-white/20"
          aria-label="إغلاق"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all"
          style={{ width: `${(stepIdx / (STEPS.length - 1)) * 100}%` }}
        />
      </div>

      {step.id === "done" ? (
        <div className="space-y-2 rounded-xl bg-emerald-500/15 p-3 text-emerald-200">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            تم رفع طلبك بنجاح
          </div>
          <p className="text-[11px] leading-relaxed text-emerald-100/80">
            رقم الطلب: <code className="rounded bg-black/30 px-1">{requestId}</code>
          </p>
          <p className="text-[11px] leading-relaxed text-emerald-100/80">
            الأدمن بيراجع طلبك ويتواصل معك على الجوال أو الإيميل.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 inline-flex rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-400"
          >
            إغلاق
          </button>
        </div>
      ) : step.id === "confirm" ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-white/5 p-3">
            <div className="mb-2 text-[11px] font-semibold text-slate-200">راجع بياناتك:</div>
            <ul className="space-y-1 text-[11px]">
              <li><span className="text-slate-400">الاسم:</span> {draft.full_name}</li>
              <li><span className="text-slate-400">الجوال:</span> {draft.phone}</li>
              <li><span className="text-slate-400">الإيميل:</span> {draft.email}</li>
              {draft.company_name && <li><span className="text-slate-400">الشركة:</span> {draft.company_name}</li>}
              {draft.city && <li><span className="text-slate-400">المدينة:</span> {draft.city}</li>}
              {draft.activity_type && <li><span className="text-slate-400">النشاط:</span> {draft.activity_type}</li>}
              {draft.notes && <li><span className="text-slate-400">ملاحظات:</span> {draft.notes}</li>}
            </ul>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={back}
              className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/20"
            >
              رجوع
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-1.5 text-[11px] font-semibold text-white shadow-lg disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 -rotate-45" />}
              أرسل الطلب للأدمن
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="text-[11px] font-semibold text-slate-200">{step.label}{step.optional && <span className="ms-1 text-slate-500">(اختياري)</span>}</div>
            <div className="mt-1 text-[11px] text-slate-400">{step.prompt}</div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) applyValue(input);
            }}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={step.optional ? "اكتب أو قل تخطّى…" : "اكتب أو اضغط المايك…"}
              className="flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-slate-500"
              autoFocus
            />
            {Rec && (
              <button
                type="button"
                onClick={listening ? stopVoice : startVoice}
                className={cn(
                  "rounded-full p-1.5 transition",
                  listening
                    ? "bg-red-500 text-white"
                    : "bg-white/10 text-slate-200 hover:bg-white/20",
                )}
                aria-label={listening ? "إيقاف المايك" : "بدء المايك"}
              >
                {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-full bg-sky-500 p-1.5 text-white disabled:opacity-40"
              aria-label="تأكيد الخطوة"
            >
              <Send className="h-3.5 w-3.5 -rotate-45" />
            </button>
          </form>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={back}
              disabled={stepIdx === 0}
              className="text-[11px] text-slate-400 hover:text-white disabled:opacity-40"
            >
              ← رجوع
            </button>
            {step.optional && (
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
                }}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                تخطّي
              </button>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          {error}
        </div>
      )}
    </div>
  );
}
