import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * WhatsApp / SMS / email notification abstraction.
 *
 * This is a thin queueing layer:
 * - If the relevant credentials are present in server env, `dispatchNow`
 *   performs the send synchronously and records the result.
 * - If credentials are missing, the message is stored in
 *   `notification_queue` with status='pending_credentials' so a super-admin
 *   can retry once the API key is added. Callers never crash on missing keys.
 *
 * The `WHATSAPP_API_KEY` / `SMS_API_KEY` secrets are optional at deploy time.
 * Sending payload format is intentionally provider-agnostic (`template` +
 * `variables`) so switching providers only touches this file.
 */

const ChannelSchema = z.enum(["whatsapp", "sms", "email"]);

const EnqueueInputSchema = z.object({
  org_id: z.string().uuid(),
  channel: ChannelSchema,
  /**
   * Recipient contact (email / phone). Optional — when omitted we resolve it
   * from `recipient_user_id` + `channel` using the admin client.
   */
  recipient: z.string().min(3).max(200).optional(),
  template: z.string().min(1).max(100),
  /**
   * Optional identity fields used to honor per-user event preferences.
   * When both are supplied, the send is skipped if the recipient has an
   * `enabled=false` row in `user_notification_event_prefs` for
   * (event_key, channel).
   */
  event_key: z.string().min(1).max(80).optional(),
  recipient_user_id: z.string().uuid().optional(),
  /**
   * Optional idempotency key. When supplied, a second call with the same
   * (org_id, idempotency_key) returns the existing row instead of enqueuing
   * a duplicate — safe against concurrent double-clicks, retries, and
   * webhook redeliveries. Recommend a stable value per business event
   * (e.g. `expense_batch_approved:<batch_id>`).
   */
  idempotency_key: z.string().min(1).max(120).optional(),
  variables: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
  /**
   * When true, try to dispatch immediately. When false (default), the message
   * is left in "pending" for a background worker to pick up.
   */
  dispatch_now: z.boolean().default(true),
});

function credentialsFor(channel: "whatsapp" | "sms" | "email"): string | null {
  if (channel === "whatsapp") return process.env.WHATSAPP_API_KEY ?? null;
  if (channel === "sms") return process.env.SMS_API_KEY ?? null;
  // Email is always available — we always have a queue/render pipeline
  return "email";
}

/**
 * Normalize a phone number to digits only, dropping leading `+` and any
 * `00` international prefix so `"+966501234567"` and `"00966501234567"` and
 * `"966 50 123 4567"` all compare equal. Numbers under 8 digits are
 * returned as-is so callers can reject them.
 */
