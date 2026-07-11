import { createFileRoute } from "@tanstack/react-router";

const TTS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 12,
};

type RateBucket = { count: number; resetAt: number };
const ttsBuckets = new Map<string, RateBucket>();

function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip");
  return ip || "anonymous";
}

function checkRateLimit(request: Request) {
  const now = Date.now();
  const key = getClientKey(request);
  const current = ttsBuckets.get(key);
  if (!current || current.resetAt <= now) {
    ttsBuckets.set(key, { count: 1, resetAt: now + TTS_RATE_LIMIT.windowMs });
    return { ok: true, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count > TTS_RATE_LIMIT.maxRequests) {
    return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

function pruneRateBuckets() {
  const now = Date.now();
  for (const [key, bucket] of ttsBuckets) {
    if (bucket.resetAt <= now) ttsBuckets.delete(key);
  }
}

export const Route = createFileRoute("/api/hamid-tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        pruneRateBuckets();
        const rate = checkRateLimit(request);
        if (!rate.ok) {
          return new Response("Too many TTS requests", {
            status: 429,
            headers: { "Retry-After": String(rate.retryAfter) },
          });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let body: { text?: string; voice?: string; speed?: number };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const text = (body.text ?? "").trim();
        if (!text) return new Response("Missing text", { status: 400 });
        if (text.length > 3000) return new Response("Text too long", { status: 400 });

        const allowedVoices = new Set([
          "onyx", "verse", "ash", "ballad", "sage", "alloy", "echo",
          "fable", "nova", "shimmer", "coral",
        ]);
        const voice = body.voice && allowedVoices.has(body.voice) ? body.voice : "onyx";
        const speed = typeof body.speed === "number"
          ? Math.min(1.3, Math.max(0.7, body.speed))
          : 0.95;

        const instructions = [
          "Speak in natural Saudi Arabic (Najdi dialect), calm, warm, and confident.",
          "Medium pitch, unhurried pace with clear articulation of Arabic letters: ق (qaaf), ح, ع, ص, ض, ط, ظ, غ, خ, ذ.",
          "Pronounce ج as a soft Gulf 'j', not Egyptian 'g'. Never use Egyptian or Levantine dialect.",
          "Emphasize sentence endings gently, add short natural pauses at commas and periods, and read numbers in Arabic.",
          "Keep the tone friendly and service-oriented, like a Saudi customer-support agent.",
        ].join(" ");

        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text,
              voice,
              instructions,
              speed,
              response_format: "mp3",
            }),
            signal: request.signal,
          });
          if (!upstream.ok) {
            const msg = await upstream.text().catch(() => "");
            return new Response(msg || "TTS failed", { status: upstream.status });
          }
          return new Response(upstream.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          const msg = err instanceof Error ? err.message : "TTS error";
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
