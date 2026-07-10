import { useMemo, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Volume2, X } from "lucide-react";
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

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechSynthesisWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function getLocalReply(text: string) {
  const input = text.trim().toLowerCase();

  if (/تسجيل|حساب|اشترك|ابدأ|signup|register|account/.test(input)) {
    return "حياك الله، أبشر. تقدر تبدأ من صفحة إنشاء الحساب، وبعدها تكمل الملف الشخصي، ثم بيانات المنشأة ومساحة العمل. إذا احتجت مساعدة، اسألني عن خطوة التسجيل.";
  }

  if (/تحصيل|متأخر|دفعات|ايجار|إيجار|arrears|collection|payment/.test(input)) {
    return "خلّني أوضح لك خطة التحصيل: نحدد الدفعات المتأخرة، نقسمها حسب عمر التأخير، نرسل تذكير، ثم نسجل المتابعة والوعد بالسداد داخل النظام.";
  }

  if (/صيانة|بلاغ|تذكرة|maintenance|ticket/.test(input)) {
    return "في الصيانة نبدأ بتسجيل البلاغ، تحديد العقار والوحدة، رفع الصور إن وجدت، تحديد الأولوية، ثم متابعة المورد حتى الإغلاق وتوثيق التكلفة.";
  }

  if (/عقد|عقود|تجديد|انتهاء|contract|lease|renew/.test(input)) {
    return "بالنسبة للعقود، الأفضل متابعة العقود التي تنتهي خلال ثلاثين أو ستين يوم، تجهيز شروط التجديد، وإرسال تنبيه مبكر للمستأجر والمالك.";
  }

  if (/شاغر|شاغرة|اشغال|إشغال|vacant|vacancy|occupancy/.test(input)) {
    return "للوحدات الشاغرة، راجع مدة الشغور، السعر مقارنة بالسوق، جودة الإعلان، والصور. بعدها حدد إجراء واضح: تعديل السعر، تحسين الإعلان، أو تكليف وسيط.";
  }

  if (/تقرير|تقارير|ملخص|لوحة|dashboard|report/.test(input)) {
    return "الملخص الصباحي المفيد يشمل التحصيل، المتأخرات، الوحدات الشاغرة، العقود القريبة من الانتهاء، بلاغات الصيانة، وأهم توصية تنفيذية اليوم.";
  }

  if (/سعر|تسعير|price|pricing/.test(input)) {
    return "للتسعير، قارن الوحدة بمثيلاتها في نفس المدينة والحي، ثم راجع الإشغال والطلب ومدة الشغور. الهدف سعر عادل يقلل الشغور ويحافظ على العائد.";
  }

  return "حياك الله، أنا حامد مساعد HBSpro المحلي. أقدر أساعدك في التسجيل، التحصيل، العقود، الصيانة، الوحدات الشاغرة، والتقارير. اسألني عن أي نقطة منها.";
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

export function HamidVoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
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
    const nextReply = getLocalReply(cleanText);
    setReply(nextReply);

    await new Promise((resolve) => window.setTimeout(resolve, 250));
    const spoken = speakLocally(nextReply);
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
        حامد محلي
      </button>
    );
  }

  return (
    <section
      className="fixed bottom-5 start-5 z-40 w-[340px] max-w-[92vw] overflow-hidden rounded-2xl backdrop-blur-2xl"
      style={{
        background: "linear-gradient(160deg, rgba(11,27,44,0.94), rgba(7,19,32,0.98))",
        border: `1px solid ${HBS.border}`,
        boxShadow: `0 35px 90px -30px ${HBS.blue}`,
        color: HBS.white,
      }}
      aria-label="مساعد حامد المحلي"
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${HBS.border}` }}>
        <div>
          <h2 className="text-sm font-semibold">حامد المحلي</h2>
          <p className="text-[11px]" style={{ color: HBS.gray }}>
            عربي سعودي · بدون مفاتيح أو خدمات خارجية
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
          {loading ? "حامد يجهز الرد…" : listening ? "إيقاف الاستماع" : "تحدث الآن"}
        </button>

        {transcript && (
          <div className="rounded-xl bg-white/5 p-3 text-xs" style={{ border: `1px solid ${HBS.border}` }}>
            <span style={{ color: HBS.goldSoft }}>سمعتك:</span> {transcript}
          </div>
        )}
        {reply && (
          <div className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed" style={{ border: `1px solid ${HBS.border}` }}>
            <span style={{ color: HBS.goldSoft }}>حامد:</span> {reply}
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
