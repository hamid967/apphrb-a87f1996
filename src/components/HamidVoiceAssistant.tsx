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

type VoiceResponse = {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  error?: string;
};

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function HamidVoiceAssistant() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const Recognition = useMemo(getSpeechRecognition, []);
  const speechSupported = Boolean(Recognition);

  const speak = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || loading) return;

    setLoading(true);
    setError(null);
    setReply("");
    try {
      const response = await fetch("/api/public/hamid-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: cleanText }),
      });
      const data = (await response.json()) as VoiceResponse;
      if (!response.ok || data.error) throw new Error(data.error || "Voice request failed");
      setReply(data.text || "");

      if (data.audioBase64 && data.mimeType) {
        audioRef.current?.pause();
        audioRef.current = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`);
        await audioRef.current.play();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تشغيل المساعد الصوتي";
      setError(message);
    } finally {
      setLoading(false);
    }
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
      void speak(text);
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
        حامد صوتي
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
      aria-label="مساعد حامد الصوتي"
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${HBS.border}` }}>
        <div>
          <h2 className="text-sm font-semibold">حامد الصوتي</h2>
          <p className="text-[11px]" style={{ color: HBS.gray }}>
            عربي سعودي · مدعوم من ElevenLabs
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            stopListening();
            audioRef.current?.pause();
            setOpen(false);
          }}
          className="rounded-md p-1 transition hover:bg-white/10"
          style={{ color: HBS.gray }}
          aria-label="إغلاق المساعد الصوتي"
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
