import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const MAX_INPUT_CHARS = 900;

const SYSTEM = `
You are Hamid (حامد), the Saudi Arabic voice assistant for HBSpro.
Speak mainly in Saudi Arabic, warmly and professionally, with short practical answers.
HBSpro is a Saudi real-estate operating platform for property portfolios, owners, property managers, brokers, leases, rent collection, arrears, maintenance, accounting, reports, and AI recommendations.
If the visitor wants to register, guide them to /auth and explain that onboarding continues through profile, company, and workspace setup.
Never ask for passwords, OTPs, API keys, payment cards, or private tenant data.
Keep voice replies under 70 Arabic words unless the user asks for detail.
`.trim();

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, MAX_INPUT_CHARS) : "";
}

function toBase64(bytes: ArrayBuffer) {
  let binary = "";
  const chunkSize = 0x8000;
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += chunkSize) {
    binary += String.fromCharCode(...view.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function synthesizeSpeech(text: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Missing ELEVENLABS_API_KEY");

  const voiceId = process.env.ELEVENLABS_HAMID_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.48,
        similarity_boost: 0.82,
        style: 0.28,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${response.status} ${details}`);
  }

  return {
    mimeType: response.headers.get("content-type") || "audio/mpeg",
    audioBase64: toBase64(await response.arrayBuffer()),
  };
}

export const Route = createFileRoute("/api/public/hamid-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { text?: unknown };
          const userText = normalizeText(body.text);
          if (!userText) return Response.json({ error: "Missing text" }, { status: 400 });

          const lovableKey = process.env.LOVABLE_API_KEY;
          if (!lovableKey) return Response.json({ error: "Missing LOVABLE_API_KEY" }, { status: 500 });

          const gateway = createLovableAiGatewayProvider(lovableKey);
          const result = await generateText({
            model: gateway("google/gemini-3-flash-preview"),
            system: SYSTEM,
            prompt: userText,
          });

          const reply = result.text.trim() || "أهلاً، أنا حامد. كيف أقدر أخدمك في HBSpro؟";
          const speech = await synthesizeSpeech(reply);
          return Response.json({ text: reply, ...speech });
        } catch (error) {
          console.error("[hamid-voice] error", error);
          return Response.json({ error: "Voice assistant error" }, { status: 500 });
        }
      },
    },
  },
});
