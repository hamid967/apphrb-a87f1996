import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type DecisionAuditKind = "subscription" | "receipt" | "user" | "invitation";
export type DecisionAuditAction = "approve" | "reject" | "revoke";

export interface DecisionAuditRow {
  id: string;
  created_at: string;
  action: string;
  kind: DecisionAuditKind | string;
  decision: DecisionAuditAction | string;
  entity: string;
  entity_id: string;
  actor: string | null;
  actor_name: string | null;
  org_id: string | null;
  org_name: string | null;
  target_user_id: string | null;
  target_email: string | null;
  reason: string | null;
  note: string | null;
  extra: Record<string, any> | null;
}

const inputSchema = z.object({
  kind: z.enum(["subscription", "receipt", "user", "invitation"]).optional(),
  decision: z.enum(["approve", "reject", "revoke"]).optional(),
  org_id: z.string().uuid().optional(),
  actor: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export interface ListDecisionAuditResult {
  rows: DecisionAuditRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export const listDecisionAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ListDecisionAuditResult> => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    // Map kind → entity (must stay in sync with decision-audit.server.ts).
    const KIND_TO_ENTITY: Record<string, string> = {
      subscription: "subscriptions",
      receipt: "subscription_payments",
      user: "profiles",
      invitation: "portal_invitations",
    };
    const ENTITY_TO_KIND: Record<string, DecisionAuditKind> = {
      subscriptions: "subscription",
      subscription_payments: "receipt",
      profiles: "user",
      portal_invitations: "invitation",
    };
    // Legacy action tokens (written directly by billing/admin fns without
    // going through logDecisionAction). Normalised to canonical decisions.
    const LEGACY_ACTION_TO_DECISION: Record<string, DecisionAuditAction> = {
      approve: "approve",
      approved: "approve",
      reject: "reject",
      rejected: "reject",
      revoke: "revoke",
      revoked: "revoke",
      refund: "revoke",
      refunded: "revoke",
    };

    const decisionEntities = Object.values(KIND_TO_ENTITY);
    const legacyActions = Object.keys(LEGACY_ACTION_TO_DECISION);

    // Two overlapping filters, OR'd together:
    //   1) action LIKE 'decision_center.%'                 (canonical writer)
    //   2) entity IN (decision entities) AND action IN (legacy tokens)
    // Restrict further by kind/decision when the caller asks for them.
    let entityFilterList = decisionEntities;
    let legacyActionList = legacyActions;
    if (data.kind) {
      entityFilterList = [KIND_TO_ENTITY[data.kind]];
    }
    if (data.decision) {
      legacyActionList = legacyActions.filter(
        (a) => LEGACY_ACTION_TO_DECISION[a] === data.decision,
      );
    }

    let canonicalPattern = "decision_center.%";
    if (data.kind && data.decision) canonicalPattern = `decision_center.${data.kind}.${data.decision}`;
    else if (data.kind) canonicalPattern = `decision_center.${data.kind}.%`;
    else if (data.decision) canonicalPattern = `decision_center.%.${data.decision}`;

    const legacyInList = legacyActionList.map((a) => `"${a}"`).join(",");
    const entityInList = entityFilterList.map((e) => `"${e}"`).join(",");
    const orFilter = legacyActionList.length && entityFilterList.length
      ? `action.like.${canonicalPattern},and(entity.in.(${entityInList}),action.in.(${legacyInList}))`
      : `action.like.${canonicalPattern}`;

    let q = supabaseAdmin
      .from("audit_log")
      .select("id, created_at, action, entity, entity_id, actor, diff", { count: "exact" })
      .or(orFilter)
      .order("created_at", { ascending: data.sort === "oldest" })
      .range(from, to);

    if (data.actor) q = q.eq("actor", data.actor);
    if (data.org_id) {
      // org_id may live either at diff.org_id (canonical writer) or in the
      // diff.after / diff.before payload (legacy trigger writes). Match both.
      q = q.or(
        `diff->>org_id.eq.${data.org_id},diff->after->>org_id.eq.${data.org_id},diff->before->>org_id.eq.${data.org_id}`,
      );
    }
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error, count } = await q;
    if (error) throw error;

    const list = (rows ?? []) as any[];

    const pickOrgId = (diff: Record<string, any>): string | null =>
      (diff?.org_id as string | null) ??
      (diff?.after?.org_id as string | null) ??
      (diff?.before?.org_id as string | null) ??
      null;

    // Collect ids to enrich
    const orgIds = Array.from(
      new Set(list.map((r) => pickOrgId((r.diff ?? {}) as Record<string, any>)).filter(Boolean)),
    ) as string[];
    const actorIds = Array.from(new Set(list.map((r) => r.actor).filter(Boolean))) as string[];

    const [orgsRes, profilesRes] = await Promise.all([
      orgIds.length
        ? supabaseAdmin.from("organizations").select("id, name").in("id", orgIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      actorIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name").in("id", actorIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    const orgMap = new Map((orgsRes.data ?? []).map((o: any) => [o.id, o.name]));
    const nameMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name]));

    let enriched: DecisionAuditRow[] = list.map((r) => {
      const actionStr = String(r.action ?? "");
      const diff = (r.diff ?? {}) as Record<string, any>;
      let kind: DecisionAuditKind | string = "";
      let decision: DecisionAuditAction | string = "";
      if (actionStr.startsWith("decision_center.")) {
        const parts = actionStr.split(".");
        kind = (parts[1] ?? "") as DecisionAuditKind;
        decision = (parts[2] ?? "") as DecisionAuditAction;
      } else {
        kind = ENTITY_TO_KIND[r.entity] ?? r.entity ?? "";
        decision = LEGACY_ACTION_TO_DECISION[actionStr] ?? actionStr;
      }
      const org_id = pickOrgId(diff);
      return {
        id: r.id,
        created_at: r.created_at,
        action: r.action,
        kind,
        decision,
        entity: r.entity,
        entity_id: r.entity_id,
        actor: r.actor,
        actor_name: r.actor ? (nameMap.get(r.actor) ?? null) : null,
        org_id,
        org_name: org_id ? (orgMap.get(org_id) ?? null) : null,
        target_user_id:
          (diff.target_user_id as string | null) ??
          (diff.after?.user_id as string | null) ??
          (diff.before?.user_id as string | null) ??
          null,
        target_email:
          (diff.target_email as string | null) ??
          (diff.after?.email as string | null) ??
          null,
        reason:
          (diff.reason as string | null) ??
          (diff.after?.rejection_reason as string | null) ??
          null,
        note: (diff.note as string | null) ?? null,
        extra: diff,
      };
    });

    // Client-side search across org name, actor name, target email, entity_id, reason
    if (data.search) {
      const s = data.search.toLowerCase();
      enriched = enriched.filter((r) =>
        [r.org_name, r.actor_name, r.target_email, r.entity_id, r.reason, r.note]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s)),
      );
    }

    return {
      rows: enriched,
      page: data.page,
      pageSize: data.pageSize,
      total: count ?? enriched.length,
      hasMore: (count ?? 0) > to + 1,
    };
  });

// Lightweight orgs list for filter dropdown
export const listOrgsForDecisionFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw error;
    return { items: (data ?? []) as { id: string; name: string }[] };
  });

// Distinct actors who have logged a decision — for the actor filter dropdown.
export const listActorsForDecisionFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Grab the last 1000 decision rows, distinct actor ids, then enrich.
    const decisionEntities = ["subscriptions", "subscription_payments", "profiles", "portal_invitations"];
    const legacyActions = ["approve", "approved", "reject", "rejected", "revoke", "revoked", "refund", "refunded"];
    const entityIn = decisionEntities.map((e) => `"${e}"`).join(",");
    const actionIn = legacyActions.map((a) => `"${a}"`).join(",");
    const { data: rows, error } = await supabaseAdmin
      .from("audit_log")
      .select("actor")
      .or(`action.like.decision_center.%,and(entity.in.(${entityIn}),action.in.(${actionIn}))`)
      .not("actor", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean))) as string[];
    if (ids.length === 0) return { items: [] as { id: string; name: string }[] };
    const { data: profs, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    if (pErr) throw pErr;
    const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    const items = ids
      .map((id) => ({ id, name: (nameById.get(id) as string | undefined) ?? id.slice(0, 8) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { items };
  });