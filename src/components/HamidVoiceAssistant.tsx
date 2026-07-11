import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Loader2, Minimize2, Phone, PhoneOff, RotateCcw, Send, Settings2, UserPlus, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askHamidAgent } from "@/lib/hamid-agent.functions";
import {
  HAMID_VOICE_PRESETS,
  useHamidVoiceSettings,
  type HamidVoiceSettings,
} from "@/lib/hamid-voice-settings";
import { cn } from "@/lib/utils";
import { HamidSignupWizard } from "@/components/hamid/HamidSignupWizard";
const HamidCore3D = lazy(() => import("@/components/hamid/HamidCore3D").then((m) => ({ default: m.HamidCore3D })));

const SIGNUP_INTENT = /(اب[يى]|ابغ[ىا]|ودي|ابدا)?\s*(اسج[لّ]|تسجيل|فتح\s*حساب|انشا[ءا]?\s*حساب|اشترك|طلب\s*تسجيل|signup|register|sign\s*up)/i;

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
  onerror: ((event: { error: string; message?: string }) => void) | null;
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
/** In-flight TTS fetch controller, so a new speak() cancels the previous one. */
let currentTtsAbort: AbortController | null = null;
/** Monotonic request id — only the latest speak() request may produce audio. */
let ttsSeq = 0;

function stopSpeaking() {
  if (typeof window === "undefined") return;
  if (currentTtsAbort) {
    try { currentTtsAbort.abort(); } catch { /* noop */ }
    currentTtsAbort = null;
  }
  if (currentAudio) {
    try {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.onplay = null;
      currentAudio.pause();
      currentAudio.src = "";
    } catch { /* noop */ }
    currentAudio = null;
  }
  window.speechSynthesis?.cancel();
}

type SpeakCallbacks = {
  onStart?: (source: "server" | "browser", durationSec?: number) => void;
  onEnd?: () => void;
  /** Fired on real playback progress (0..1). Server: timeupdate. Browser: boundary. */
  onProgress?: (ratio: number) => void;
  /** Fired for word/segment boundaries when the engine reports them. */
  onBoundary?: (charIndex: number, wordLength?: number) => void;
};


function speakBrowserFallback(
  text: string,
  settings: HamidVoiceSettings,
  cb?: SpeakCallbacks,
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    pushLog("error", "Web Speech API غير متاحة في هذا المتصفح", "استعمل Chrome أو Edge على سطح المكتب.");
    return false;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(prepareArabicForSpeech(text));
  u.lang = "ar-SA";
  u.rate = settings.rate;
  u.pitch = settings.pitch;
  u.volume = 1;
  const v = pickArabicVoice(settings.gender);
  if (v) {
    u.voice = v;
    pushLog("info", `تشغيل صوت المتصفح: ${v.name} (${v.lang})`);
  } else {
    pushLog("warn", "لا يوجد صوت عربي مثبت في النظام", "سيُستخدم الصوت الافتراضي. ثبّت حزمة صوت ar-SA من إعدادات نظامك.");
  }
  u.onstart = () => cb?.onStart?.("browser");
  u.onboundary = (e: SpeechSynthesisEvent) => {
    // Fires per-word (and sometimes per-sentence) with charIndex into the utterance.
    const total = u.text?.length || 1;
    const idx = Math.max(0, Math.min(total, e.charIndex ?? 0));
    const len = (e as SpeechSynthesisEvent & { charLength?: number }).charLength;
    cb?.onBoundary?.(idx, len);
    cb?.onProgress?.(Math.min(1, (idx + (len ?? 0)) / total));
  };
  u.onend = () => {
    cb?.onProgress?.(1);
    cb?.onEnd?.();
  };
  u.onerror = (e: SpeechSynthesisErrorEvent) => {

    pushLog("error", `فشل نطق المتصفح: ${e.error}`, "قد يكون بسبب حظر التشغيل التلقائي. تفاعل مع الصفحة أولاً.");
    cb?.onEnd?.();
  };
  try {
    window.speechSynthesis.speak(u);
    return true;
  } catch (err) {
    pushLog("error", "SpeechSynthesis.speak رمى استثناء", String(err));
    cb?.onEnd?.();
    return false;
  }
}

