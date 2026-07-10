import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  audio_base64: z.string().min(1).max(20_000_000), // ~15 MB base64
  mime: z.string().min(3).max(120),
  language: z.string().min(2).max(8).optional(),
});

const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/mp4": "mp4",
  "audio/mp4;codecs=mp4a.40.2": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "audio/aac": "aac",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
};

function extFor(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  return EXT_BY_MIME[base] ?? EXT_BY_MIME[mime.toLowerCase()] ?? "webm";
}

export const transcribeVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Decode base64 → bytes
    const binary = atob(data.audio_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length < 512) {
      throw new Error("التسجيل قصير جدًا، حاول مجددًا");
    }

    const ext = extFor(data.mime);
    const file = new File([bytes], `recording.${ext}`, { type: data.mime });

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", file);
    if (data.language) form.append("language", data.language);

    const res = await fetch(
      "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 402) {
        throw new Error("رصيد الذكاء الاصطناعي غير كافٍ");
      }
      if (res.status === 429) {
        throw new Error("عدد كبير من الطلبات، حاول لاحقًا");
      }
      throw new Error(`Transcription failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? "").trim() };
  });
