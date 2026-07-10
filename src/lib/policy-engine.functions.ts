import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Policy engine — evaluates spending policies (max_amount, requires_receipt,
 * requires_description, forbidden_keywords, max_per_period) against a claim
 * without inserting anything. Mirrors the server-side trigger
 * `tg_check_spending_policy` so employees see violation reasons *before* they
 * submit; the trigger still runs on insert/update so persisted violations
 * stay authoritative.
 */

const dryRunSchema = z.object({
  org_id: z.string().uuid(),
  amount: z.number().nonnegative().max(10_000_000),
  category: z.string().trim().min(1).max(40),
  currency: z.string().trim().length(3).default("SAR"),
  title: z.string().trim().max(200).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  has_receipt: z.boolean().default(false),
});

export type PolicyViolationDryRun = {
  policy_id: string;
  rule_type: string;
  severity: "warn" | "block";
  category: string;
  reason_en: string;
  reason_ar: string;
  amount: number;
  limit_amount: number | null;
  currency: string;
};

/**
 * Shared single-policy evaluator. Used both by evaluatePolicyDryRun (against
 * saved policies) and evaluateDraftPolicy (against an unsaved draft). Keeping
 * this in one place guarantees the tester in the admin UI matches production.
 */
type PolicyLike = {
  rule_type: string;
  severity: string | null;
  max_amount: number | string | null;
  keywords: string[] | null;
  period_days: number | null;
  currency: string | null;
};
type ClaimInput = {
  amount: number;
  category: string;
  currency: string;
  title: string;
  description: string;
  has_receipt: boolean;
};
async function evaluateOnePolicy(
  p: PolicyLike,
  claim: ClaimInput,
  ctx: {
    countPriorSum: (days: number) => Promise<number>;
  },
): Promise<{ reason_en: string; reason_ar: string; limit_amount: number | null; currency: string } | null> {
  const cat = claim.category || "general";
  const cap = p.max_amount != null ? Number(p.max_amount) : null;
  const cur = p.currency || claim.currency;

  if (p.rule_type === "max_amount" && cap != null && claim.amount > cap) {
    return {
      reason_en: `Amount ${claim.amount} ${cur} exceeds the ${cap} ${cur} cap for ${cat}.`,
      reason_ar: `المبلغ ${claim.amount} ${cur} يتجاوز الحد ${cap} ${cur} لفئة ${cat}.`,
      limit_amount: cap,
      currency: cur,
    };
  }
  if (p.rule_type === "requires_receipt" && !claim.has_receipt) {
    return {
      reason_en: `A receipt is required for ${cat} claims.`,
      reason_ar: `الإيصال مطلوب لمطالبات ${cat}.`,
      limit_amount: cap,
      currency: cur,
    };
  }
  if (p.rule_type === "requires_description" && claim.description.trim().length < 4) {
    return {
      reason_en: `A description is required for ${cat} claims.`,
      reason_ar: `الوصف مطلوب لمطالبات ${cat}.`,
      limit_amount: cap,
      currency: cur,
    };
  }
  if (p.rule_type === "forbidden_keywords" && Array.isArray(p.keywords) && p.keywords.length > 0) {
    const hay = `${claim.title} ${claim.description}`.toLowerCase();
    for (const kw of p.keywords) {
      if (kw && hay.includes(String(kw).toLowerCase())) {
        return {
          reason_en: `Contains a forbidden keyword: "${kw}".`,
          reason_ar: `يحتوي على كلمة ممنوعة: "${kw}".`,
          limit_amount: cap,
          currency: cur,
        };
      }
    }
  }
  if (p.rule_type === "max_per_period" && cap != null && (p.period_days ?? 30) > 0) {
    const days = p.period_days ?? 30;
    const prior = await ctx.countPriorSum(days);
    const sum = prior + claim.amount;
    if (sum > cap) {
      return {
        reason_en: `Rolling ${days}-day total ${sum} ${cur} exceeds the ${cap} ${cur} cap for ${cat}.`,
        reason_ar: `إجمالي آخر ${days} يوماً ${sum} ${cur} يتجاوز الحد ${cap} ${cur} لفئة ${cat}.`,
        limit_amount: cap,
        currency: cur,
      };
    }
  }
  return null;
}

