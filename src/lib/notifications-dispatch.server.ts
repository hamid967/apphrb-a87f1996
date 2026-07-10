/**
 * Server-only helpers for the notification worker.
 *
 * Split out from `notifications.functions.ts` so route files (including the
 * public cron hook) can import them without pulling in the server-fn RPC
 * plumbing. The `.server.ts` suffix keeps this module out of client bundles.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DispatchResult = { ok: true } | { ok: false; error: string };

const TWILIO_GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
/** Twilio's shared sandbox sender for WhatsApp; overrideable via env. */
const TWILIO_WHATSAPP_SANDBOX_FROM = "+14155238886";

/**
 * Substitute `{{key}}` placeholders in `template` with values from
 * `variables`. Unknown keys are left untouched. If the template does not
 * contain any placeholders and `variables.body` is a string, that body is
 * used as-is (lets callers pass a preformatted SMS body without registering
 * a template).
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  const hasPlaceholders = /\{\{\s*[\w.]+\s*\}\}/.test(template);
  if (!hasPlaceholders && typeof variables.body === "string") {
    return variables.body;
  }
  const base = hasPlaceholders ? template : template;
  return base.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const val = variables[key];
    return val == null ? "" : String(val);
  });
}

async function twilioSend(
  form: URLSearchParams,
  label: string,
): Promise<DispatchResult> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  if (!lovableKey) return { ok: false, error: "LOVABLE_API_KEY missing" };
  if (!twilioKey) return { ok: false, error: `Twilio not connected (${label})` };
  const res = await fetch(`${TWILIO_GATEWAY_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `Twilio ${label} ${res.status}: ${t.slice(0, 200)}` };
  }
  return { ok: true };
}

function shouldUseTwilioForWhatsApp(): boolean {
  if (process.env.WHATSAPP_PROVIDER === "twilio") return true;
  // No Meta credentials configured → fall back to Twilio if available.
  return !process.env.WHATSAPP_API_KEY || !process.env.WHATSAPP_PHONE_ID;
}

/**
 * Convert a raw phone string to E.164 (`+<country><subscriber>`, digits only,
 * max 15). Returns `null` when the input cannot be interpreted as a phone.
 *
 * Rules (in order):
 *  1. `+CCxxxx`                       → keep as-is (validated).
 *  2. `00CCxxxx`                      → `+CCxxxx`.
 *  3. Starts with default country dial code (e.g. `966...`) → prepend `+`.
 *  4. Starts with a national trunk `0` (e.g. `05xxxxxxxx` in SA)
 *                                     → drop the `0`, prepend `+<default>`.
 *  5. Bare local subscriber digits    → prepend `+<default>`.
 *
 * Default country dial code comes from `DEFAULT_PHONE_COUNTRY_CODE`
 * (env, digits only, no `+`) and falls back to `966` (Saudi Arabia) — the
 * primary market for this product.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const defaultCC = (process.env.DEFAULT_PHONE_COUNTRY_CODE ?? "966").replace(/\D/g, "");

  // 1. already E.164-ish
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return isValidE164Digits(digits) ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // 2. 00-prefixed international format
  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    return isValidE164Digits(rest) ? `+${rest}` : null;
  }

  // 3. begins with the configured country dial code
  if (defaultCC && digits.startsWith(defaultCC) && digits.length > defaultCC.length) {
    return isValidE164Digits(digits) ? `+${digits}` : null;
  }

  // 4. national trunk 0 (e.g. SA "05xxxxxxxx")
  if (defaultCC && digits.startsWith("0")) {
    const rest = digits.replace(/^0+/, "");
    const combined = `${defaultCC}${rest}`;
    return isValidE164Digits(combined) ? `+${combined}` : null;
  }

  // 5. bare local subscriber — prepend default country
  const combined = `${defaultCC}${digits}`;
  return isValidE164Digits(combined) ? `+${combined}` : null;
}

function isValidE164Digits(digits: string): boolean {
  // E.164: min ~8 (country + subscriber), max 15 total digits after the "+".
  return /^[1-9]\d{7,14}$/.test(digits);
}

export async function tryDispatch(
  channel: "whatsapp" | "sms" | "email" | "push" | "in_app",
  recipient: string,
  template: string,
  variables: Record<string, unknown>,
): Promise<DispatchResult> {
  try {
    if (channel === "in_app") {
      // In-app rows are surfaced by the inbox; nothing to send externally.
      return { ok: true };
    }
    if (channel === "push") {
      const { sendPushToUser } = await import("./push.server");
      const title =
        (variables.title as string | undefined) ??
        (template === "policy_violation_submitter"
          ? "مخالفة سياسة على مطالبتك"
          : template === "policy_violation_approver"
            ? "مطالبة تحتوي على مخالفة سياسة"
            : "إشعار جديد");
      const body =
        (variables.reason as string | undefined) ??
        (variables.body as string | undefined) ??
        "";
      const url =
        (variables.link as string | undefined) ??
        (variables.url as string | undefined) ??
        "/dashboard/inbox";
      const tag =
        typeof variables.violation_id === "string"
          ? `pv:${variables.violation_id}`
          : undefined;
      const res = await sendPushToUser(recipient, { title, body, url, tag });
      if (res.delivered === 0 && res.failed > 0 && res.removed === 0) {
        return { ok: false, error: `push failed: ${res.failed}` };
      }
      // 0 subs, or delivered/removed → treat as done to avoid pointless retries
      return { ok: true };
    }
    if (channel === "whatsapp") {
      const to = toE164(recipient);
      if (!to) return { ok: false, error: `Invalid phone for WhatsApp: ${recipient}` };

      // Twilio path (fallback or explicit)
      if (shouldUseTwilioForWhatsApp()) {
        const from = process.env.TWILIO_FROM_WHATSAPP || TWILIO_WHATSAPP_SANDBOX_FROM;
        const body = renderTemplate(template, variables);
        const form = new URLSearchParams({
          To: `whatsapp:${to}`,
          From: `whatsapp:${from}`,
          Body: body,
        });
        return twilioSend(form, "WhatsApp");
      }

      const key = process.env.WHATSAPP_API_KEY;
      const phoneId = process.env.WHATSAPP_PHONE_ID;
      if (!key || !phoneId) return { ok: false, error: "WhatsApp credentials missing" };
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          // Meta Cloud API wants the number WITHOUT the leading `+`.
          to: to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: template,
            language: { code: "ar" },
            components: [
              {
                type: "body",
                parameters: Object.values(variables).map((v) => ({
                  type: "text",
                  text: String(v),
                })),
              },
            ],
          },
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { ok: false, error: `WhatsApp API ${res.status}: ${t.slice(0, 200)}` };
      }
      return { ok: true };
    }

    if (channel === "sms") {
      const to = toE164(recipient);
      if (!to) return { ok: false, error: `Invalid phone for SMS: ${recipient}` };
      const from = process.env.TWILIO_FROM_SMS;
      if (!from) return { ok: false, error: "TWILIO_FROM_SMS not configured" };
      const body = renderTemplate(template, variables);
      const form = new URLSearchParams({ To: to, From: from, Body: body });
      return twilioSend(form, "SMS");
    }

    // Email pipeline is external; we just consider it dispatched here.
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Maximum attempts before a message is marked permanently failed. */
const MAX_ATTEMPTS = 5;

