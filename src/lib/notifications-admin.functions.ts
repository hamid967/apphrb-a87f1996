import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

/**
 * Super-admin only server functions for the queue monitoring dashboard at
 * /admin/notifications-queue. All handlers verify has_role(super_admin)
 * before touching notification_queue; the table's org-scoped SELECT policy
 * would hide most rows for the caller otherwise, so we route reads/writes
 * through supabaseAdmin.
 */

type AdminSupabase = {
  from: (t: string) => {
    select: (
      c: string,
      opts?: { count?: "exact"; head?: boolean },
    ) => AdminQuery;
    update: (row: unknown) => AdminQuery;
  };
};
type AdminQuery = {
  eq: (a: string, b: unknown) => AdminQuery;
  in: (a: string, b: unknown[]) => AdminQuery;
  gte: (a: string, b: unknown) => AdminQuery;
  ilike: (a: string, b: string) => AdminQuery;
  order: (c: string, o?: { ascending?: boolean }) => AdminQuery;
  limit: (n: number) => AdminQuery;
  select?: (c: string) => AdminQuery;
  single?: () => Promise<{ data: unknown; error: unknown }>;
  then: <T>(fn: (v: { data: unknown; error: unknown; count?: number | null }) => T) => Promise<T>;
};

const QUEUE_STATUSES = [
  "pending",
  "pending_credentials",
  "sent",
  "failed",
  "skipped",
  "dead_letter",
] as const;

/**
 * List notification_queue rows with filters. Cross-org visibility (super_admin
 * only). Returns id/channel/recipient/template/status/attempts/timestamps +
 * org name for context.
 */
export const listQueueForAdmin = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(QUEUE_STATUSES).optional(),
        channel: z.enum(["whatsapp", "sms", "email"]).optional(),
        org_id: z.string().uuid().optional(),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as unknown as AdminSupabase)
      .from("notification_queue")
      .select(
        "id, org_id, channel, recipient, template, status, attempts, max_attempts, last_error, last_attempt_at, next_attempt_at, sent_at, failed_permanent_at, created_at, organizations(name, slug)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.channel) q = q.eq("channel", data.channel);
    if (data.org_id) q = q.eq("org_id", data.org_id);
    if (data.search) q = q.ilike("recipient", `%${data.search}%`);
    const { data: rows, error } = (await q) as {
      data: QueueRow[] | null;
      error: { message?: string } | null;
    };
    if (error) throw new Error(error.message ?? "list failed");
    return (rows ?? []) as QueueRow[];
  });

export type QueueRow = {
  id: string;
  org_id: string;
  channel: "whatsapp" | "sms" | "email";
  recipient: string;
  template: string;
  status: string;
  attempts: number | null;
  max_attempts: number | null;
  last_error: string | null;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  sent_at: string | null;
  failed_permanent_at: string | null;
  created_at: string;
  organizations: { name: string | null; slug: string | null } | null;
};

/**
 * Aggregate counts for the stat cards: last-24h send outcomes plus totals for
 * queue depth and dead-letter backlog.
 */
export const getQueueStats = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AdminSupabase;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    async function count(status: string, opts?: { since?: string }) {
      let q = admin
        .from("notification_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (opts?.since) q = q.gte("created_at", opts.since);
      const { count, error } = (await q) as { count: number | null; error: unknown };
      if (error) return 0;
      return count ?? 0;
    }

    const [sent24, failed24, pending, pendingCreds, deadLetter, sent24ByChannel] =
      await Promise.all([
        count("sent", { since }),
        count("failed", { since }),
        count("pending"),
        count("pending_credentials"),
        count("dead_letter"),
        // per-channel sent breakdown for the last 24h (small helper below)
        countByChannel(admin, "sent", since),
      ]);
    const failedByChannel = await countByChannel(admin, "failed", since);
    return {
      last_24h: {
        sent: sent24,
        failed: failed24,
        by_channel: {
          sent: sent24ByChannel,
          failed: failedByChannel,
        },
      },
      totals: {
        pending,
        pending_credentials: pendingCreds,
        dead_letter: deadLetter,
      },
      generated_at: new Date().toISOString(),
    };
  });

async function countByChannel(
  admin: AdminSupabase,
  status: string,
  since: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = { whatsapp: 0, sms: 0, email: 0 };
  await Promise.all(
    (["whatsapp", "sms", "email"] as const).map(async (ch) => {
      const { count } = (await admin
        .from("notification_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", status)
        .eq("channel", ch)
        .gte("created_at", since)) as { count: number | null };
      out[ch] = count ?? 0;
    }),
  );
  return out;
}

/**
 * Reset a dead_letter row back to pending so the cron worker retries it.
 * Attempts counter is zeroed. Written through supabaseAdmin because the
 * standard RLS policy locks writes to the notification_queue for org users.
 */
export const retryDeadLetterNotification = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AdminSupabase;
    const nowIso = new Date().toISOString();
    const { data: row, error } = (await (admin
      .from("notification_queue")
      .update({
        status: "pending",
        attempts: 0,
        last_error: null,
        failed_permanent_at: null,
        next_attempt_at: nowIso,
      })
      .eq("id", data.id)
      .eq("status", "dead_letter") as unknown as {
      select: (c: string) => { single: () => Promise<{ data: unknown; error: unknown }> };
    })
      .select("id, status")
      .single()) as { data: { id: string; status: string } | null; error: { message?: string } | null };
    if (error) throw new Error(error.message ?? "retry failed");
    if (!row) throw new Error("no dead_letter row with that id");

    // Audit the manual retry.
    try {
      await (admin as unknown as {
        from: (t: string) => { insert: (r: unknown) => Promise<{ error: unknown }> };
      })
        .from("audit_log")
        .insert({
          entity: "notification_queue",
          entity_id: row.id,
          actor: context.userId,
          action: "dead_letter.retry",
          diff: { requeued_at: nowIso },
        });
    } catch {
      /* best-effort */
    }
    return { id: row.id, status: row.status };
  });

/**
 * Provider health snapshot for the dashboard. Reads env presence only — never
 * exposes the values themselves. Email is always considered configured (there
 * is no per-provider secret at this stage).
 */
export const getProviderHealth = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async ({ context }) => {
    return {
      whatsapp: {
        configured: !!process.env.WHATSAPP_API_KEY,
      },
      sms: {
        configured: !!process.env.SMS_API_KEY,
      },
      email: {
        configured: true,
      },
      default_country_code: process.env.DEFAULT_PHONE_COUNTRY_CODE ?? "966",
    };
  });
