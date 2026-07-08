import * as React from "react";
import { render } from "react-email";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TEMPLATES } from "@/lib/email-templates/registry";
import type { AdminAlertProps } from "@/lib/email-templates/admin-alert";

const SITE_NAME = "Aqari";
const SENDER_DOMAIN = "notify.hrhbs.com";
const FROM_DOMAIN = "hrhbs.com";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type EnqueueAdminAlertInput = {
  recipientEmail: string;
  props: AdminAlertProps;
  /** Stable key for idempotency (defaults to a new UUID). */
  idempotencyKey?: string;
};

export type EnqueueAdminAlertResult =
  | { ok: true; queued: true; messageId: string }
  | {
      ok: false;
      reason: "suppressed" | "unknown_template" | "enqueue_failed" | "invalid_recipient";
      error?: string;
    };

/**
 * Renders the `admin-alert` template and enqueues it into the transactional
 * email queue using the service-role client. Used by internal alert paths
 * (telemetry fan-out, admin test button) that don't have a caller JWT to
 * forward through the public /lovable/email/transactional/send route.
 *
 * Still respects the suppression list.
 */
export async function enqueueAdminAlertEmail(
  input: EnqueueAdminAlertInput,
): Promise<EnqueueAdminAlertResult> {
  const recipient = (input.recipientEmail || "").trim();
  if (!recipient || !recipient.includes("@")) {
    return { ok: false, reason: "invalid_recipient" };
  }
  const template = TEMPLATES["admin-alert"];
  if (!template) return { ok: false, reason: "unknown_template" };

  const messageId = crypto.randomUUID();
  const idempotencyKey = input.idempotencyKey ?? messageId;
  const normalized = recipient.toLowerCase();

  // Suppression check (fail-open on error — this is an operational alert
  // and losing it because of a metadata query blip is worse than a duplicate).
  const { data: suppressed } = await supabaseAdmin
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (suppressed) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "admin-alert",
      recipient_email: recipient,
      status: "suppressed",
    });
    return { ok: false, reason: "suppressed" };
  }

  // Ensure an unsubscribe token exists so footer links continue to work.
  const { data: existing } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  let unsubscribeToken = existing?.token ?? null;
  if (!unsubscribeToken) {
    unsubscribeToken = randomToken();
    await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .upsert(
        { token: unsubscribeToken, email: normalized },
        { onConflict: "email", ignoreDuplicates: true },
      );
    const { data: stored } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalized)
      .maybeSingle();
    if (stored?.token) unsubscribeToken = stored.token;
  }

  // Render.
  const element = React.createElement(template.component, input.props);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function"
      ? template.subject(input.props as unknown as Record<string, unknown>)
      : template.subject;

  // Log pending BEFORE enqueue so we always have a trail.
  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: "admin-alert",
    recipient_email: recipient,
    status: "pending",
  });

  const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: "admin-alert",
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });
  if (enqueueError) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "admin-alert",
      recipient_email: recipient,
      status: "failed",
      error_message: enqueueError.message,
    });
    return { ok: false, reason: "enqueue_failed", error: enqueueError.message };
  }
  return { ok: true, queued: true, messageId };
}