type QueueRow = {
  id: string;
  channel: "whatsapp" | "sms" | "email" | "push" | "in_app";
  recipient: string;
  template: string;
  variables: Record<string, unknown> | null;
  attempts: number;
};

/**
 * Claim up to `limit` due notifications and attempt to dispatch each.
 *
 * Due = status in ('pending','failed') AND attempts < MAX_ATTEMPTS AND
 * (never attempted OR last attempt older than exponential-backoff window).
 * Backoff window = 2^attempts minutes (1, 2, 4, 8, 16).
 *
 * Returns a summary: how many rows were considered, sent, failed, exhausted.
 */
export async function dispatchPendingNotifications(limit = 25): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  exhausted: number;
}> {
  const admin = supabaseAdmin as never as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: QueueRow[] | null; error: { message: string } | null }>;
    from: (t: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (a: string, b: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  const { data: rows, error } = await admin.rpc("claim_pending_notifications", {
    _limit: limit,
    _max_attempts: MAX_ATTEMPTS,
  });
  if (error) throw new Error(error.message);
  const claimed = rows?.length ?? 0;

  let sent = 0;
  let failed = 0;
  let exhausted = 0;

  for (const row of rows ?? []) {
    const result = await tryDispatch(
      row.channel,
      row.recipient,
      row.template,
      row.variables ?? {},
    );
    const nextAttempts = (row.attempts ?? 0) + 1;
    const isExhausted = !result.ok && nextAttempts >= MAX_ATTEMPTS;
    // Dead-letter: once a message has burned through MAX_ATTEMPTS it is
    // parked in `dead_letter` so the worker stops retrying it. Manual
    // intervention (fix template/recipient, then reset status) is required.
    const status: "sent" | "failed" | "dead_letter" = result.ok
      ? "sent"
      : isExhausted
        ? "dead_letter"
        : "failed";
    if (result.ok) sent++;
    else if (isExhausted) exhausted++;
    else failed++;

    const now = new Date().toISOString();
    await admin
      .from("notification_queue")
      .update({
        status,
        attempts: nextAttempts,
        last_attempt_at: now,
        sent_at: result.ok ? now : null,
        last_error: result.ok ? null : result.error,
        failed_permanent_at: isExhausted ? now : null,
      })
      .eq("id", row.id);
  }

  return { claimed, sent, failed, exhausted };
}