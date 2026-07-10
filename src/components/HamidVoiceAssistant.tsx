import { useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Mic, MicOff, Volume2, X } from "lucide-react";
import { HBS } from "@/components/hbspro/tokens";
import { cn } from "@/lib/utils";

type SpeechRecognitionCtor = new () => SpeechRecognition;

type SpeechRecognition = EventTarget & {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechSynthesisWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

type HamidIntent = {
  text: string;
  actionLabel?: string;
  actionPath?: string;
  confidence: "high" | "medium" | "low";
  mode: "signup" | "navigate" | "task" | "coach" | "fallback";
};

type Turn = { user: string; assistant: string; mode: HamidIntent["mode"] };

type IntentRule = {
  mode: HamidIntent["mode"];
  patterns: RegExp[];
  text: string;
  actionLabel?: string;
  actionPath?: string;
  followUp?: string;
};

const TASK_SHORTCUTS = [
  "سجلني في المنصة",
  "افتح لوحة التحكم",
  "أضف عقار جديد",
  "سجل بلاغ صيانة",
  "أرني التقارير",
  "تابع التحصيل",
  "ما الخطوة التالية؟",
  "افتح المساعد الكامل",
];

const INTENT_RULES: IntentRule[] = [
  {
    mode: "signup",
    patterns: [/تسجيل|حساب|اشترك|ابدأ|انشاء حساب|إنشاء حساب|signup|register|account/],
    text:
      "حياك الله. نبدأ التسجيل من صفحة إنشاء الحساب، ثم تكمل الملف الشخصي، وبعدها بيانات المنشأة ومساحة العمل. لا تشارك كلمة المرور أو رمز التحقق معي.",
    actionLabel: "افتح التسجيل",
    actionPath: "/auth?mode=signup",
    followUp: "بعد فتح الصفحة، أدخل البريد وكلمة مرور قوية ثم أكمل خطوات التهيئة.",
  },
  {
    mode: "navigate",
    patterns: [/لوحة|الرئيسية|داشبورد|dashboard|home/],
    text:
      "أفتح لك لوحة التحكم. هناك تتابع التحصيل، الشغور، العقود القريبة، الصيانة، والتنبيهات المهمة من شاشة واحدة.",
    actionLabel: "افتح لوحة التحكم",
    actionPath: "/dashboard",
  },
  {
    mode: "task",
    patterns: [/أضف|اضف|عقار جديد|وحدة جديدة|property|properties|unit|عقار|عقارات|وحدة|وحدات/],
    text:
      "لإضافة عقار نحتاج الاسم، المدينة، العنوان، نوع الوحدة، السعر، الحالة، والصور. سأفتح لك صفحة الإضافة لتبدأ الإدخال خطوة بخطوة.",
    actionLabel: "أضف عقار",
    actionPath: "/properties/new",
  },
  {
    mode: "task",
    patterns: [/تحصيل|متأخر|متأخرات|دفعات|ايجار|إيجار|فاتورة|سداد|arrears|collection|payment|invoice/],
    text:
      "خطة التحصيل: حدد المتأخرات، صنفها حسب عمر التأخير، أرسل تذكير، سجل وعد السداد، ثم صعّد الحالات عالية المخاطر.",
    actionLabel: "افتح المحاسبة",
    actionPath: "/accounting",
  },
  {
    mode: "task",
    patterns: [/صيانة|بلاغ|تذكرة|عطل|فني|maintenance|ticket/],
    text:
      "لبلاغ الصيانة، سجل العقار والوحدة، وصف المشكلة، الأولوية، الصور إن وجدت، ثم عيّن المورد وتابع الإغلاق والتكلفة.",
    actionLabel: "افتح الصيانة",
    actionPath: "/maintenance",
  },
  {
    mode: "task",
    patterns: [/عقد|عقود|تجديد|انتهاء|تأجير|leasing|contract|lease|renew/],
    text:
      "لإدارة العقود، راقب العقود التي تنتهي خلال 30 أو 60 يوم، جهز شروط التجديد، وأرسل تنبيه مبكر للمستأجر والمالك.",
    actionLabel: "افتح التأجير والعقود",
    actionPath: "/leasing",
  },
  {
    mode: "coach",
    patterns: [/شاغر|شاغرة|اشغال|إشغال|vacant|vacancy|occupancy/],
    text:
      "للوحدات الشاغرة، راجع مدة الشغور، السعر مقارنة بالسوق، جودة الإعلان، والصور. بعدها اختر إجراء واحد: تعديل السعر، تحسين الإعلان، أو تكليف وسيط.",
    actionLabel: "افتح العقارات",
    actionPath: "/properties",
  },
  {
    mode: "coach",
    patterns: [/تقرير|تقارير|ملخص|اداء|أداء|مؤشرات|dashboard|report|analytics|kpi/],
    text:
      "ابدأ بتقرير تنفيذي مختصر: التحصيل، المتأخرات، الشغور، العقود القريبة، الصيانة المفتوحة، ثم توصية واحدة قابلة للتنفيذ اليوم.",
    actionLabel: "افتح التقارير",
    actionPath: "/reports",
  },
  {
    mode: "task",
    patterns: [/مهمة|مهام|تابع|تذكير|موعد|task|tasks|reminder/],
    text:
      "لإتمام المهام، اختر المسؤول، حدّد تاريخ الاستحقاق، واربط المهمة بالعقار أو العقد أو العميل حتى تبقى المتابعة واضحة.",
    actionLabel: "افتح المهام",
    actionPath: "/tasks",
  },
  {
    mode: "task",
    patterns: [/عميل|عملاء|مالك|مستأجر|وسيط|lead|contact|crm|tenant|owner/],
    text:
      "لإدارة العملاء، سجل بيانات التواصل، نوع العلاقة، الملاحظات، واربط العميل بالعقار أو العقد. بعدها تقدر تتابع الفرص والطلبات من نفس المكان.",
    actionLabel: "افتح العملاء",
    actionPath: "/contacts",
  },
  {
    mode: "coach",
    patterns: [/سعر|تسعير|قيمة|price|pricing|rent value/],
    text:
      "للتسعير، قارن الوحدة بمثيلاتها في نفس المدينة والحي، راجع مدة الشغور والطلب، ثم اختر سعر يقلل الشغور ويحافظ على العائد.",
    actionLabel: "افتح العقارات",
    actionPath: "/properties",
  },
  {
    mode: "navigate",
    patterns: [/المساعد الكامل|ذكاء|حامد كامل|assistant|ai/],
    text:
      "أفتح لك المساعد الكامل داخل اللوحة. هناك يقدر يقرأ سياق النظام حسب صلاحياتك ويعطيك إجابات أعمق من المساعد الصوتي المحلي.",
    actionLabel: "افتح المساعد الكامل",
    actionPath: "/assistant",
  },
  {
    mode: "task",
    patterns: [/استيراد|رفع ملف|csv|excel|اكسل|إكسل|import/],
    text:
      "للاستيراد، جهز ملف CSV أو Excel، راجع الأعمدة المطلوبة، ثم ابدأ من صفحة الاستيراد. انتبه لمطابقة البريد أو الجوال لتجنب التكرار.",
    actionLabel: "افتح الاستيراد",
    actionPath: "/settings/import",
  },
];

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechSynthesisWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function normalizeArabic(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[؟?،,.!]/g, " ")
    .replace(/\s+/g, " ");
}