export const evaluatePolicyDryRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof dryRunSchema>) => dryRunSchema.parse(d))
  .handler(async ({ data, context }): Promise<PolicyViolationDryRun[]> => {
    const { supabase, userId } = context;
    const cat = data.category || "general";
    const { data: policies, error } = await supabase
      .from("spending_policies")
      .select(
        "id, rule_type, severity, category, max_amount, keywords, period_days, currency",
      )
      .eq("org_id", data.org_id)
      .eq("active", true)
      .in("category", [cat, "general", "*"]);
    if (error) throw error;

    const out: PolicyViolationDryRun[] = [];
    for (const p of policies ?? []) {
      const claim: ClaimInput = {
        amount: data.amount,
        category: cat,
        currency: data.currency,
        title: data.title,
        description: data.description,
        has_receipt: data.has_receipt,
      };
      const hit = await evaluateOnePolicy(p, claim, {
        countPriorSum: async (days) => {
          const from = new Date(Date.now() - days * 86_400_000).toISOString();
          const { data: prior } = await supabase
            .from("expense_claims")
            .select("amount")
            .eq("org_id", data.org_id)
            .eq("submitted_by", userId)
            .eq("category", cat)
            .is("deleted_at", null)
            .neq("status", "rejected")
            .gte("created_at", from);
          return (prior ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
        },
      });
      if (hit) {
        out.push({
          policy_id: p.id,
          rule_type: p.rule_type,
          severity: (p.severity === "block" ? "block" : "warn") as "warn" | "block",
          category: cat,
          reason_en: hit.reason_en,
          reason_ar: hit.reason_ar,
          amount: data.amount,
          limit_amount: hit.limit_amount,
          currency: hit.currency,
        });
      }
    }
    return out;
  });

// ── Draft evaluation (used by the admin tester before a policy is saved) ──
const draftSchema = z.object({
  org_id: z.string().uuid(),
  policy: z.object({
    rule_type: z.enum([
      "max_amount",
      "requires_receipt",
      "requires_description",
      "forbidden_keywords",
      "max_per_period",
    ]),
    severity: z.enum(["warn", "block"]),
    max_amount: z.number().nullable(),
    keywords: z.array(z.string()).default([]),
    period_days: z.number().int().positive().nullable(),
    currency: z.string().length(3),
    category: z.string().min(1),
  }),
  claim: z.object({
    amount: z.number().nonnegative().max(10_000_000),
    category: z.string().min(1),
    currency: z.string().length(3).default("SAR"),
    title: z.string().max(200).default(""),
    description: z.string().max(2000).default(""),
    has_receipt: z.boolean().default(false),
  }),
});

export type DraftEvalResult = {
  applies: boolean;
  pass: boolean;
  severity: "warn" | "block";
  reason_en: string;
  reason_ar: string;
  limit_amount: number | null;
  currency: string;
};

export const evaluateDraftPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof draftSchema>) => draftSchema.parse(d))
  .handler(async ({ data, context }): Promise<DraftEvalResult> => {
    const { supabase, userId } = context;
    const { policy, claim } = data;
    const cat = claim.category || "general";
    // Scope matches the SELECT filter in evaluatePolicyDryRun exactly.
    const applies = [cat, "general", "*"].includes(policy.category);
    if (!applies) {
      return {
        applies: false,
        pass: true,
        severity: policy.severity,
        reason_en: `Rule scope "${policy.category}" does not apply to category "${cat}".`,
        reason_ar: `نطاق القاعدة "${policy.category}" لا ينطبق على فئة "${cat}".`,
        limit_amount: policy.max_amount,
        currency: policy.currency,
      };
    }
    const hit = await evaluateOnePolicy(
      {
        rule_type: policy.rule_type,
        severity: policy.severity,
        max_amount: policy.max_amount,
        keywords: policy.keywords,
        period_days: policy.period_days,
        currency: policy.currency,
      },
      { ...claim, category: cat },
      {
        countPriorSum: async (days) => {
          const from = new Date(Date.now() - days * 86_400_000).toISOString();
          const { data: prior } = await supabase
            .from("expense_claims")
            .select("amount")
            .eq("org_id", data.org_id)
            .eq("submitted_by", userId)
            .eq("category", cat)
            .is("deleted_at", null)
            .neq("status", "rejected")
            .gte("created_at", from);
          return (prior ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
        },
      },
    );
    if (hit) {
      return {
        applies: true,
        pass: false,
        severity: policy.severity,
        reason_en: hit.reason_en,
        reason_ar: hit.reason_ar,
        limit_amount: hit.limit_amount,
        currency: hit.currency,
      };
    }
    return {
      applies: true,
      pass: true,
      severity: policy.severity,
      reason_en: `Claim satisfies this ${policy.rule_type} rule.`,
      reason_ar: `المطالبة تفي بهذه القاعدة (${policy.rule_type}).`,
      limit_amount: policy.max_amount,
      currency: policy.currency,
    };
  });

const listSchema = z.object({
  claim_ids: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * Loads persisted policy_violations for a set of claims. RLS ensures only
 * org members (employee + admins) see them, so the same fn feeds both the
 * submitter's own view and the batch approver view.
 */
export const listPolicyViolationsForClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof listSchema>) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("policy_violations")
      .select(
        "id, claim_id, rule_type, severity, category, reason, amount, limit_amount, currency, created_at",
      )
      .in("claim_id", data.claim_ids)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

// ── Single-claim view (violation + policy metadata + linked receipt) ──
const oneClaimSchema = z.object({ claim_id: z.string().uuid() });

export type ClaimViolationRow = {
  id: string;
  claim_id: string;
  rule_type: string;
  severity: string;
  category: string | null;
  reason: string;
  amount: number | string | null;
  limit_amount: number | string | null;
  currency: string | null;
  created_at: string;
  overridden_by: string | null;
  override_reason: string | null;
  overridden_at: string | null;
  override_by_name: string | null;
  policy: {
    id: string;
    category: string;
    rule_type: string;
    note: string | null;
    max_amount: number | string | null;
    period_days: number | null;
    keywords: string[] | null;
  } | null;
};

export type ClaimViolationsPayload = {
  claim: {
    id: string;
    claim_number: string | null;
    title: string | null;
    receipt_url: string | null;
    amount: number | string;
    currency: string | null;
    org_id: string;
  } | null;
  violations: ClaimViolationRow[];
  can_override: boolean;
};

async function isOrgAdmin(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const [{ data: isAdmin }, { data: isSuper }, { data: isOrgAdmin }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_org_role", {
      _org: orgId,
      _user: userId,
      _roles: ["owner", "admin"],
    }),
  ]);
  return Boolean(isAdmin || isSuper || isOrgAdmin);
}

