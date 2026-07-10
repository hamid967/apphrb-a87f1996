/**
 * Client-callable server functions to manage Web Push subscriptions and
 * expose the VAPID public key to the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVapidKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
});

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  user_agent: z.string().max(500).optional().nullable(),
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof subSchema>) => subSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.user_agent ?? null,
        failure_count: 0,
        last_error: null,
      },
      { onConflict: "user_id,endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const delSchema = z.object({ endpoint: z.string().url().max(1000) });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof delSchema>) => delSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Send a test push to the current user. If a `violationId` is provided (and
 * visible to the caller via RLS), the deep link points to that violation;
 * otherwise the most recent visible policy_violation is used. Falls back to
 * a synthetic /dashboard/inbox link when the user has no violations at all.
 * This lets employees/reviewers verify the service worker + deep-link flow
 * end-to-end without waiting for a real event.
 */
const testSchema = z.object({
  violationId: z.string().uuid().optional().nullable(),
});

export const sendTestPushNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof testSchema>) => testSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Try to resolve a deep link to a real violation the caller can see.
    let link = "/dashboard/inbox";
    let claimNumber: string | null = null;
    let violationId: string | null = null;

    const pickQuery = supabase
      .from("policy_violations")
      .select("id, claim_id, expense_claims!inner(claim_number)")
      .order("created_at", { ascending: false })
      .limit(1);
    const q = data.violationId ? pickQuery.eq("id", data.violationId) : pickQuery;
    const { data: rows } = await q;
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as {
      id: string;
      claim_id: string;
      expense_claims: { claim_number: string | null } | null;
    }) : null;
    if (row) {
      violationId = row.id;
      claimNumber = row.expense_claims?.claim_number ?? null;
      link = `/dashboard/expenses/review?claim=${row.claim_id}#violation-${row.id}`;
    }

    const { sendPushToUser } = await import("@/lib/push.server");
    const result = await sendPushToUser(userId, {
      title: "🔔 اختبار إشعار المخالفة / Test policy violation",
      body: violationId
        ? `افتح هذا الإشعار لتجربة الانتقال إلى المخالفة${claimNumber ? ` (${claimNumber})` : ""}.`
        : "لا توجد مخالفات حالية — سيتم فتح صندوق الإشعارات.",
      url: link,
      tag: "policy-violation-test",
    });

    return { ok: true as const, link, violationId, ...result };
  });