function normalizePhone(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

type EnqueueInput = z.infer<typeof EnqueueInputSchema>;

async function enqueueNotificationCore(
  context: { supabase: unknown; userId: string },
  data: EnqueueInput,
) {
  // Cast once — the injected supabase client has the full Database typing at
  // the call sites; we widen here so this helper can be shared without
  // duplicating the type signature.
  const ctx = context as unknown as {
    supabase: {
      from: (t: string) => {
        select: (c: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => {
              maybeSingle: () => Promise<{
                data: { id: string; status: string } | null;
              }>;
            };
          };
        };
        insert: (row: unknown) => {
          select: (c: string) => {
            single: () => Promise<{
              data: { id: string; status: string } | null;
              error: { code?: string } | null;
            }>;
          };
        };
        update: (row: unknown) => {
          eq: (a: string, b: string) => Promise<{ error: unknown }>;
        };
      };
    };
    userId: string;
  };
    // Load admin client inside the handler so this .functions.ts file stays
    // safe to import from the client bundle.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Honor per-user event preferences. A row with enabled=false blocks the
    // send entirely for this (event_key, channel). Absence of a row means
    // "use default = enabled", so we only skip when a row exists and is off.
    const eventKey = data.event_key ?? data.template;
    let recipientUserId = data.recipient_user_id ?? null;
    let recipient: string | null = data.recipient ?? null;

    // If the caller didn't tell us which user we're sending to, try to
    // resolve it from the recipient contact so preferences still apply.
    // - whatsapp/sms → match profiles.phone within the same org
    // - email        → match organization_members_with_profiles by email
    if (!recipientUserId && recipient) {
      try {
        if (data.channel === "whatsapp" || data.channel === "sms") {
          const normalized = normalizePhone(recipient);
          const { data: memberRows } = await (supabaseAdmin as never as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (a: string, b: string) => Promise<{ data: Array<{ user_id: string; phone: string | null }> | null }>;
              };
            };
          })
            .from("organization_members_with_profiles")
            .select("user_id, phone")
            .eq("org_id", data.org_id);
          const match = (memberRows ?? []).find((r) => {
            const p = normalizePhone(r.phone ?? "");
            return p.length >= 8 && normalized.length >= 8 && p === normalized;
          });
          if (match) recipientUserId = match.user_id;
        } else if (data.channel === "email") {
          const { data: memberRows } = await (supabaseAdmin as never as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (a: string, b: string) => {
                  eq: (a: string, b: string) => Promise<{ data: Array<{ user_id: string }> | null }>;
                };
              };
            };
          })
            .from("organization_members_with_profiles")
            .select("user_id")
            .eq("org_id", data.org_id)
            .eq("email", recipient.toLowerCase());
          if (memberRows && memberRows[0]) recipientUserId = memberRows[0].user_id;
        }
      } catch {
        // Best-effort resolution — never block the send on lookup failure.
      }
    }

    // If the caller gave us a user id but no recipient contact, resolve it
    // from the org membership view via the admin client (bypasses RLS).
    if (recipientUserId && !recipient) {
      try {
        const { data: memberRow } = await (supabaseAdmin as never as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (a: string, b: string) => {
                eq: (a: string, b: string) => {
                  maybeSingle: () => Promise<{
                    data: { email: string | null; phone: string | null } | null;
                  }>;
                };
              };
            };
          };
        })
          .from("organization_members_with_profiles")
          .select("email, phone")
          .eq("org_id", data.org_id)
          .eq("user_id", recipientUserId)
          .maybeSingle();
        if (memberRow) {
          if (data.channel === "email" && memberRow.email) recipient = memberRow.email;
          else if ((data.channel === "whatsapp" || data.channel === "sms") && memberRow.phone)
            recipient = memberRow.phone;
        }
      } catch {
        // fall through — validation below will reject if still missing.
      }
    }

    if (!recipient || recipient.length < 3) {
      return {
        queued: false,
        dispatched: false,
        status: "skipped_no_recipient",
        skipped_reason: "recipient_not_resolved",
        id: null as string | null,
      };
    }

    if (recipientUserId) {
      // Use admin client so we can read preferences for a user other than the
      // caller — RLS on user_notification_event_prefs restricts to self.
      const { data: pref } = await (supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              a: string,
              b: string,
            ) => {
              eq: (
                a: string,
                b: string,
              ) => {
                eq: (
                  a: string,
                  b: string,
                ) => {
                  eq: (
                    a: string,
                    b: string,
                  ) => { maybeSingle: () => Promise<{ data: { enabled: boolean } | null }> };
                };
              };
            };
          };
        };
      })
        .from("user_notification_event_prefs")
        .select("enabled")
        .eq("user_id", recipientUserId)
        .eq("org_id", data.org_id)
        .eq("event_key", eventKey)
        .eq("channel", data.channel)
        .maybeSingle();
      if (pref && pref.enabled === false) {
        return {
          queued: false,
          dispatched: false,
          status: "skipped_user_pref",
          skipped_reason: "user_disabled_event",
          id: null as string | null,
        };
      }
    }

    const creds = credentialsFor(data.channel);
    const initialStatus = creds ? "pending" : "pending_credentials";

    // Short-circuit on idempotency: if a row with the same key already
    // exists in this org, return it instead of inserting a duplicate. The
    // unique index (org_id, idempotency_key) makes concurrent inserts race-
    // safe — we fall back to a SELECT on unique-violation below.
    if (data.idempotency_key) {
      const { data: existing } = await ctx.supabase
        .from("notification_queue")
        .select("id, status")
        .eq("org_id", data.org_id)
        .eq("idempotency_key", data.idempotency_key)
        .maybeSingle();
      if (existing) {
        return {
          queued: true,
          dispatched: false,
          status: existing.status,
          id: existing.id,
          idempotent_replay: true as const,
        };
      }
    }

    const { data: row, error } = await ctx.supabase
      .from("notification_queue")
      .insert({
        org_id: data.org_id,
        channel: data.channel,
        recipient,
        template: data.template,
        variables: data.variables as never,
        status: initialStatus,
        created_by: ctx.userId,
        recipient_user_id: recipientUserId,
        idempotency_key: data.idempotency_key ?? null,
      } as never)
      .select("id, status")
      .single();
    if (error) {
      // Postgres unique violation → another concurrent request won the race;
      // return the row that already exists so both callers see the same id.
      const code = (error as { code?: string }).code;
      if (code === "23505" && data.idempotency_key) {
        const { data: existing } = await ctx.supabase
          .from("notification_queue")
          .select("id, status")
          .eq("org_id", data.org_id)
          .eq("idempotency_key", data.idempotency_key)
          .maybeSingle();
        if (existing) {
          return {
            queued: true,
            dispatched: false,
            status: existing.status,
            id: existing.id,
            idempotent_replay: true as const,
          };
        }
      }
      throw error;
    }

    if (!data.dispatch_now || initialStatus === "pending_credentials") {
      return {
        queued: true,
        dispatched: false,
        status: initialStatus,
        id: row?.id,
      };
    }

    // Attempt immediate dispatch (best-effort; failures re-queue for retry).
    const { tryDispatch } = await import("@/lib/notifications-dispatch.server");
    const result = await tryDispatch(data.channel, recipient, data.template, data.variables);

    await ctx.supabase
      .from("notification_queue")
      .update({
        status: result.ok ? "sent" : "failed",
        last_error: result.ok ? null : result.error,
        attempts: 1,
        last_attempt_at: new Date().toISOString(),
        sent_at: result.ok ? new Date().toISOString() : null,
      } as never)
      .eq("id", row!.id);

    return {
      queued: true,
      dispatched: result.ok,
      status: result.ok ? "sent" : "failed",
      id: row?.id,
      error: result.ok ? null : result.error,
    };
}

