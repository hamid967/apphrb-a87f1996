import { useEffect, useRef, useState, forwardRef, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Check, Globe, Loader2, Mic, MicOff, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type LangChoice = "auto" | "ar" | "en";

const LANG_LABEL: Record<LangChoice, string> = {
  auto: "كشف تلقائي",
  ar: "العربية",
  en: "English",
};

const LANG_SHORT: Record<LangChoice, string> = {
  auto: "AUTO",
  ar: "AR",
  en: "EN",
};

type VoiceTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (v: string) => void;
  /** Default recognition language. "auto" lets the model detect it. */
  language?: LangChoice;
  /** Append transcript separator. Default: single space. */
  separator?: string;
};

type Phase = "idle" | "starting" | "recording" | "paused" | "transcribing" | "done" | "error";

const PHASE_STYLES: Record<Phase, string> = {
  idle: "",
  starting: "bg-primary/10 text-primary border-primary/30",
  recording: "bg-destructive/10 text-destructive border-destructive/30",
  paused: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  transcribing: "bg-primary/10 text-primary border-primary/30",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  error: "bg-destructive/10 text-destructive border-destructive/30",
};

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  starting: "جارٍ بدء التسجيل…",
  recording: "جارٍ التسجيل",
  paused: "التسجيل متوقف مؤقتًا",
  transcribing: "جارٍ تحويل الصوت إلى نص…",
  done: "تم التحويل — راجع النص",
  error: "تعذّر تسجيل الصوت",
};

/**
 * Textarea with an inline push-to-talk voice-input button and a review step.
 * The transcribed text is shown in a small editable panel; the user must
 * confirm before it is appended to the field.
 */
