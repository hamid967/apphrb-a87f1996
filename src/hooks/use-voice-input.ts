import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { transcribeVoice } from "@/lib/voice-transcribe.functions";

type State = "idle" | "recording" | "transcribing";

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Push-to-talk voice input helper.
 * - `start()` requests mic and begins recording.
 * - `stop()` uploads the recording to the transcription server fn and resolves with the text.
 */
export function useVoiceInput({
  language = "ar",
  onError,
}: {
  language?: string;
  onError?: (msg: string) => void;
} = {}) {
  const transcribe = useServerFn(transcribeVoice);
  const [state, setState] = useState<State>("idle");
  const [supported, setSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const stopResolveRef = useRef<((text: string) => void) | null>(null);
  const stopRejectRef = useRef<((err: Error) => void) | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setSupported(false);
    }
  }, []);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle" || !supported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mime = pickMimeType();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mimeRef.current = rec.mimeType || mime || "audio/webm";
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onerror = () => {
        stopRejectRef.current?.(new Error("recorder_error"));
        stopRejectRef.current = null;
        stopResolveRef.current = null;
      };
      rec.onstop = async () => {
        const chunks = chunksRef.current;
        const mimeType = mimeRef.current;
        cleanup();
        try {
          if (chunks.length === 0) throw new Error("empty_recording");
          const blob = new Blob(chunks, { type: mimeType });
          if (blob.size < 1024) throw new Error("empty_recording");
          setState("transcribing");
          const b64 = await blobToBase64(blob);
          const res = await transcribe({
            data: { audio_base64: b64, mime: mimeType, language },
          });
          setState("idle");
          stopResolveRef.current?.(res.text ?? "");
        } catch (err) {
          setState("idle");
          const msg =
            err instanceof Error && err.message === "empty_recording"
              ? "التسجيل قصير جدًا، حاول مجددًا"
              : err instanceof Error
                ? err.message
                : "تعذّر تحويل الصوت إلى نص";
          onError?.(msg);
          stopRejectRef.current?.(new Error(msg));
        } finally {
          stopResolveRef.current = null;
          stopRejectRef.current = null;
        }
      };
      recorderRef.current = rec;
      rec.start();
      setState("recording");
    } catch (err) {
      cleanup();
      setState("idle");
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "تم رفض إذن الميكروفون"
          : "تعذّر الوصول إلى الميكروفون";
      onError?.(msg);
    }
  }, [state, supported, cleanup, transcribe, language, onError]);

  const stop = useCallback(() => {
    return new Promise<string>((resolve, reject) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        resolve("");
        return;
      }
      stopResolveRef.current = resolve;
      stopRejectRef.current = reject;
      try {
        rec.stop();
      } catch (err) {
        cleanup();
        setState("idle");
        reject(err instanceof Error ? err : new Error("stop_failed"));
      }
    });
  }, [cleanup]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    stopResolveRef.current = null;
    stopRejectRef.current = null;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    cleanup();
    setState("idle");
  }, [cleanup]);

  useEffect(() => () => cancel(), [cancel]);

  return { state, supported, start, stop, cancel };
}