function findIntent(text: string): { rule?: IntentRule; confidence: HamidIntent["confidence"] } {
  const input = normalizeArabic(text);
  let best: IntentRule | undefined;
  let score = 0;

  for (const rule of INTENT_RULES) {
    const matches = rule.patterns.filter((pattern) => pattern.test(input)).length;
    if (matches > score) {
      score = matches;
      best = rule;
    }
  }

  if (!best) return { confidence: "low" };
  return { rule: best, confidence: score > 1 ? "high" : "medium" };
}

function getFollowUp(history: Turn[]) {
  const last = history.at(-1);
  if (!last) return "أقدر أفتح لك الصفحة المناسبة أو أشرح لك الخطوات بصوت مختصر.";
  if (last.mode === "signup") return "نكمل التسجيل بفتح صفحة الحساب، ثم الملف الشخصي والمنشأة.";
  if (last.mode === "task") return "الخطوة التالية: افتح الصفحة، املأ البيانات الأساسية، ثم احفظ أو أرسل للمراجعة حسب الصفحة.";
  if (last.mode === "coach") return "ابدأ بالمؤشر الأهم، ثم نفذ إجراء واحد واضح، وبعده راقب النتيجة.";
  return "قل لي المهمة التي تريدها: تسجيل، عقار، صيانة، تحصيل، تقرير، أو مهمة.";
}

function getLocalIntent(text: string, history: Turn[]): HamidIntent {
  const input = normalizeArabic(text);
  if (/الخطوه التاليه|اكمل|كمل|تابع|وبعدين|بعدها|next/.test(input)) {
    return { text: getFollowUp(history), confidence: "medium", mode: "coach" };
  }

  const { rule, confidence } = findIntent(text);
  if (rule) {
    return {
      text: rule.followUp ? `${rule.text} ${rule.followUp}` : rule.text,
      actionLabel: rule.actionLabel,
      actionPath: rule.actionPath,
      confidence,
      mode: rule.mode,
    };
  }

  return {
    text:
      "حياك الله، أنا حامد مساعد HBSpro الصوتي. أقدر أساعدك في التسجيل، فتح الصفحات، وتجهيز مهام العقارات، التحصيل، الصيانة، العقود، التقارير، العملاء، والاستيراد.",
    actionLabel: "افتح لوحة التحكم",
    actionPath: "/dashboard",
    confidence: "low",
    mode: "fallback",
  };
}

function pickArabicVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang === "ar-SA") ??
    voices.find((voice) => voice.lang.startsWith("ar")) ??
    null
  );
}

function speakLocally(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  utterance.rate = 0.92;
  utterance.pitch = 0.95;
  utterance.volume = 1;
  const voice = pickArabicVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return true;
}

