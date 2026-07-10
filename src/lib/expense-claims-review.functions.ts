import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueNotification } from "@/lib/notifications.functions";

/**
 * Manager-side review endpoints for individual expense claims. Complements
 * the batch-level approve/reject in `expense-batches.functions.ts` by
 * letting an org owner/admin (or platform admin) decide claims one at a
 * time. RLS ("admins manage expense_claims" + platform admin update policy)
 * already gates access, but we validate the caller explicitly so a bad
 * request errors cleanly.
 */

const REVIEWABLE = ["submitted", "in_review", "approved", "rejected", "draft"] as const;
type Reviewable = (typeof REVIEWABLE)[number];

const listSchema = z.object({
  org_id: z.string().uuid(),
  status: z.enum(REVIEWABLE).optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

async function assertReviewer(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
) {
  const [{ data: isAdmin }, { data: isSuper }, { data: isOrgAdmin }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_org_role", {
      _org: orgId,
      _user: userId,
      _roles: ["owner", "admin"],
    }),
  ]);
  if (!isAdmin && !isSuper && !isOrgAdmin) throw new Error("forbidden");
}

export const listClaimsForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof listSchema>) => listSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId, data.org_id);

    let q = supabase
      .from("expense_claims")
      .select(
        "id, claim_number, title, description, amount, currency, category, status, receipt_url, rejection_reason, submitted_by, submitted_at, reviewed_at, approved_at, created_at, batch_id",
      )
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw error;

    // Fetch submitter names in one round-trip so the UI can show who filed each claim.
    const ids = Array.from(
      new Set((rows ?? []).map((r: { submitted_by: string | null }) => r.submitted_by).filter(Boolean)),
    ) as string[];
    let profiles: Record<string, { full_name: string | null }> = {};
    if (ids.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      profiles = Object.fromEntries(
        (ps ?? []).map((p) => [p.id, { full_name: p.full_name ?? null }]),
      );
    }
    return (rows ?? []).map((r: { submitted_by: string | null }) => ({
      ...r,
      submitter: r.submitted_by ? profiles[r.submitted_by] ?? null : null,
    }));
  });

export const claimReviewCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { org_id: string }) => z.object({ org_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId, data.org_id);
    const counts: Record<Reviewable, number> = {
      submitted: 0,
      in_review: 0,
      approved: 0,
      rejected: 0,
      draft: 0,
    };
    // Postgrest doesn't group cheaply — run 5 tiny head-counts in parallel.
    await Promise.all(
      REVIEWABLE.map(async (s) => {
        const { count } = await supabase
          .from("expense_claims")
          .select("id", { count: "exact", head: true })
          .eq("org_id", data.org_id)
          .is("deleted_at", null)
          .eq("status", s);
        counts[s] = count ?? 0;
      }),
    );
    return counts;
  });

const decisionSchema = z.object({
  claim_id: z.string().uuid(),
  decision: z.enum(["approve", "reject", "return"]),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const decideClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof decisionSchema>) => decisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: claim, error: readErr } = await supabase
      .from("expense_claims")
      .select(
        "id, org_id, title, claim_number, amount, currency, status, submitted_by, batch_id, required_levels, current_level",
      )
      .eq("id", data.claim_id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!claim) throw new Error("claim_not_found");
    await assertReviewer(supabase, userId, claim.org_id);

    if ((data.decision === "reject" || data.decision === "return") && !data.reason?.trim()) {
      throw new Error("reason_required");
    }

    // Multi-level flow: each approve moves the claim through one sign-off level;
    // status only flips to 'approved' after the final level signs.
    const requiredLevels = Number(claim.required_levels ?? 1) || 1;
    const currentLevel = Number(claim.current_level ?? 0) || 0;
    const nextLevel = currentLevel + 1;
    const now = new Date().toISOString();

    let template: string;
    let event_key: string;
    let nextStatus: "approved" | "rejected" | "draft" | "in_review";
    const patch: Record<string, unknown> = {
      reviewed_by: userId,
      reviewed_at: now,
    };

    if (data.decision === "approve") {
      const willFinalize = nextLevel >= requiredLevels;
      nextStatus = willFinalize ? "approved" : "in_review";
      patch.status = nextStatus;
      patch.current_level = nextLevel;
      if (willFinalize) {
        patch.approved_at = now;
        patch.rejection_reason = null;
      }
      template = willFinalize ? "expense_claim_approved" : "expense_claim_level_signed";
      event_key = template;
    } else if (data.decision === "reject") {
      nextStatus = "rejected";
      patch.status = "rejected";
      patch.rejection_reason = data.reason ?? null;
      template = "expense_claim_rejected";
      event_key = template;
    } else {
      nextStatus = "draft";
      patch.status = "draft";
      patch.submitted_at = null;
      patch.approved_at = null;
      patch.current_level = 0;
      patch.rejection_reason = data.reason ?? null;
      template = "expense_claim_returned";
      event_key = template;
    }

    // Record this sign-off in the multi-level ledger. UPSERT keeps the seeded
    // row's UNIQUE (claim_id, level) intact if the trigger already inserted it,
    // and creates it if the claim predates the trigger.
    {
      const level =
        data.decision === "approve"
          ? nextLevel
          : Math.max(1, Math.min(requiredLevels, nextLevel));
      const requiredRole =
        level === 1 ? "manager" : level === 2 ? "finance" : level === 3 ? "owner" : "admin";
      const { error: signErr } = await supabase
        .from("expense_claim_approvals")
        .upsert(
          {
            org_id: claim.org_id,
            claim_id: claim.id,
            level,
            required_role: requiredRole,
            decided_by: userId,
            decision: data.decision,
            reason: data.reason ?? null,
            decided_at: now,
          },
          { onConflict: "claim_id,level" },
        );
      if (signErr) throw signErr;
    }

    const { error: upErr } = await supabase
      .from("expense_claims")
      // Cast: patch is a partial with mixed types (status, level, nullable fields)
      // that Postgrest's generated Update type narrows too aggressively.
      .update(patch as never)
      .eq("id", data.claim_id);
    if (upErr) throw upErr;


    if (claim.submitted_by) {
      try {
        await enqueueNotification({
          data: {
            org_id: claim.org_id,
            channel: "email",
            template,
            event_key,
            recipient_user_id: claim.submitted_by,
            idempotency_key: `${event_key}:${claim.id}:${now}`,
            variables: {
              claim_number: claim.claim_number ?? "",
              title: claim.title ?? "",
              amount: claim.amount ?? 0,
              currency: claim.currency ?? "SAR",
              reason: data.reason ?? "",
              level: patch.current_level ?? nextLevel,
              required_levels: requiredLevels,
              reference_type: "expense_claim",
              reference_id: claim.id,
            },
            dispatch_now: false,
          },
        });
      } catch {
        /* notifications must not block the decision */
      }
    }
    return {
      ok: true,
      status: nextStatus,
      current_level: (patch.current_level as number) ?? currentLevel,
      required_levels: requiredLevels,
    };
  });