export const VoiceTextarea = forwardRef<HTMLTextAreaElement, VoiceTextareaProps>(
  function VoiceTextarea(
    { value, onChange, language = "ar", separator = " ", className, disabled, ...rest },
    ref,
  ) {
    const [pending, setPending] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>("idle");
    const [elapsed, setElapsed] = useState(0);
    const [lang, setLang] = useState<LangChoice>(language);

    const voice = useVoiceInput({
      language: lang === "auto" ? undefined : lang,
      onError: (msg) => {
        toast.error(msg);
        setPhase("error");
        // No auto-clear — the user dismisses via retry or by starting a new
        // recording. The pending transcript (if any) is intentionally kept.
      },
    });

    const retry = async () => {
      setPhase("starting");
      try {
        await voice.start();
        setPhase("recording");
      } catch {
        setPhase("error");
      }
    };

    // Elapsed-seconds timer that pauses when phase is "paused".
    const accumulatedRef = useRef(0);
    const segmentStartRef = useRef<number | null>(null);
    useEffect(() => {
      if (phase === "starting") {
        accumulatedRef.current = 0;
        segmentStartRef.current = null;
        setElapsed(0);
        return;
      }
      if (phase === "recording") {
        segmentStartRef.current = Date.now();
        const id = window.setInterval(() => {
          const start = segmentStartRef.current;
          if (start != null) {
            setElapsed(
              Math.floor((accumulatedRef.current + (Date.now() - start)) / 1000),
            );
          }
        }, 250);
        return () => window.clearInterval(id);
      }
      if (phase === "paused") {
        const start = segmentStartRef.current;
        if (start != null) {
          accumulatedRef.current += Date.now() - start;
          segmentStartRef.current = null;
          setElapsed(Math.floor(accumulatedRef.current / 1000));
        }
        return;
      }
      // idle / done / error / transcribing → reset baseline
      if (phase === "idle" || phase === "done" || phase === "error") {
        accumulatedRef.current = 0;
        segmentStartRef.current = null;
      }
    }, [phase]);

    const handleMic = async () => {
      if (voice.state === "recording" || voice.state === "paused") {
        try {
          setPhase("transcribing");
          const heard = (await voice.stop()).trim();
          if (heard) {
            setPending(heard);
            setPhase("done");
            window.setTimeout(
              () => setPhase((p) => (p === "done" ? "idle" : p)),
              1400,
            );
          } else {
            setPhase("idle");
          }
        } catch {
          /* toast surfaced via onError; phase set to error there */
        }
        return;
      }
      if (voice.state === "idle") {
        setPending(null);
        setPhase("starting");
        try {
          await voice.start();
          setPhase("recording");
        } catch {
          setPhase("error");
        }
      }
    };

    const togglePause = () => {
      if (phase === "recording") {
        voice.pause();
        setPhase("paused");
      } else if (phase === "paused") {
        voice.resume();
        setPhase("recording");
      }
    };

    const confirm = () => {
      const heard = (pending ?? "").trim();
      if (heard) {
        const base = value.trim();
        onChange(base ? `${base}${separator}${heard}` : heard);
      }
      setPending(null);
      setPhase("idle");
    };

    const discard = () => {
      setPending(null);
      setPhase("idle");
    };

    const showBadge = phase !== "idle";
    const isBusy = phase === "starting" || phase === "transcribing";

    return (
      <div className="space-y-2">
        <div className="relative">
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn("pe-24", className)}
            {...rest}
          />

          <div className="absolute end-2 bottom-2 flex items-center gap-1">
            {/* Language selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || phase === "recording" || phase === "transcribing"}
                  className="h-8 gap-1 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                  aria-label={`لغة التفريغ: ${LANG_LABEL[lang]}`}
                  title={`لغة التفريغ: ${LANG_LABEL[lang]}`}
                >
                  <Globe className="size-3.5" />
                  <span className="tabular-nums">{LANG_SHORT[lang]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuLabel className="text-xs">لغة التفريغ</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={lang}
                  onValueChange={(v) => setLang(v as LangChoice)}
                >
                  <DropdownMenuRadioItem value="auto" className="text-xs">
                    {LANG_LABEL.auto}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="ar" className="text-xs">
                    {LANG_LABEL.ar}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="en" className="text-xs">
                    {LANG_LABEL.en}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {voice.supported ? (
              <motion.div
                initial={false}
                animate={
                  phase === "recording"
                    ? { scale: [1, 1.06, 1] }
                    : { scale: 1 }
                }
                transition={
                  phase === "recording"
                    ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.2 }
                }
              >
                <Button
                  type="button"
                  size="icon"
                  variant={phase === "recording" ? "destructive" : "outline"}
                  onClick={handleMic}
                  disabled={disabled || isBusy}
                  aria-label={PHASE_LABEL[phase] || "إدخال صوتي"}
                  title={PHASE_LABEL[phase] || "إدخال صوتي"}
                  className={cn(
                    "h-8 w-8 relative overflow-hidden",
                    phase === "recording" &&
                      "shadow-[0_0_0_0_hsl(var(--destructive)/0.5)] animate-[pulse_1.4s_ease-in-out_infinite]",
                  )}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={phase}
                      initial={{ opacity: 0, scale: 0.6, rotate: -15 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.6, rotate: 15 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="flex items-center justify-center"
                    >
                      {phase === "transcribing" || phase === "starting" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : phase === "done" ? (
                        <Check className="size-4" />
                      ) : phase === "error" ? (
                        <AlertCircle className="size-4" />
                      ) : phase === "recording" ? (
                        <Square className="size-4" />
                      ) : (
                        <Mic className="size-4" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </Button>
              </motion.div>
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center text-muted-foreground"
                title="الإدخال الصوتي غير مدعوم على هذا المتصفح"
              >
                <MicOff className="size-4" />
              </div>
            )}
          </div>
        </div>

        {/* Status pill: subtle, animated, single source of truth for phase */}
        <AnimatePresence initial={false}>
          {showBadge && (
            <motion.div
              key="status"
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                PHASE_STYLES[phase],
              )}
              role="status"
              aria-live="polite"
            >
              {phase === "recording" && (
                <motion.span
                  className="inline-block size-1.5 rounded-full bg-destructive"
                  animate={{ opacity: [1, 0.3, 1], scale: [1, 0.85, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              {(phase === "starting" || phase === "transcribing") && (
                <Loader2 className="size-3 animate-spin" />
              )}
              {phase === "done" && <Check className="size-3" />}
              {phase === "error" && <AlertCircle className="size-3" />}
              <span>{PHASE_LABEL[phase]}</span>
              {phase === "recording" && (
                <span className="font-mono tabular-nums opacity-80">
                  {formatElapsed(elapsed)}
                </span>
              )}
              {phase === "error" && (
                <>
                  <button
                    type="button"
                    onClick={retry}
                    disabled={disabled}
                    className="ms-1 inline-flex items-center gap-1 rounded-full border border-current/40 px-2 py-0.5 text-[10px] font-semibold hover:bg-current/10 disabled:opacity-50"
                  >
                    <RotateCcw className="size-3" />
                    إعادة المحاولة
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhase("idle")}
                    className="rounded-full p-0.5 opacity-70 hover:opacity-100"
                    aria-label="إغلاق"
                  >
                    <X className="size-3" />
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording waveform bar */}
        <AnimatePresence initial={false}>
          {phase === "recording" && (
            <motion.div
              key="wave"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 14 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-end justify-center gap-[3px] overflow-hidden"
              aria-hidden
            >
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <motion.span
                  key={i}
                  className="w-[3px] rounded-full bg-destructive/70"
                  animate={{
                    height: ["30%", "100%", "50%", "85%", "40%"],
                  }}
                  transition={{
                    duration: 0.9 + (i % 3) * 0.15,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.06,
                  }}
                  style={{ height: "40%" }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcribing progress bar (indeterminate) */}
        <AnimatePresence initial={false}>
          {phase === "transcribing" && (
            <motion.div
              key="progress"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 3 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="relative overflow-hidden rounded-full bg-primary/10"
            >
              <motion.span
                className="absolute inset-y-0 w-1/3 rounded-full bg-primary/70"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Review panel */}
        <AnimatePresence initial={false}>
          {pending !== null && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="rounded-md border border-primary/30 bg-primary/5 p-2"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium text-primary">راجع النص قبل الإضافة</span>
                <span className="text-[10px] text-muted-foreground">عدّل ثم اضغط «إضافة»</span>
              </div>
              <Textarea
                value={pending}
                onChange={(e) => setPending(e.target.value)}
                rows={3}
                autoFocus
                className="resize-none text-sm"
                dir="auto"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={discard}>
                  تجاهل
                </Button>
                <Button type="button" size="sm" onClick={confirm} disabled={!pending.trim()}>
                  إضافة إلى النص
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(1, "0")}:${r.toString().padStart(2, "0")}`;
}
