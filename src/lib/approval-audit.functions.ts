import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Approval audit trail — reads public.audit_log rows written by the
 * `tg_audit_row` trigger on expense_claims / expense_batches and turns
 * status transitions into a human-friendly timeline (who approved /
 * rejected / returned / submitted, when, with which reason).
 *
 * Audit log RLS is narrow (finance/manager/super_admin only), so we
 * authorise the caller as an org reviewer here and then read via the
 * service-role client — the audit trail must be visible to the same
 * users who can see the decision UI.
 */

const ENTITIES = ["expense_claims", "expense_batches"] as const;
type Entity = (typeof ENTITIES)[number];

const schema = z.object({
  entity: z.enum(ENTITIES),
  entity_id: z.string().uuid(),
});

export type ApprovalAuditEvent = {
  id: string;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action:
    | "created"
    | "submitted"
    | "approved"
    | "rejected"
    | "returned"
    | "updated"
    | "deleted";
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
};

// deno-lint-ignore no-explicit-any
async function assertReviewer(supabase: any, userId: string, orgId: string) {
  const [{ data: isAdmin }, { data: isSuper }, { data: isOrgAdmin }] =
    await Promise.all([
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

export const getApprovalAuditTrail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof schema>) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve org_id for authorisation via the RLS-scoped client so a
    // caller can't probe rows they can't already see.
    const { data: row, error: rowErr } = await supabase
      .from(data.entity)
      .select("id, org_id")
      .eq("id", data.entity_id)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) throw new Error("not_found");
    await assertReviewer(supabase, userId, row.org_id as string);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("audit_log")
      .select("id, actor, action, diff, created_at")
      .eq("entity", data.entity as Entity)
      .eq("entity_id", data.entity_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw error;

    const actorIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.actor as string | null)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    let profiles: Record<string, { full_name: string | null }> = {};
    if (actorIds.length) {
      const { data: ps } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      profiles = Object.fromEntries(
        (ps ?? []).map((p) => [p.id as string, { full_name: p.full_name ?? null }]),
      );
    }

    const events: ApprovalAuditEvent[] = [];
    for (const r of rows ?? []) {
      const diff = (r.diff ?? {}) as {
        before?: Record<string, unknown> | null;
        after?: Record<string, unknown> | null;
        org_role?: string | null;
        app_roles?: string[] | null;
      };
      const before = diff.before ?? null;
      const after = diff.after ?? null;
      const fromStatus = (before?.status as string | undefined) ?? null;
      const toStatus = (after?.status as string | undefined) ?? null;
      const reason =
        (after?.rejection_reason as string | undefined) ??
        (before?.rejection_reason as string | undefined) ??
        null;

      let action: ApprovalAuditEvent["action"];
      if (r.action === "INSERT") {
        action = toStatus === "submitted" ? "submitted" : "created";
      } else if (r.action === "DELETE") {
        action = "deleted";
      } else if (fromStatus !== toStatus) {
        if (toStatus === "approved") action = "approved";
        else if (toStatus === "rejected") action = "rejected";
        else if (toStatus === "submitted") action = "submitted";
        else if (
          (fromStatus === "submitted" || fromStatus === "in_review") &&
          toStatus === "draft"
        )
          action = "returned";
        else action = "updated";
      } else {
        // No status transition — skip pure edits from the audit trail.
        continue;
      }

      const roleLabel =
        diff.org_role ??
        (Array.isArray(diff.app_roles) && diff.app_roles.length
          ? diff.app_roles[0]
          : null);

      events.push({
        id: r.id as string,
        at: r.created_at as string,
        actor_id: (r.actor as string | null) ?? null,
        actor_name: r.actor ? profiles[r.actor as string]?.full_name ?? null : null,
        actor_role: roleLabel ?? null,
        action,
        from_status: fromStatus,
        to_status: toStatus,
        reason: action === "rejected" || action === "returned" ? reason : null,
      });
    }
    return events;
  });
