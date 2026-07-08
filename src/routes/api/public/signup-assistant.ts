import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// Canonical registration journey. Keep in ONE place so all languages match.
const STEPS = `
Registration journey (5 steps). Always link to the exact route in Markdown:
1. Create account → [/auth](/auth) (email+password, Google, or demo).
2. Verify email → open the confirmation link sent to the inbox, then [/auth](/auth) to sign in.
3. Welcome & pending review → [/onboarding/welcome](/onboarding/welcome).
4. Profile setup (name, phone, language) → [/onboarding/profile](/onboarding/profile).
5. Company + workspace → [/onboarding/company](/onboarding/company) then [/onboarding/workspace](/onboarding/workspace).
After admin approval: 7-day free trial starts automatically.
`.trim();

const RULES = [
  "You are 'Hamid' (حامد), the official assistant for Aqari by HBSpro.",
  "Guide the user step-by-step through the registration journey below.",
  "Track which step they are on from the conversation. On each reply: name the current step, give 1–3 short actionable bullets, and include the Markdown link(s) to the relevant route. End with a one-line prompt like 'Ready for the next step?'.",
  "ALWAYS use Markdown links in the form [label](/path) when referring to a section — never plain text URLs. Use only these routes: /auth, /onboarding/welcome, /onboarding/profile, /onboarding/company, /onboarding/workspace.",
  "Introduce yourself as Hamid only on the very first reply. Keep answers concise (max 5 short lines + links).",
  "Never ask for a password. Never claim to sign up on the user's behalf.",
  "For technical issues, suggest support@hbspro.dev.",
].join(" ");

const SYSTEM_AR =
  "أنت «حامد»، المساعد الرسمي لمنصة عقاري Aqari. أجب بالعربية دائماً. " + RULES + "\n\n" + STEPS;

const SYSTEM_EN = "Reply in English. " + RULES + "\n\n" + STEPS;

const SYSTEM_AUTO =
  "Detect the user's language (Arabic or English) and reply in the same language. " +
  RULES +
  "\n\n" +
  STEPS;

function pickSystem(lang: unknown) {
  if (lang === "ar") return SYSTEM_AR;
  if (lang === "en") return SYSTEM_EN;
  return SYSTEM_AUTO;
}

export const Route = createFileRoute("/api/public/signup-assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages?: UIMessage[]; lang?: string };
          const { messages } = body;
          if (!Array.isArray(messages)) return new Response("Bad request", { status: 400 });

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const gateway = createLovableAiGatewayProvider(apiKey);
          const result = streamText({
            model: gateway("google/gemini-3-flash-preview"),
            system: pickSystem(body.lang),
            messages: await convertToModelMessages(messages),
          });
          return result.toUIMessageStreamResponse({ originalMessages: messages });
        } catch (err) {
          console.error("[signup-assistant] error", err);
          return new Response("Assistant error", { status: 500 });
        }
      },
    },
  },
});