/**
 * Speak with the Lovable AI Saudi-tuned TTS route; fall back to the browser
 * SpeechSynthesis engine when the network call fails or audio can't play.
 * Guarantees a single voice at a time: cancels any prior request/playback,
 * and never double-fires the fallback once server audio has begun playing.
 */
async function speakSaudi(
  text: string,
  settings: HamidVoiceSettings,
  cb?: SpeakCallbacks,
): Promise<boolean> {
  const clean = prepareArabicForSpeech(text);
  stopSpeaking();
  const mySeq = ++ttsSeq;
  const controller = new AbortController();
  currentTtsAbort = controller;
  try {
    const res = await fetch("/api/hamid-tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: clean,
        voice: settings.serverVoice,
        speed: settings.rate,
      }),
      signal: controller.signal,
    });
    if (mySeq !== ttsSeq) return false;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      pushLog("warn", `خادم TTS رجّع ${res.status}`, body.slice(0, 140) || "سنستخدم صوت المتصفح الاحتياطي.");
      throw new Error(`tts ${res.status}`);
    }
    const blob = await res.blob();
    if (mySeq !== ttsSeq) return false;
    if (!blob.size) {
      pushLog("warn", "استجابة TTS فارغة", "التبديل لصوت المتصفح.");
      throw new Error("empty tts");
    }
    if (mySeq !== ttsSeq) return false;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = settings.rate;
    currentAudio = audio;
    let started = false;
    let finalized = false;
    const cleanup = () => {
      if (finalized) return;
      finalized = true;
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      cb?.onEnd?.();
    };
    audio.onplay = () => {
      if (mySeq !== ttsSeq) {
        try { audio.pause(); audio.src = ""; } catch { /* noop */ }
        cleanup();
        return;
      }
      started = true;
      pushLog("ok", "تشغيل صوت الخادم (Lovable AI TTS)");
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined;
      cb?.onStart?.("server", dur);
    };
    audio.ontimeupdate = () => {
      const d = audio.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      cb?.onProgress?.(Math.min(1, audio.currentTime / d));
    };
    audio.onended = () => {
      cb?.onProgress?.(1);
      cleanup();
    };

    audio.onerror = () => {
      const shouldFallback = !started;
      pushLog(
        shouldFallback ? "error" : "warn",
        "حدث خطأ أثناء تشغيل ملف صوت الخادم",
        shouldFallback ? "سنجرّب صوت المتصفح." : "المقطع بدأ التشغيل — لن نكرر النطق.",
      );
      cleanup();
      if (shouldFallback && mySeq === ttsSeq) speakBrowserFallback(text, settings, cb);
    };
    try {
      await audio.play();
    } catch (playErr) {
      cleanup();
      if (mySeq === ttsSeq) {
        pushLog("warn", "تعذّر بدء تشغيل الصوت — تحويل لصوت المتصفح", String((playErr as Error).message ?? playErr));
        return speakBrowserFallback(text, settings, cb);
      }
      return false;
    }
    if (mySeq !== ttsSeq) {
      try { audio.pause(); audio.src = ""; } catch { /* noop */ }
      cleanup();
      return false;
    }
    return true;
  } catch (err) {
    if ((err as Error).name === "AbortError" || mySeq !== ttsSeq) return false;
    pushLog("warn", "تعذّر استخدام TTS الخادم — تحويل لصوت المتصفح", String((err as Error).message ?? err));
    return speakBrowserFallback(text, settings, cb);
  } finally {
    if (currentTtsAbort === controller) currentTtsAbort = null;
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
      {/* Soft outer glow ring */}
      <span
        className="absolute inset-0 rounded-full bg-gradient-to-tr from-sky-400 via-cyan-300 to-emerald-300 opacity-70 blur-[6px]"
      />
      {/* Pulsing halo */}
      <span
        className="absolute inset-0 rounded-full bg-sky-400/40 animate-ping"
        style={{ animationDuration: "2.2s" }}
      />
      {/* Core disc */}
      <span className="relative grid h-full w-full place-items-center rounded-full bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_8px_24px_-8px_rgba(14,165,233,0.7)] ring-1 ring-white/20">
        {/* Waveform bars */}
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none">
          <g className="[&>rect]:origin-center">
            <rect x="3"  y="10" width="2.4" height="4"  rx="1.2" fill="#7dd3fc">
              <animate attributeName="height" values="4;10;4"  dur="1.1s" repeatCount="indefinite" />
              <animate attributeName="y"      values="10;7;10" dur="1.1s" repeatCount="indefinite" />
            </rect>
            <rect x="7"  y="7"  width="2.4" height="10" rx="1.2" fill="#38bdf8">
              <animate attributeName="height" values="10;16;10" dur="0.9s" repeatCount="indefinite" />
              <animate attributeName="y"      values="7;4;7"    dur="0.9s" repeatCount="indefinite" />
            </rect>
            <rect x="11" y="5"  width="2.4" height="14" rx="1.2" fill="#22d3ee">
              <animate attributeName="height" values="14;20;14" dur="1.3s" repeatCount="indefinite" />
              <animate attributeName="y"      values="5;2;5"    dur="1.3s" repeatCount="indefinite" />
            </rect>
            <rect x="15" y="7"  width="2.4" height="10" rx="1.2" fill="#38bdf8">
              <animate attributeName="height" values="10;16;10" dur="1.0s" repeatCount="indefinite" />
              <animate attributeName="y"      values="7;4;7"    dur="1.0s" repeatCount="indefinite" />
            </rect>
            <rect x="19" y="10" width="2.4" height="4"  rx="1.2" fill="#7dd3fc">
              <animate attributeName="height" values="4;10;4"  dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="y"      values="10;7;10" dur="1.2s" repeatCount="indefinite" />
            </rect>
          </g>
        </svg>
      </span>
    </span>
  );
}