export const enqueueNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EnqueueInputSchema.parse(input))
  .handler(async ({ data, context }) => enqueueNotificationCore(context, data));

/**
 * List queued notifications for an org (readable by org members via RLS).
 * Useful for building a delivery log view.
 */
export const listOrgNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        status: z
          .enum(["pending", "pending_credentials", "sent", "failed", "skipped", "dead_letter"])
          .optional(),
        limit: z.number().min(1).max(200).default(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notification_queue")
      .select("id, channel, recipient, template, status, last_error, attempts, sent_at, created_at")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// Provider dispatch lives in `notifications-dispatch.server.ts` — imported
// dynamically inside the handler so it never lands in the client bundle.

/**
 * Authorization helper — returns whether the caller is allowed to trigger
 * test sends for the given org. Allowed when either:
 *   - the caller is a platform `super_admin`, or
 *   - the caller is an org member with role in ('owner','admin').
 * Everyone else (regular member, viewer, non-member) is denied.
 */
async function assertCanTestSend(
  context: { supabase: never; userId: string } | { supabase: unknown; userId: string },
  orgId: string,
): Promise<{ role: "super_admin" | "owner" | "admin" }> {
  const sb = (context as { supabase: unknown }).supabase as {
    rpc: (n: string, p: unknown) => Promise<{ data: boolean | null; error: unknown }>;
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, b: string) => {
          eq: (a: string, b: string) => {
            maybeSingle: () => Promise<{ data: { role: string } | null; error: unknown }>;
          };
        };
      };
    };
  };
  const { data: isSuper } = await sb.rpc("has_role", {
    _user_id: (context as { userId: string }).userId,
    _role: "super_admin",
  });
  if (isSuper === true) return { role: "super_admin" };
  const { data: membership } = await sb
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", (context as { userId: string }).userId)
    .maybeSingle();
  const role = membership?.role;
  if (role === "owner" || role === "admin") return { role };
  throw new Error("forbidden: test send requires super_admin or org owner/admin");
}

/**
 * Whether the current user may access the notification test-send UI for the
 * given org. Used by the settings page to gate the "اختبار الإرسال" tab so
 * unauthorized users don't see a button that will just 403.
 */
export const canTestSendNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    try {
      const { role } = await assertCanTestSend(context, data.org_id);
      return { allowed: true as const, role };
    } catch {
      return { allowed: false as const, role: null };
    }
  });