/**
 * Loads all policy_violations for a single claim, joined with the originating
 * spending_policies row (so the UI can show a human-readable policy name/note),
 * plus the claim header (for the linked receipt/document). Scoped by RLS.
 */
export const listPolicyViolationsForClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof oneClaimSchema>) => oneClaimSchema.parse(d))
  .handler(async ({ data, context }): Promise<ClaimViolationsPayload> => {
    const { supabase, userId } = context;

    const [{ data: claim, error: cErr }, { data: rows, error: vErr }] = await Promise.all([
      supabase
        .from("expense_claims")
        .select("id, claim_number, title, receipt_url, amount, currency, org_id")
        .eq("id", data.claim_id)
        .maybeSingle(),
      supabase
        .from("policy_violations")
        .select(
          "id, claim_id, rule_type, severity, category, reason, amount, limit_amount, currency, created_at, overridden_by, override_reason, overridden_at, policy:spending_policies(id, category, rule_type, note, max_amount, period_days, keywords)",
        )
        .eq("claim_id", data.claim_id)
        .order("created_at", { ascending: true }),
    ]);
    if (cErr) throw cErr;
    if (vErr) throw vErr;

    const orgId = (claim as { org_id?: string } | null)?.org_id;
    const canOverride = orgId ? await isOrgAdmin(supabase, userId, orgId) : false;

    // Resolve overrider display names via profiles (no direct FK).
    const overriderIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r: Record<string, unknown>) => r.overridden_by as string | null)
          .filter((v): v is string => Boolean(v)),
      ),
    );
    const nameById = new Map<string, string>();
    if (overriderIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", overriderIds);
      for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
        if (p.full_name) nameById.set(p.id, p.full_name);
      }
    }

    const mapped: ClaimViolationRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      ...(r as unknown as Omit<ClaimViolationRow, "override_by_name">),
      override_by_name: r.overridden_by ? (nameById.get(r.overridden_by as string) ?? null) : null,
    }));

    return {
      claim: (claim ?? null) as ClaimViolationsPayload["claim"],
      violations: mapped,
      can_override: canOverride,
    };
  });