export function HamidVoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [checks, setChecks] = useState<DiagCheck[]>([]);
  const [checking, setChecking] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [textInput, setTextInput] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [reply, setReply] = useState<HamidIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [voiceSource, setVoiceSource] = useState<"server" | "browser" | null>(null);
  const [signupMode, setSignupMode] = useState(false);
  const { settings, update, reset } = useHamidVoiceSettings();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  // Guard against rapid duplicate speak() calls (double-clicks, StrictMode,
  // repeated identical intents). Same text within 900ms is dropped silently.
  const lastSpeakRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  // Live reveal of the reply text, synced to audio playback.
  const [revealText, setRevealText] = useState<string>("");
  const [revealDone, setRevealDone] = useState<boolean>(true);
  const revealRafRef = useRef<number | null>(null);
  // Snapshot of the current utterance being revealed and its precomputed word
  // boundaries — end-of-word char indexes so we can snap engine progress to
  // whole-word reveals instead of mid-word chops.
  const revealCtxRef = useRef<{ full: string; wordEnds: number[]; shown: number } | null>(null);
  const stopReveal = () => {
    if (revealRafRef.current != null) {
      cancelAnimationFrame(revealRafRef.current);
      revealRafRef.current = null;
    }
  };
  const computeWordEnds = (s: string): number[] => {
    const ends: number[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) ends.push(m.index + m[0].length);
    if (!ends.length || ends[ends.length - 1] !== s.length) ends.push(s.length);
    return ends;
  };
  /** Reveal up to (and including) the word that covers `charIndex`. */
  const revealUpTo = (charIndex: number) => {
    const ctx = revealCtxRef.current;
    if (!ctx) return;
    let target = ctx.wordEnds[0] ?? ctx.full.length;
    for (const e of ctx.wordEnds) {
      if (e <= charIndex) target = e;
      else { target = e; break; }
    }
    if (target > ctx.shown) {
      ctx.shown = target;
      setRevealText(ctx.full.slice(0, target));
    }
  };
  /** Fallback timer-based reveal when no engine timings are available. */
  const startReveal = (full: string, durationSec?: number) => {
    stopReveal();
    if (!full) return;
    const rate = settingsRef.current.rate || 1;
    const estimated = full.length / (14 * rate);
    const total = Math.max(0.4, (durationSec ?? estimated));
    const t0 = performance.now();
    setRevealDone(false);
    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      const ratio = Math.min(1, elapsed / total);
      revealUpTo(Math.floor(full.length * ratio));
      if (ratio < 1) {
        revealRafRef.current = requestAnimationFrame(tick);
      } else {
        revealRafRef.current = null;
        setRevealText(full);
        setRevealDone(true);
      }
    };
    revealRafRef.current = requestAnimationFrame(tick);
  };
  const finishReveal = (full: string) => {
    stopReveal();
    setRevealText(full);
    setRevealDone(true);
    if (revealCtxRef.current) revealCtxRef.current.shown = full.length;
  };
  useEffect(() => () => stopReveal(), []);

  type SpeakExtras = { syncText?: string };
  const speak = (text: string, extras?: SpeakExtras) => {
    const t = (text ?? "").trim();
    if (!t) return false;
    const now = Date.now();
    const last = lastSpeakRef.current;
    if (t === last.text && now - last.at < 900) {
      pushLog("info", "تم تجاهل طلب نطق مكرر خلال أقل من ثانية");
      return true;
    }
    lastSpeakRef.current = { text: t, at: now };
    const syncFull = extras?.syncText;
    let watchdog: number | null = null;
    // Tracks whether the engine gave us real timings (boundary or timeupdate).
    // If yes, we cancel the RAF fallback so the two don't fight.
    let engineDriven = false;
    if (syncFull) {
      setRevealText("");
      setRevealDone(false);
      revealCtxRef.current = {
        full: syncFull,
        wordEnds: computeWordEnds(syncFull),
        shown: 0,
      };
      // Safety: if the audio pipeline never signals start within 3.5s,
      // reveal the full text so the user is never left with an empty bubble.
      watchdog = window.setTimeout(() => finishReveal(syncFull), 3500);
    }
    const clearWatchdog = () => {
      if (watchdog != null) {
        window.clearTimeout(watchdog);
        watchdog = null;
      }
    };
    void speakSaudi(t, settingsRef.current, {
      onStart: (src, dur) => {
        clearWatchdog();
        setVoiceSource(src);
        setSpeaking(true);
        if (syncFull) startReveal(syncFull, dur);
      },
      onBoundary: (charIndex, wordLength) => {
        if (!syncFull || !revealCtxRef.current) return;
        engineDriven = true;
        stopReveal(); // real timings take over from the RAF estimate
        revealUpTo(charIndex + (wordLength ?? 0));
      },
      onProgress: (ratio) => {
        if (!syncFull || !revealCtxRef.current) return;
        // Only used when no boundary events fire (server audio). Snap to nearest word.
        if (engineDriven) return;
        stopReveal();
        engineDriven = true;
        // fall-through: seed a per-timeupdate reveal
        const ctx = revealCtxRef.current;
        const target = Math.floor(ctx.full.length * Math.min(1, Math.max(0, ratio)));
        revealUpTo(target);
      },
      onEnd: () => {
        clearWatchdog();
        setSpeaking(false);
        setVoiceSource(null);
        if (syncFull) finishReveal(syncFull);
      },
    });
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

  // Subscribe to global voice/log stream
  useEffect(() => {
    const on = (e: LogEntry) => setLogs((prev) => [...prev.slice(-49), e]);
    __logListeners.add(on);
    return () => {
      __logListeners.delete(on);
    };
  }, []);

  const runDiagnostics = useCallback(async () => {
    setChecking(true);
    const results: DiagCheck[] = [];

    // 1. Secure context
    const secure = typeof window !== "undefined" && (window.isSecureContext || location.hostname === "localhost");
    results.push({
      name: "سياق آمن (HTTPS)",
      status: secure ? "ok" : "error",
      detail: secure ? "الصفحة آمنة" : "المتصفح يمنع المايك على HTTP",
      fix: secure ? undefined : "افتح الموقع عبر HTTPS.",
    });

    // 2. SpeechRecognition
    results.push({
      name: "التعرف الصوتي (Web Speech)",
      status: speechSupported ? "ok" : "error",
      detail: speechSupported ? "مدعوم" : "غير متاح في هذا المتصفح",
      fix: speechSupported ? undefined : "استعمل Chrome أو Edge على سطح المكتب.",
    });

    // 3. SpeechSynthesis
    results.push({
      name: "نطق المتصفح (SpeechSynthesis)",
      status: synthesisSupported ? "ok" : "warn",
      detail: synthesisSupported ? "مدعوم" : "غير متاح",
      fix: synthesisSupported ? undefined : "سيُعتمد على صوت الخادم فقط.",
    });

    // 4. Arabic voice availability
    if (synthesisSupported) {
      const voices = window.speechSynthesis.getVoices();
      const arVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith("ar"));
      results.push({
        name: "صوت عربي مثبت",
        status: arVoices.length ? "ok" : "warn",
        detail: arVoices.length ? `${arVoices.length} صوت عربي: ${arVoices.slice(0, 3).map((v) => v.name).join("، ")}` : "لا يوجد صوت عربي",
        fix: arVoices.length ? undefined : "سنستخدم صوت الخادم Lovable AI تلقائياً كحل بديل.",
      });
    }

    // 5. Mic permission
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        results.push({ name: "إذن المايكروفون", status: "ok", detail: "ممنوح" });
      } catch (e) {
        results.push({
          name: "إذن المايكروفون",
          status: "error",
          detail: `مرفوض: ${(e as Error).name}`,
          fix: "افتح قفل العنوان في المتصفح → أذونات الموقع → فعّل المايكروفون.",
        });
      }
    }

    // 6. TTS endpoint
    try {
      const res = await fetch("/api/hamid-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "اختبار", voice: settingsRef.current.serverVoice, speed: 1 }),
      });
      if (res.ok) {
        const blob = await res.blob();
        results.push({
          name: "خادم النطق (Lovable AI TTS)",
          status: blob.size > 0 ? "ok" : "warn",
          detail: blob.size > 0 ? `يعمل — استُلم ${Math.round(blob.size / 1024)}KB` : "استجابة فارغة",
        });
      } else {
        results.push({
          name: "خادم النطق (Lovable AI TTS)",
          status: "error",
          detail: `HTTP ${res.status}`,
          fix: "سيتم التبديل تلقائياً لصوت المتصفح.",
        });
      }
    } catch (e) {
      results.push({
        name: "خادم النطق (Lovable AI TTS)",
        status: "error",
        detail: `فشل الشبكة: ${(e as Error).message}`,
        fix: "سيتم التبديل تلقائياً لصوت المتصفح.",
      });
    }

    setChecks(results);
    setChecking(false);
    pushLog("info", `اكتمل التشخيص — ${results.filter((r) => r.status === "ok").length}/${results.length} نجاح`);
  }, [speechSupported, synthesisSupported]);

  const callAgent = useServerFn(askHamidAgent);

  const answer = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;
    // Intercept signup intent: switch to voice signup wizard flow
    if (SIGNUP_INTENT.test(clean)) {
      setTranscript(clean);
      setReply(null);
      setSignupMode(true);
      speak("أبشر، بنسجّل طلبك ويوصل للأدمن للموافقة. نبدأ بالاسم الكامل.");
      return;
    }
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
      const spoken = speak(next.text, { syncText: next.text });
      if (!spoken) setError("الصوت المحلي غير مدعوم في هذا المتصفح.");
    } catch (err) {
      const fallback = getLocalIntent(clean, history);
      setReply(fallback);
      speak(fallback.text, { syncText: fallback.text });
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
    r.onerror = (e) => {
      setListening(false);
      const code = e?.error ?? "unknown";
      const map: Record<string, { msg: string; hint: string }> = {
        "no-speech": { msg: "لم يُلتقط أي صوت", hint: "قرّب المايك وتحدّث بعد الضغط مباشرة." },
        "audio-capture": { msg: "لا يوجد مايكروفون متاح", hint: "تأكد من توصيل المايك واختياره في إعدادات النظام." },
        "not-allowed": { msg: "إذن المايكروفون مرفوض", hint: "افتح إعدادات الموقع في المتصفح وفعّل الوصول للمايك." },
        "service-not-allowed": { msg: "خدمة التعرف الصوتي محظورة", hint: "استخدم HTTPS وChrome/Edge حديث." },
        "network": { msg: "فشل الاتصال بخدمة التعرف الصوتي", hint: "تحقّق من الإنترنت وأعد المحاولة." },
        "aborted": { msg: "أُلغيت جلسة التعرف", hint: "" },
        "language-not-supported": { msg: "اللغة العربية غير مدعومة هنا", hint: "استخدم Chrome على سطح المكتب." },
      };
      const info = map[code] ?? { msg: `خطأ التعرف الصوتي: ${code}`, hint: "" };
      pushLog("error", info.msg, info.hint);
      setError(info.msg + (info.hint ? ` — ${info.hint}` : ""));
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
            onClick={() => {
              setSignupMode(true);
              speak("أبشر، بنسجّل طلبك ويوصل للأدمن للموافقة. نبدأ بالاسم الكامل.");
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
              signupMode
                ? "bg-sky-500 text-white"
                : "bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-300",
            )}
            aria-label="طلب تسجيل"
            aria-pressed={signupMode}
          >
            <UserPlus className="h-3 w-3" />
            <span>طلب تسجيل</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDiagOpen((v) => !v);
              if (!diagOpen && !checks.length) void runDiagnostics();
            }}
            className={cn(
              "relative rounded-full p-2 transition",
              diagOpen
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
            )}
            aria-label="تشخيص الصوت"
            aria-pressed={diagOpen}
          >
            <Activity className="h-3.5 w-3.5" />
            {logs.some((l) => l.level === "error") && (
              <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
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
              min={1.0}
              max={1.5}
              step={0.05}
              value={settings.rate}
              onChange={(e) => update({ rate: Number(e.target.value) })}
              className="w-full accent-sky-500"
              aria-label="معدل سرعة الصوت"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[1.0, 1.15, 1.25, 1.4, 1.5].map((r) => {
                const active = Math.abs(settings.rate - r) < 0.03;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => update({ rate: r })}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition tabular-nums",
                      active
                        ? "bg-sky-500 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
                    )}
                    aria-pressed={active}
                  >
                    {r.toFixed(2)}×
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
              يُحفظ الإعداد تلقائياً على هذا المتصفح.
            </p>
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

      {diagOpen && (
        <div className="mx-4 mb-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-slate-900 dark:text-white">تشخيص الصوت</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLogs([])}
                className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300"
              >
                مسح السجل
              </button>
              <button
                type="button"
                onClick={() => void runDiagnostics()}
                disabled={checking}
                className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                إعادة الفحص
              </button>
            </div>
          </div>

          {checks.length > 0 && (
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.name} className="rounded-lg bg-white p-2 dark:bg-slate-900">
                  <div className="flex items-start gap-2">
                    {c.status === "ok" ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : c.status === "warn" ? (
                      <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-slate-800 dark:text-slate-100">{c.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.detail}</div>
                      {c.fix && (
                        <div className="mt-1 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          💡 {c.fix}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              سجل الأحداث ({logs.length})
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg bg-white p-2 font-mono text-[10px] leading-relaxed dark:bg-slate-900">
              {logs.length === 0 ? (
                <div className="text-slate-400">لا توجد أحداث بعد. جرّب مكالمة أو معاينة صوت.</div>
              ) : (
                logs
                  .slice()
                  .reverse()
                  .map((l) => (
                    <div
                      key={l.id}
                      className={cn(
                        "border-b border-slate-100 py-1 last:border-b-0 dark:border-slate-800",
                        l.level === "error" && "text-red-600 dark:text-red-400",
                        l.level === "warn" && "text-amber-600 dark:text-amber-400",
                        l.level === "ok" && "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      <span className="text-slate-400">
                        {new Date(l.ts).toLocaleTimeString("ar-SA", { hour12: false })}
                      </span>{" "}
                      {l.msg}
                      {l.hint && <div className="ps-4 text-slate-500 dark:text-slate-400">↳ {l.hint}</div>}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}




      {signupMode && (
        <HamidSignupWizard
          speak={(t) => {
            void speak(t);
          }}
          onClose={() => setSignupMode(false)}
        />
      )}

      {/* 3D Command Core */}
      <div className="flex flex-col items-center gap-4 px-5 pb-4 pt-2">
        <button
          type="button"
          onClick={callActive ? endCall : startCall}
          className="group relative outline-none"
          aria-label={callActive ? "إنهاء المكالمة" : "بدء مكالمة مع حامد"}
        >
          <Suspense
            fallback={<VoiceOrb size={200} active={callActive} speaking={speaking || listening} />}
          >
            <HamidCore3D
              size={220}
              active={callActive || signupMode}
              listening={listening}
              speaking={speaking}
            />
          </Suspense>
        </button>


        {/* Live voice status pill: state + source */}
        {(() => {
          const state: "listening" | "speaking" | "idle" = listening
            ? "listening"
            : speaking
              ? "speaking"
              : "idle";
          const stateLabel =
            state === "listening" ? "يستمع" : state === "speaking" ? "يتحدث" : "متوقف";
          const stateColor =
            state === "listening"
              ? "bg-emerald-500"
              : state === "speaking"
                ? "bg-sky-500"
                : "bg-slate-400";
          const sourceLabel = speaking
            ? voiceSource === "server"
              ? "صوت الخادم (Lovable AI)"
              : voiceSource === "browser"
                ? "صوت المتصفح (Web Speech)"
                : "جاري التحضير…"
            : null;
          return (
            <div
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
              role="status"
              aria-live="polite"
            >
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  stateColor,
                  state !== "idle" && "animate-pulse",
                )}
              />
              <span>{stateLabel}</span>
              {sourceLabel && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      voiceSource === "server"
                        ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                        : voiceSource === "browser"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-slate-500/15 text-slate-600 dark:text-slate-300",
                    )}
                  >
                    {sourceLabel}
                  </span>
                </>
              )}
            </div>
          );
        })()}

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
              <span className="font-semibold text-slate-900 dark:text-white">حامد:</span>{" "}
              <span>{revealDone ? reply.text : revealText}</span>
              {!revealDone && (
                <span
                  className="ms-0.5 inline-block h-3 w-[2px] translate-y-[2px] bg-sky-500 align-middle animate-pulse"
                  aria-hidden
                />
              )}
            </div>
            {reply.actionLabel && reply.actionPath && revealDone && (
              <button
                type="button"
                onClick={() => goTo(reply.actionPath!)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-900 animate-fade-in"
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
