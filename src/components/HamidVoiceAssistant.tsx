import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Loader2, Minimize2, Phone, PhoneOff, RotateCcw, Send, Settings2, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askHamidAgent } from "@/lib/hamid-agent.functions";
import {
  HAMID_VOICE_PRESETS,
  useHamidVoiceSettings,
  type HamidVoiceSettings,
} from "@/lib/hamid-voice-settings";
import { cn } from "@/lib/utils";

type LogLevel = "info" | "warn" | "error" | "ok";
type LogEntry = { id: number; ts: number; level: LogLevel; msg: string; hint?: string };
type DiagCheck = { name: string; status: "ok" | "warn" | "error"; detail: string; fix?: string };

let __logId = 0;
const __logListeners = new Set<(entry: LogEntry) => void>();
function pushLog(level: LogLevel, msg: string, hint?: string) {
  const entry: LogEntry = { id: ++__logId, ts: Date.now(), level, msg, hint };
  __logListeners.forEach((l) => l(entry));
  const tag = "[Hamid]";
  if (level === "error") console.error(tag, msg, hint ?? "");
  else if (level === "warn") console.warn(tag, msg, hint ?? "");
  else console.log(tag, msg, hint ?? "");
}

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

const INTENT_RULES: IntentRule[] = [
  {
    mode: "signup",
    patterns: [/تسجيل|حساب|اشترك|ابدأ|انشاء حساب|إنشاء حساب|signup|register|account/],
    text: "حياك الله. نبدأ التسجيل من صفحة إنشاء الحساب، ثم تكمل الملف الشخصي، وبعدها بيانات المنشأة ومساحة العمل.",
    actionLabel: "افتح التسجيل",
    actionPath: "/auth?mode=signup",
  },
  {
    mode: "navigate",
    patterns: [/لوحة|الرئيسية|داشبورد|dashboard|home/],
    text: "أفتح لك لوحة التحكم. هناك تتابع التحصيل، الشغور، العقود القريبة، الصيانة، والتنبيهات المهمة.",
    actionLabel: "افتح لوحة التحكم",
    actionPath: "/dashboard",
  },
  {
    mode: "task",
    patterns: [/أضف|اضف|عقار جديد|وحدة جديدة|property|properties|unit|عقار|عقارات|وحدة|وحدات/],
    text: "لإضافة عقار نحتاج الاسم، المدينة، العنوان، نوع الوحدة، السعر، الحالة، والصور.",
    actionLabel: "أضف عقار",
    actionPath: "/properties/new",
  },
  {
    mode: "task",
    patterns: [/تحصيل|متأخر|متأخرات|دفعات|ايجار|إيجار|فاتورة|سداد|arrears|collection|payment|invoice/],
    text: "خطة التحصيل: حدد المتأخرات، صنفها حسب عمر التأخير، أرسل تذكير، سجل وعد السداد.",
    actionLabel: "افتح المحاسبة",
    actionPath: "/accounting",
  },
  {
    mode: "task",
    patterns: [/صيانة|بلاغ|تذكرة|عطل|فني|maintenance|ticket/],
    text: "لبلاغ الصيانة، سجل العقار والوحدة، وصف المشكلة، الأولوية، ثم عيّن المورد.",
    actionLabel: "افتح الصيانة",
    actionPath: "/maintenance",
  },
  {
    mode: "task",
    patterns: [/عقد|عقود|تجديد|انتهاء|تأجير|leasing|contract|lease|renew/],
    text: "لإدارة العقود، راقب العقود التي تنتهي خلال 30 أو 60 يوم، وأرسل تنبيه مبكر.",
    actionLabel: "افتح التأجير والعقود",
    actionPath: "/leasing",
  },
  {
    mode: "coach",
    patterns: [/تقرير|تقارير|ملخص|اداء|أداء|مؤشرات|report|analytics|kpi/],
    text: "ابدأ بتقرير تنفيذي مختصر: التحصيل، المتأخرات، الشغور، العقود القريبة، الصيانة المفتوحة.",
    actionLabel: "افتح التقارير",
    actionPath: "/reports",
  },
  {
    mode: "task",
    patterns: [/عميل|عملاء|مالك|مستأجر|وسيط|lead|contact|crm|tenant|owner/],
    text: "لإدارة العملاء، سجل بيانات التواصل، نوع العلاقة، الملاحظات، واربط العميل بالعقار.",
    actionLabel: "افتح العملاء",
    actionPath: "/contacts",
  },
];

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as SpeechSynthesisWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
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
    const matches = rule.patterns.filter((p) => p.test(input)).length;
    if (matches > score) {
      score = matches;
      best = rule;
    }
  }
  if (!best) return { confidence: "low" };
  return { rule: best, confidence: score > 1 ? "high" : "medium" };
}