// ── Admin override actions ──
const overrideSchema = z.object({
  violation_id: z.string().uuid(),
  reason: z.string().trim().min(4).max(500),
});
const clearOverrideSchema = z.object({ violation_id: z.string().uuid() });

/**
 * Admin override: marks a violation as accepted with a documented reason.
 * Records overridden_by (auth.uid), override_reason, overridden_at, and
 * writes an audit_log entry so the decision is traceable. Overridden rows
 * survive trigger re-evaluations.
 */
export const overrideClaimPolicyViolation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof overrideSchema>) => overrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: rErr } = await supabase
      .from("policy_violations")
      .select("id, org_id, claim_id, rule_type, severity, reason")
      .eq("id", data.violation_id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw new Error("not_found");
    if (!(await isOrgAdmin(supabase, userId, row.org_id))) throw new Error("forbidden");

    const { error: uErr } = await supabase
      .from("policy_violations")
      .update({
        overridden_by: userId,
        override_reason: data.reason,
        overridden_at: new Date().toISOString(),
      })
      .eq("id", data.violation_id);
    if (uErr) throw uErr;

    await supabase.from("audit_log").insert({
      entity: "policy_violations",
      entity_id: data.violation_id,
      actor: userId,
      action: "POLICY_VIOLATION_OVERRIDE",
      diff: {
        claim_id: row.claim_id,
        rule_type: row.rule_type,
        severity: row.severity,
        original_reason: row.reason,
        override_reason: data.reason,
      },
    });

    return { ok: true as const };
  });

/**
 * Reverts an override so the violation is treated as active again. Same
 * admin gate; recorded in audit_log for traceability.
 */
export const clearClaimPolicyViolationOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof clearOverrideSchema>) => clearOverrideSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: rErr } = await supabase
      .from("policy_violations")
      .select("id, org_id, claim_id, override_reason")
      .eq("id", data.violation_id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!row) throw new Error("not_found");
    if (!(await isOrgAdmin(supabase, userId, row.org_id))) throw new Error("forbidden");

    const { error: uErr } = await supabase
      .from("policy_violations")
      .update({ overridden_by: null, override_reason: null, overridden_at: null })
      .eq("id", data.violation_id);
    if (uErr) throw uErr;

    await supabase.from("audit_log").insert({
      entity: "policy_violations",
      entity_id: data.violation_id,
      actor: userId,
      action: "POLICY_VIOLATION_OVERRIDE_CLEARED",
      diff: { claim_id: row.claim_id, prior_reason: row.override_reason },
    });

    return { ok: true as const };
  });

