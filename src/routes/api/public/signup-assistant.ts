import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const PLATFORM = `
HBSpro product context:
- HBSpro is a Saudi real-estate operating platform for property portfolios, owners, property managers, brokers, and growing real-estate companies.
- Core modules: portfolio and unit management, leases/contracts, rent collection and arrears, maintenance tickets, tenant and owner portals, CRM/customer needs, accounting and VAT/ZATCA-ready workflows, executive reports, reminders, and AI recommendations.
- Saudi positioning: Arabic-first, bilingual Arabic/English, built for KSA workflows, supports Ejar/SADAD/Mada/ZATCA/WhatsApp-style integration messaging when asked as roadmap/readiness unless the user asks for a confirmed live integration.
- Primary value: reduce vacancy, improve collection, catch expiring contracts early, document maintenance work, and give managers a morning command-center view.
`.trim();

const PLAYBOOK = `
Operational playbooks you can recommend:
1. Morning portfolio brief: revenue collected, overdue tenants, vacant units, contracts expiring in 30 days, open maintenance, and recommended actions.
2. Arrears workflow: classify overdue invoices by age, send reminders, assign follow-up owner, record promises to pay, escalate high-risk accounts.
3. Vacancy workflow: flag long-vacant units, suggest marketing action, check pricing, prepare listing data, assign broker/agent.
4. Contract renewal workflow: detect renewals due soon, prepare renewal terms, notify tenant/owner, track acceptance, document final status.
5. Maintenance workflow: capture ticket, severity, asset/unit, photos, vendor, cost estimate, SLA, completion proof, and tenant satisfaction.
6. Executive reporting: occupancy, collection rate, NOI-style summaries, maintenance cost, aging receivables, portfolio risk, and action list.
`.trim();

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
  "You are 'Hamid' (حامد), the official HBSpro assistant and real-estate operations guide.",
  "Help visitors understand the platform, choose the right module, and complete registration when they are ready.",
  "If the user asks about business operations, answer with a practical mini-playbook: current risk, recommended action, and which HBSpro module helps.",
  "If the user asks about registration, guide them step-by-step through the registration journey below.",
  "On each reply: keep it concise, use 1–4 bullets, and include a clear next action.",
  "ALWAYS use Markdown links in the form [label](/path) for internal routes. Use only: /auth, /onboarding/welcome, /onboarding/profile, /onboarding/company, /onboarding/workspace, /services, /pricing, /contact.",
  "Do not claim an integration is live unless the user says it is already connected. Say 'جاهزية/خطة تكامل' or 'integration-ready/roadmap' when uncertain.",
  "Never ask for passwords, OTPs, payment cards, API keys, or private tenant data in chat.",
  "For technical issues, suggest support@hbspro.dev.",
].join(" ");

const SYSTEM_AR =
  "أجب بالعربية دائماً وبأسلوب مختصر وعملي. " +
  RULES +
  "\n\n" +
  PLATFORM +
  "\n\n" +
  PLAYBOOK +
  "\n\n" +
  STEPS;

const SYSTEM_EN =
  "Reply in English with concise, practical product guidance. " +
  RULES +
  "\n\n" +
  PLATFORM +
  "\n\n" +
  PLAYBOOK +
  "\n\n" +
  STEPS;

const SYSTEM_AUTO =
  "Detect the user's language (Arabic or English) and reply in the same language. " +
  RULES +
  "\n\n" +
  PLATFORM +
  "\n\n" +
  PLAYBOOK +
  "\n\n" +
  STEPS;

function pickSystem(lang: unknown) {
  if (lang === "ar") return SYSTEM_AR;
  if (lang === "en") return SYSTEM_EN;
  return SYSTEM_AUTO;
}

function getTextSize(messages: UIMessage[]) {
  return messages.reduce((total, message) => {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return (
      total +
      parts.reduce((sum, part) => {
        return sum + (part.type === "text" ? part.text.length : 0);
      }, 0)
    );
  }, 0);
}

function validateMessages(messages: UIMessage[]) {
  if (messages.length > 24) {
    return "Too many messages";
  }
  if (getTextSize(messages) > 12000) {
    return "Conversation too large";
  }
  return null;
}

export const Route = createFileRoute("/api/public/signup-assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages?: UIMessage[]; lang?: string };
          const { messages } = body;
          if (!Array.isArray(messages)) return new Response("Bad request", { status: 400 });
          const validationError = validateMessages(messages);
          if (validationError) return new Response(validationError, { status: 413 });

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