function getLocalIntent(text: string, _history: Turn[]): HamidIntent {
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
    text: "هلا والله! أنا حامد، مساعدك في HBSpro. قل لي وش تبي: تسجيل، فتح صفحة، عقارات، تحصيل، صيانة، عقود، تقارير، أو عملاء.",
    actionLabel: "افتح لوحة التحكم",
    actionPath: "/dashboard",
    confidence: "low",
    mode: "fallback",
  };
}

function pickArabicVoice(gender: HamidVoiceSettings["gender"]) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const ar = voices.filter((v) => v.lang?.toLowerCase().startsWith("ar"));
  if (!ar.length) return null;
  const isMale = (n: string) =>
    /male|majed|maged|naayf|nayf|tarik|hamed|hamid|salman|khalid|abdul|رجل|ذكر/i.test(n) &&
    !/female|امرأة|أنثى|amira|noura|hala|salma/i.test(n);
  const isFemale = (n: string) =>
    /female|امرأة|أنثى|amira|noura|nora|hala|salma|maha|reem/i.test(n) &&
    !/male/i.test(n);
  const wantMale = gender === "male";
  const genderMatch = (n: string) => (wantMale ? isMale(n) : isFemale(n));
  return (
    ar.find((v) => v.lang === "ar-SA" && genderMatch(v.name)) ??
    ar.find((v) => genderMatch(v.name)) ??
    ar.find((v) => v.lang === "ar-SA") ??
    ar[0]
  );
}

/**
 * Prepare Arabic text for browser TTS so Saudi phonemes come out cleaner:
 * - strip diacritics that some voices mispronounce
 * - normalize hamza on ا so the voice doesn't over-stress it
 * - convert Latin digits to Arabic-Indic so ar-SA voices read them in Arabic
 * - add micro-pauses at natural boundaries for calmer pacing
 */
function prepareArabicForSpeech(text: string) {
  return text
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])
    .replace(/([،,])\s*/g, "$1 ")
    .replace(/([.؟!])\s*/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Currently-playing HTMLAudioElement for server-side TTS, so we can cancel. */
let currentAudio: HTMLAudioElement | null = null;

function stopSpeaking() {
  if (typeof window === "undefined") return;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  window.speechSynthesis?.cancel();
}

function speakBrowserFallback(text: string, settings: HamidVoiceSettings) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(prepareArabicForSpeech(text));
  u.lang = "ar-SA";
  u.rate = settings.rate;
  u.pitch = settings.pitch;
  u.volume = 1;
  const v = pickArabicVoice(settings.gender);
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
  return true;
}

/**
 * Speak with the Lovable AI Saudi-tuned TTS route; fall back to the browser
 * SpeechSynthesis engine when the network call fails or audio can't play.
 */
async function speakSaudi(
  text: string,
  settings: HamidVoiceSettings,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<boolean> {
  const clean = prepareArabicForSpeech(text);
  stopSpeaking();
  try {
    const res = await fetch("/api/hamid-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: clean,
        voice: settings.serverVoice,
        speed: settings.rate,
      }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onplay = () => onStart?.();
    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      onEnd?.();
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    await audio.play();
    return true;
  } catch {
    return speakBrowserFallback(text, settings);
  }
}




function goTo(path: string) {
  if (typeof window === "undefined") return;
  window.location.assign(path);
}

/** ElevenLabs-style gradient orb — inline SVG, no external assets. */
function VoiceOrb({
  size = 220,
  active = false,
  speaking = false,
}: {
  size?: number;
  active?: boolean;
  speaking?: boolean;
}) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* soft glow halo */}
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-2xl transition-opacity duration-500",
          active ? "opacity-70" : "opacity-40",
        )}
        style={{
          background:
            "radial-gradient(circle at 30% 30%, #d6d67a 0%, #6bb3a9 35%, #2f7fbf 70%, transparent 78%)",
        }}
      />
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className={cn(
          "relative drop-shadow-2xl transition-transform duration-500",
          active && "animate-[spin_18s_linear_infinite]",
          speaking && "scale-105",
        )}
      >
        <defs>
          <radialGradient id="hamidOrb" cx="35%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#f3ecb0" />
            <stop offset="28%" stopColor="#b8c96a" />
            <stop offset="55%" stopColor="#4fa39a" />
            <stop offset="82%" stopColor="#2b6fb3" />
            <stop offset="100%" stopColor="#0b2a4a" />
          </radialGradient>
          <radialGradient id="hamidGrain" cx="50%" cy="50%" r="55%">
            <stop offset="60%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
          </radialGradient>
          <filter id="hamidNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
            <feColorMatrix
              values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.35 0"
            />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
        <circle cx="100" cy="100" r="92" fill="url(#hamidOrb)" />
        <circle cx="100" cy="100" r="92" fill="url(#hamidGrain)" />
        <circle cx="100" cy="100" r="92" filter="url(#hamidNoise)" opacity="0.55" />
        {/* inner white dot for phone icon */}
        <circle cx="100" cy="100" r="26" fill="#ffffff" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Phone className="h-6 w-6 text-black" />
      </div>
    </div>
  );
}