function goTo(path: string) {
  if (typeof window === "undefined") return;
  window.location.assign(path);
}

export function HamidVoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [reply, setReply] = useState<HamidIntent>(() => getLocalIntent("", []));
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const Recognition = useMemo(getSpeechRecognition, []);
  const speechSupported = Boolean(Recognition);
  const synthesisSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const answer = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || loading) return;

    setLoading(true);
    setError(null);
    const nextReply = getLocalIntent(cleanText, history);
    setReply(nextReply);
    setHistory((items) => [
      ...items.slice(-4),
      { user: cleanText, assistant: nextReply.text, mode: nextReply.mode },
    ]);

    await new Promise((resolve) => window.setTimeout(resolve, 220));
    const spoken = speakLocally(nextReply.text);
    if (!spoken) setError("الصوت المحلي غير مدعوم في هذا المتصفح، لكن الرد النصي ظاهر أمامك.");
    setLoading(false);
  };

  const startListening = () => {
    if (!Recognition || listening || loading) return;
    setError(null);
    setTranscript("");
    const recognition = new Recognition();
    recognition.lang = "ar-SA";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      setTranscript(text);
      void answer(text);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("لم أستطع سماعك بوضوح. جرّب مرة ثانية.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 start-5 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur transition hover:-translate-y-0.5"
        style={{
          background: `linear-gradient(120deg, ${HBS.gold}, ${HBS.blue})`,
          border: `1px solid ${HBS.border}`,
          boxShadow: `0 20px 50px -15px ${HBS.blue}`,
        }}
        aria-label="تحدث صوتياً مع حامد"
      >
        <Volume2 className="size-4" style={{ color: HBS.goldSoft }} />
        حامد AI
      </button>
    );
  }

  return (
    <section
      className="fixed bottom-5 start-5 z-40 w-[380px] max-w-[92vw] overflow-hidden rounded-2xl backdrop-blur-2xl"
      style={{
        background: "linear-gradient(160deg, rgba(11,27,44,0.94), rgba(7,19,32,0.98))",
        border: `1px solid ${HBS.border}`,
        boxShadow: `0 35px 90px -30px ${HBS.blue}`,
        color: HBS.white,
      }}
      aria-label="مساعد حامد الصوتي الذكي"
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${HBS.border}` }}>
        <div>
          <h2 className="text-sm font-semibold">حامد — وكيل صوتي ذكي</h2>
          <p className="text-[11px]" style={{ color: HBS.gray }}>
            استماع · فهم نية · تنفيذ آمن · بدون ElevenLabs
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            stopListening();
            window.speechSynthesis?.cancel();
            setOpen(false);
          }}
          className="rounded-md p-1 transition hover:bg-white/10"
          style={{ color: HBS.gray }}
          aria-label="إغلاق المساعد المحلي"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3 p-4 text-sm">
        {!speechSupported && (
          <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">
            التعرف الصوتي غير مدعوم في هذا المتصفح. جرّب Chrome أو Edge لتفعيل المايك.
          </div>
        )}
        {!synthesisSupported && (
          <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">
            النطق الصوتي المحلي غير مدعوم هنا، وسيظهر رد حامد كنص فقط.
          </div>
        )}
        <button
          type="button"
          onClick={listening ? stopListening : startListening}
          disabled={!speechSupported || loading}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white transition",
            listening && "animate-pulse",
          )}
          style={{
            background: listening
              ? `linear-gradient(120deg, #dc2626, ${HBS.gold})`
              : `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})`,
            opacity: !speechSupported || loading ? 0.65 : 1,
          }}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          {loading ? "حامد يحلل الطلب…" : listening ? "إيقاف الاستماع" : "تحدث الآن"}
        </button>

        <div className="flex flex-wrap gap-1.5">
          {TASK_SHORTCUTS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void answer(item)}
              className="rounded-full px-2.5 py-1 text-[11px] transition hover:-translate-y-0.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${HBS.border}`,
                color: HBS.goldSoft,
              }}
            >
              {item}
            </button>
          ))}
        </div>

        {transcript && (
          <div className="rounded-xl bg-white/5 p-3 text-xs" style={{ border: `1px solid ${HBS.border}` }}>
            <span style={{ color: HBS.goldSoft }}>سمعتك:</span> {transcript}
          </div>
        )}
        {reply.text && (
          <div className="space-y-2 rounded-xl bg-white/5 p-3 text-xs leading-relaxed" style={{ border: `1px solid ${HBS.border}` }}>
            <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: HBS.gray }}>
              <span>النمط: {reply.mode}</span>
              <span>الثقة: {reply.confidence}</span>
            </div>
            <div>
              <span style={{ color: HBS.goldSoft }}>حامد:</span> {reply.text}
            </div>
            {reply.actionLabel && reply.actionPath && (
              <button
                type="button"
                onClick={() => goTo(reply.actionPath!)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition hover:-translate-y-0.5"
                style={{ background: `linear-gradient(120deg, ${HBS.blue}, ${HBS.gold})` }}
              >
                {reply.actionLabel}
                <ArrowRight className="size-3" />
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
