import { useState, forwardRef, type TextareaHTMLAttributes } from "react";
import { Loader2, Mic, MicOff, Square } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type VoiceTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (v: string) => void;
  language?: string;
  /** Append transcript separator. Default: single space. */
  separator?: string;
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
    const voice = useVoiceInput({
      language,
      onError: (msg) => toast.error(msg),
    });

    const handleMic = async () => {
      if (voice.state === "recording") {
        try {
          const heard = (await voice.stop()).trim();
          if (heard) setPending(heard);
        } catch {
          /* toast surfaced via onError */
        }
        return;
      }
      if (voice.state === "idle") {
        setPending(null);
        await voice.start();
      }
    };

    const confirm = () => {
      const heard = (pending ?? "").trim();
      if (heard) {
        const base = value.trim();
        onChange(base ? `${base}${separator}${heard}` : heard);
      }
      setPending(null);
    };

    const discard = () => setPending(null);

    return (
      <div className="space-y-2">
        <div className="relative">
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn("pe-12", className)}
            {...rest}
          />
          {voice.supported ? (
            <Button
              type="button"
              size="icon"
              variant={voice.state === "recording" ? "destructive" : "outline"}
              onClick={handleMic}
              disabled={disabled || voice.state === "transcribing"}
              aria-label={
                voice.state === "recording"
                  ? "إيقاف التسجيل"
                  : voice.state === "transcribing"
                    ? "جارٍ التحويل"
                    : "إدخال صوتي"
              }
              title={
                voice.state === "recording"
                  ? "إيقاف التسجيل"
                  : voice.state === "transcribing"
                    ? "جارٍ التحويل"
                    : "إدخال صوتي"
              }
              className={cn(
                "absolute end-2 bottom-2 h-8 w-8",
                voice.state === "recording" && "animate-pulse",
              )}
            >
              {voice.state === "transcribing" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : voice.state === "recording" ? (
                <Square className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
          ) : (
            <div
              className="absolute end-2 bottom-2 flex h-8 w-8 items-center justify-center text-muted-foreground"
              title="الإدخال الصوتي غير مدعوم على هذا المتصفح"
            >
              <MicOff className="size-4" />
            </div>
          )}
        </div>
        {voice.state === "recording" && (
          <p className="text-[11px] text-destructive">● جارٍ التسجيل… اضغط الزر لإيقافه.</p>
        )}
        {voice.state === "transcribing" && (
          <p className="text-[11px] text-muted-foreground">جارٍ تحويل الصوت إلى نص…</p>
        )}
        {pending !== null && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
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
          </div>
        )}
      </div>
    );
  },
);