/** Small orb used inside the floating launch button. */
function MiniOrb({ size = 44 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <radialGradient id="hamidOrbMini" cx="35%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#f3ecb0" />
            <stop offset="30%" stopColor="#b8c96a" />
            <stop offset="60%" stopColor="#4fa39a" />
            <stop offset="90%" stopColor="#2b6fb3" />
            <stop offset="100%" stopColor="#0b2a4a" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="92" fill="url(#hamidOrbMini)" />
        <circle cx="100" cy="100" r="30" fill="#ffffff" />
      </svg>
      <Phone className="absolute h-3.5 w-3.5 text-black" />
    </span>
  );
}

export function HamidVoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [textInput, setTextInput] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [reply, setReply] = useState<HamidIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const { settings, update, reset } = useHamidVoiceSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const speak = (text: string) => {
    void speakSaudi(text, settingsRef.current);
    return true;
  };
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const Recognition = useMemo(getSpeechRecognition, []);
  const speechSupported = Boolean(Recognition);
  const synthesisSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!synthesisSupported) return;
    const s = window.speechSynthesis;
    // Warm up voice list (Chrome loads voices async)
    s.getVoices();
    const onVoices = () => s.getVoices();
    s.addEventListener?.("voiceschanged", onVoices);
    const iv = window.setInterval(() => setSpeaking(s.speaking), 250);
    return () => {
      window.clearInterval(iv);
      s.removeEventListener?.("voiceschanged", onVoices);
    };
  }, [synthesisSupported]);


  const callAgent = useServerFn(askHamidAgent);

  const answer = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;
    setLoading(true);
    setError(null);
    try {
      const historyPayload = history.flatMap((t) => [
        { role: "user" as const, content: t.user },
        { role: "assistant" as const, content: t.assistant },
      ]);
      const res = await callAgent({ data: { message: clean, history: historyPayload } });
      const next: HamidIntent = {
        text: res.reply,
        actionLabel: res.action_label,
        actionPath: res.action_path,
        confidence: "high",
        mode: res.action_path ? "navigate" : "coach",
      };
      setReply(next);
      setHistory((h) => [...h.slice(-6), { user: clean, assistant: next.text, mode: next.mode }]);
      const spoken = speak(next.text);
      if (!spoken) setError("الصوت المحلي غير مدعوم في هذا المتصفح.");
    } catch (err) {
      const fallback = getLocalIntent(clean, history);
      setReply(fallback);
      speak(fallback.text);
      setError("تعذّر الاتصال بحامد الآن، تم استخدام الرد المحلي.");
      void err;
    } finally {
      setLoading(false);
    }
  };

  const startListening = () => {
    if (!Recognition || listening || loading) return;
    setError(null);
    setTranscript("");
    const r = new Recognition();
    r.lang = "ar-SA";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((res) => res[0]?.transcript || "").join(" ").trim();
      setTranscript(t);
      void answer(t);
    };
    r.onerror = () => {
      setListening(false);
      setError("لم أستطع سماعك بوضوح. جرّب مرة ثانية.");
    };
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    r.start();
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const startCall = async () => {
    setCallActive(true);
    setReply({
      text: "هلا والله! معك حامد. قل لي وش تبي وأنا على طول أخدمك.",
      confidence: "high",
      mode: "coach",
    });
    speak("هلا والله! معك حامد. قل لي وش تبي وأنا على طول أخدمك.");
    if (speechSupported) startListening();
  };


  const endCall = () => {
    stopListening();
    stopSpeaking();
    setCallActive(false);
    setSpeaking(false);
  };

  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = textInput.trim();
    if (!t) return;
    setTextInput("");
    void answer(t);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 start-5 z-40 flex items-center gap-2 rounded-full bg-white/95 py-2 pe-4 ps-2 text-sm font-semibold text-slate-900 shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_25px_60px_-10px_rgba(47,127,191,0.6)] dark:bg-slate-900/90 dark:text-slate-100"
        aria-label="افتح مساعد حامد الصوتي"
      >
        <MiniOrb size={38} />
        <span>حامد</span>
      </button>
    );
  }

  return (
    <section
      dir="rtl"
      className="fixed bottom-5 start-5 z-40 w-[380px] max-w-[92vw] overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_40px_120px_-30px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-slate-950"
      aria-label="مساعد حامد الصوتي"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
          <span className="text-base leading-none">🇸🇦</span>
          <span>العربية</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className={cn(
              "rounded-full p-2 transition",
              settingsOpen
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
            )}
            aria-label="إعدادات الصوت"
            aria-pressed={settingsOpen}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              endCall();
              setOpen(false);
            }}
            className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label="تصغير"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="mx-4 mb-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-slate-900 dark:text-white">إعدادات الصوت</span>
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              إعادة ضبط
            </button>
          </div>

          {/* Gender */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">نوع الصوت</label>
            <div className="grid grid-cols-2 gap-2">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => update({ gender: g, serverVoice: HAMID_VOICE_PRESETS[g][0].id })}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-[12px] font-medium transition",
                    settings.gender === g
                      ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
                  )}
                >
                  {g === "male" ? "ذكر" : "أنثى"}
                </button>
              ))}
            </div>
          </div>

          {/* Voice preset */}
          <div>
            <label htmlFor="hamid-voice-preset" className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              اختر الصوت
            </label>
            <select
              id="hamid-voice-preset"
              value={settings.serverVoice}
              onChange={(e) => update({ serverVoice: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {HAMID_VOICE_PRESETS[settings.gender].map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {/* Rate */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>معدل السرعة</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">{settings.rate.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0.7}
              max={1.3}
              step={0.05}
              value={settings.rate}
              onChange={(e) => update({ rate: Number(e.target.value) })}
              className="w-full accent-slate-900 dark:accent-white"
            />
          </div>

          {/* Pitch (browser fallback only) */}
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>درجة النبرة</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200">{settings.pitch.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={settings.pitch}
              onChange={(e) => update({ pitch: Number(e.target.value) })}
              className="w-full accent-slate-900 dark:accent-white"
            />
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
              النبرة تُطبَّق على صوت المتصفح الاحتياطي فقط.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => speak("هلا والله، هذا صوتي الحالي، جرّب وقول لي رأيك.")}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-900"
            >
              معاينة الصوت
            </button>
            <button
              type="button"
              onClick={() => stopSpeaking()}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:text-slate-900 dark:bg-slate-800 dark:text-slate-200"
            >
              إيقاف
            </button>
          </div>
        </div>
      )}


      {/* Orb stage */}
      <div className="flex flex-col items-center gap-4 px-5 pb-4 pt-2">
        <button
          type="button"
          onClick={callActive ? endCall : startCall}
          className="group relative outline-none"
          aria-label={callActive ? "إنهاء المكالمة" : "بدء مكالمة مع حامد"}
        >
          <VoiceOrb size={200} active={callActive} speaking={speaking || listening} />
        </button>

        <p className="max-w-[280px] text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {callActive
            ? listening
              ? "يستمع إليك الآن…"
              : speaking
                ? "حامد يتحدث…"
                : "اضغط الأيقونة لإنهاء المكالمة"
            : "اكتشف قدرات المساعد الصوتي حامد — بدون أي ربط خارجي"}
        </p>

        {transcript && (
          <div className="w-full rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
            <span className="font-semibold">أنت:</span> {transcript}
          </div>
        )}
        {reply && (
          <div className="w-full space-y-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">حامد:</span> {reply.text}
            </div>
            {reply.actionLabel && reply.actionPath && (
              <button
                type="button"
                onClick={() => goTo(reply.actionPath!)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-900"
              >
                {reply.actionLabel}
                <ArrowRight className="h-3 w-3 rotate-180" />
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="w-full rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {error}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={submitText}
        className="mx-4 mb-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm focus-within:border-slate-400 dark:border-slate-700 dark:bg-slate-900"
      >
        <input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="أو اكتب رسالة…"
          className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
        {callActive ? (
          <button
            type="button"
            onClick={endCall}
            className="rounded-full bg-red-500 p-2 text-white transition hover:bg-red-600"
            aria-label="إنهاء المكالمة"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={loading || !textInput.trim()}
            className="rounded-full bg-slate-900 p-2 text-white transition hover:-translate-y-0.5 disabled:opacity-40 dark:bg-white dark:text-slate-900"
            aria-label="إرسال"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 -rotate-45" />}
          </button>
        )}
      </form>

      {!speechSupported && (
        <p className="px-5 pb-3 text-[11px] text-slate-500 dark:text-slate-400">
          التعرف الصوتي غير مدعوم في هذا المتصفح — استعمل Chrome أو Edge لتشغيل المايك.
        </p>
      )}
    </section>
  );
}
