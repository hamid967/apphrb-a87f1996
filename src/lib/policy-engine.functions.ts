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