const TestSendInputSchema = z.object({
  org_id: z.string().uuid(),
  channel: ChannelSchema,
  recipient: z.string().trim().min(3).max(200),
  template: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_.:-]+$/, "template key: letters, digits, _.:-"),
  variables: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
  dispatch_now: z.boolean().default(true),
});

/**
 * Dedicated server fn for the settings "Test Send" panel. Strictly gated to
 * super_admin OR org owner/admin — regular members cannot trigger arbitrary
 * sends to arbitrary recipients through the UI. Validates recipient format
 * per channel (email vs. E.164-ish phone) before enqueueing.
 */
export const sendTestNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TestSendInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { role } = await assertCanTestSend(context, data.org_id);

    const recipient = data.recipient.trim();
    if (data.channel === "email") {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) && recipient.length <= 200;
      if (!emailOk) throw new Error("recipient must be a valid email address");
    } else {
      // Accept leading '+' or '00', digits, spaces, dashes; require 8–15 digits.
      const digits = recipient.replace(/\D/g, "").replace(/^00/, "");
      if (digits.length < 8 || digits.length > 15) {
        throw new Error("recipient must be a phone number with 8–15 digits");
      }
    }

    // Delegate to the shared enqueue path so credential handling, dispatch,
    // and status recording stay in one place. We tag it with an idempotency
    // key so accidental double-clicks don't fan out.
    const idem = `test:${data.channel}:${recipient}:${data.template}:${Date.now().toString().slice(0, -3)}`;
    const result = await enqueueNotificationCore(context, {
      org_id: data.org_id,
      channel: data.channel,
      recipient,
      template: data.template,
      variables: data.variables,
      dispatch_now: data.dispatch_now,
      idempotency_key: idem,
    } as EnqueueInput);

    // Audit the attempt (never blocks the response). Uses supabaseAdmin so
    // the write bypasses audit_log RLS, which is read-only for org staff.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const action =
        result.status === "sent"
          ? "test_send.sent"
          : result.status === "failed"
            ? "test_send.failed"
            : result.status === "pending_credentials"
              ? "test_send.pending_credentials"
              : `test_send.${result.status}`;
      await (supabaseAdmin as unknown as {
        from: (t: string) => { insert: (row: unknown) => Promise<{ error: unknown }> };
      })
        .from("audit_log")
        .insert({
          entity: "notification_test_send",
          entity_id: result.id ?? crypto.randomUUID(),
          actor: context.userId,
          action,
          diff: {
            org_id: data.org_id,
            actor_role: role,
            channel: data.channel,
            recipient,
            template: data.template,
            status: result.status,
            dispatched: (result as { dispatched?: boolean }).dispatched ?? false,
            error: (result as { error?: string | null }).error ?? null,
            idempotency_key: idem,
          },
        });
    } catch {
      // Best-effort — never fail the send because auditing failed.
    }

    return result;
  });

/**
 * Recent test-send history for the settings panel. Filtered to rows
 * enqueued via `sendTestNotification` (idempotency_key starts with `test:`)
 * and created by the caller. Gated to super_admin / org owner/admin — same
 * audience allowed to trigger tests.
 */
export const listTestSendHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(25),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanTestSend(context, data.org_id);
    const { data: rows, error } = await context.supabase
      .from("notification_queue")
      .select(
        "id, channel, recipient, template, status, last_error, attempts, sent_at, created_at",
      )
      .eq("org_id", data.org_id)
      .eq("created_by", context.userId)
      .like("idempotency_key", "test:%")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

/**
 * In-app notification center: lists notification_queue rows addressed to
 * the current user (recipient_user_id = auth.uid()). RLS scopes results.
 */
export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { unreadOnly?: boolean; limit?: number } | undefined) => ({
    unreadOnly: input?.unreadOnly ?? false,
    limit: Math.min(Math.max(input?.limit ?? 50, 1), 200),
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notification_queue")
      .select(
        "id, channel, template, status, variables, sent_at, created_at, read_at",
      )
      .eq("recipient_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.unreadOnly) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const markMyNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; read?: boolean }) =>
    z.object({ id: z.string().uuid(), read: z.boolean().default(true) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_queue")
      .update({ read_at: data.read ? new Date().toISOString() : null })
      .eq("id", data.id)
      .eq("recipient_user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const markAllMyNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notification_queue")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });
