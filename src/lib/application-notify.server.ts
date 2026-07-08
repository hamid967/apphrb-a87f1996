/**
 * Server-only helper: fan out email + in-app notifications when a rental
 * application's status changes or a note is added.
 *
 * - Sends an Arabic transactional email to the applicant via the shared
 *   `enqueue_email` pipeline (respects suppression + unsubscribe tokens).
 * - Inserts in-app `notifications` rows for every org member with role
 *   `owner`, `admin`, or `manager` so the review team sees a bell alert.
 *
 * Never throws — the caller (status update / note add) must succeed even
 * when notifications fail. Errors are logged and swallowed.
 */
import * as React from "react";
import { render } from "react-email";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TEMPLATES } from "@/lib/email-templates/registry";
import type {
  ApplicationUpdateProps,
  ApplicationUpdateEvent,
} from "@/lib/email-templates/application-update";

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

const EVENT_TITLE_AR: Record<ApplicationUpdateEvent, string> = {
  status_changed: "تحديث حالة طلب إيجار",
  note_added: "ملاحظة جديدة على طلب إيجار",
  approved: "تم قبول طلب إيجار",
  rejected: "تم رفض طلب إيجار",
};

export interface NotifyApplicationInput {
  applicationId: string;
  orgId: string;
  event: ApplicationUpdateEvent;
  applicantName: string;
  applicantEmail: string | null;
  listingId?: string | null;
  listingTitle?: string | null;
  listingSlug?: string | null;
  newStatus?: string | null;
  oldStatus?: string | null;
  note?: string | null;
  actorId?: string | null;
  actorName?: string | null;
}

/** Fire-and-forget notification fan-out. Never throws. */
export async function notifyApplicationUpdate(
  input: NotifyApplicationInput,
): Promise<void> {
  try {
    await Promise.allSettled([
      sendApplicantEmail(input),
      insertInAppForOrgReviewers(input),
    ]);
  } catch (err) {
    console.error("[notifyApplicationUpdate] unexpected error", err);
  }
}

async function sendApplicantEmail(input: NotifyApplicationInput): Promise<void> {
  const recipient = (input.applicantEmail ?? "").trim();
  if (!recipient || !recipient.includes("@")) return;
  const template = TEMPLATES["application-update"];
  if (!template) return;

  const normalized = recipient.toLowerCase();

  // NOTE: The applicant is treated as an anonymous external recipient — we
  // always send them the transactional email (subject to suppression/
  // unsubscribe). Reviewer-side email/in-app filtering happens below.
  const messageId = crypto.randomUUID();
  const idempotencyKey = `app-update:${input.applicationId}:${input.event}:${input.newStatus ?? ""}:${input.note ? hash8(input.note) : ""}`;

  const { data: suppressed } = await supabaseAdmin
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (suppressed) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "application-update",
      recipient_email: recipient,
      status: "suppressed",
    });
    return;
  }

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

  const applicationUrl = input.listingSlug
    ? `https://hrhbs.com/listings/${input.listingSlug}/apply`
    : undefined;

  const props: ApplicationUpdateProps = {
    siteName: SITE_NAME,
    applicantName: input.applicantName,
    listingTitle: input.listingTitle ?? null,
    event: input.event,
    newStatus: input.newStatus ?? null,
    oldStatus: input.oldStatus ?? null,
    note: input.note ?? null,
    actorName: input.actorName ?? null,
    eventTime: new Date().toISOString(),
    applicationUrl,
  };

  const element = React.createElement(
    template.component as React.ComponentType<ApplicationUpdateProps>,
    props,
  );
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function"
      ? template.subject(props as unknown as Record<string, unknown>)
      : template.subject;

  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: "application-update",
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
      label: "application-update",
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });
  if (enqueueError) {
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "application-update",
      recipient_email: recipient,
      status: "failed",
      error_message: enqueueError.message,
    });
  }
}

async function insertInAppForOrgReviewers(
  input: NotifyApplicationInput,
): Promise<void> {
  const { data: members, error } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role")
    .eq("org_id", input.orgId)
    .in("role", ["owner", "admin"]);
  if (error || !members || members.length === 0) return;

  // Filter out reviewers who explicitly disabled in-app for this event.
  const eventKey = `application.${input.event}`;
  const userIds = members.map((m) => m.user_id);
  const { data: prefs } = await supabaseAdmin
    .from("user_notification_event_prefs")
    .select("user_id, enabled")
    .eq("org_id", input.orgId)
    .eq("event_key", eventKey)
    .eq("channel", "in_app")
    .in("user_id", userIds);
  const disabled = new Set(
    (prefs ?? []).filter((p) => p.enabled === false).map((p) => p.user_id as string),
  );
  const enabledMembers = members.filter((m) => !disabled.has(m.user_id));
  if (enabledMembers.length === 0) return;

  const title = EVENT_TITLE_AR[input.event] ?? "تحديث طلب إيجار";
  const statusPart = input.newStatus ? ` (${input.newStatus})` : "";
  const bodyParts: string[] = [
    `المتقدم: ${input.applicantName}`,
  ];
  if (input.listingTitle) bodyParts.push(`العقار: ${input.listingTitle}`);
  if (input.event === "note_added" && input.note) {
    bodyParts.push(`ملاحظة: ${input.note.slice(0, 240)}`);
  }
  if (input.actorName) bodyParts.push(`بواسطة: ${input.actorName}`);
  const body = bodyParts.join(" • ");

  const link = `/dashboard/applications?open=${input.applicationId}`;
  const type = `application.${input.event}`;

  const rows = enabledMembers.map((m) => ({
    org_id: input.orgId,
    user_id: m.user_id,
    title: `${title}${statusPart}`,
    body,
    type,
    link,
  }));

  const { error: insErr } = await supabaseAdmin.from("notifications").insert(rows);
  if (insErr) {
    console.error("[notifyApplicationUpdate] insert notifications failed", insErr.message);
  }
}

function hash8(s: string): string {
  // Deterministic 8-char hash for idempotency keys — collisions here just
  // mean two identical notes on the same status won't send twice.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}