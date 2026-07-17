import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type LimitKind = "property" | "unit" | "member" | "export";

type PlanRow = {
  code: string;
  name_ar: string;
  monthly_price: number;
  yearly_price: number | null;
  property_limit: number | null;
  unit_limit: number | null;
  user_limit: number | null;
  export_limit_monthly: number | null;
  unlimited_units: boolean;
  unlimited_properties: boolean;
  unlimited_exports: boolean;
  includes_all_pdf_templates: boolean;
  includes_budgets: boolean;
  includes_recurring_expenses: boolean;
  includes_tax_summary: boolean;
  priority_support: boolean;
};

type UsageCounts = {
  properties: number;
  units: number;
  members: number;
  exportsThisMonth: number;
};

type LimitDecision = {
  allowed: boolean;
  kind: LimitKind;
  title: string;
  message: string;
  plan?: PlanRow | null;
};

const freeFallback: PlanRow = {
  code: "free",
  name_ar: "مجاني",
  monthly_price: 0,
  yearly_price: null,
  property_limit: 1,
  unit_limit: 5,
  user_limit: 1,
  export_limit_monthly: 10,
  unlimited_units: false,
  unlimited_properties: false,
  unlimited_exports: false,
  includes_all_pdf_templates: false,
  includes_budgets: false,
  includes_recurring_expenses: false,
  includes_tax_summary: false,
  priority_support: false,
};

export function usePlanLimits() {
  const [upgradeReason, setUpgradeReason] = useState<LimitDecision | null>(null);

  const query = useQuery({
    queryKey: ["plan-limits"],
    staleTime: 60_000,
    queryFn: async () => {
      const db = supabase as any;
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const userId = userData.user?.id;
      if (!userId) return { plan: freeFallback, usage: emptyUsage(), accountId: null, trialActive: false };

      const { data: membership } = await db
        .from("account_members")
        .select("account_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const accountId = membership?.account_id ?? null;
      if (!accountId) return { plan: freeFallback, usage: emptyUsage(), accountId: null, trialActive: false };

      const { data: account } = await db
        .from("accounts")
        .select("id, plan_id, trial_ends_at, plan_expires_at")
        .eq("id", accountId)
        .maybeSingle();

      const trialActive = Boolean(account?.trial_ends_at && new Date(account.trial_ends_at).getTime() > Date.now());

      const { data: planData } = account?.plan_id
        ? await db.from("plans").select("*").eq("id", account.plan_id).maybeSingle()
        : await db.from("plans").select("*").eq("code", "free").maybeSingle();

      const usage = await readUsageCounts(db, accountId);
      return { plan: (trialActive ? await readPlanByCode(db, "pro_individual") : planData) ?? freeFallback, usage, accountId, trialActive };
    },
  });

  const state = query.data ?? { plan: freeFallback, usage: emptyUsage(), accountId: null, trialActive: false };

  const checkLimit = useCallback(
    (kind: LimitKind): LimitDecision => {
      const decision = buildDecision(kind, state.plan, state.usage);
      if (!decision.allowed) setUpgradeReason(decision);
      return decision;
    },
    [state.plan, state.usage],
  );

  return useMemo(
    () => ({
      ...state,
      isLoading: query.isLoading,
      error: query.error,
      checkLimit,
      upgradeReason,
      clearUpgradeReason: () => setUpgradeReason(null),
      canCreateProperty: () => checkLimit("property").allowed,
      canCreateUnit: () => checkLimit("unit").allowed,
      canInviteMember: () => checkLimit("member").allowed,
      canExportPdf: () => checkLimit("export").allowed,
    }),
    [checkLimit, query.error, query.isLoading, state, upgradeReason],
  );
}

function emptyUsage(): UsageCounts {
  return { properties: 0, units: 0, members: 0, exportsThisMonth: 0 };
}

async function readUsageCounts(db: any, accountId: string): Promise<UsageCounts> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [properties, units, members, exports] = await Promise.all([
    db.from("properties").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    db.from("units").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    db.from("account_members").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    db.from("export_logs").select("id", { count: "exact", head: true }).eq("account_id", accountId).gte("created_at", monthStart.toISOString()),
  ]);

  return {
    properties: properties.count ?? 0,
    units: units.count ?? 0,
    members: members.count ?? 0,
    exportsThisMonth: exports.count ?? 0,
  };
}

async function readPlanByCode(db: any, code: string): Promise<PlanRow | null> {
  const { data } = await db.from("plans").select("*").eq("code", code).maybeSingle();
  return data ?? null;
}

function buildDecision(kind: LimitKind, plan: PlanRow | null, usage: UsageCounts): LimitDecision {
  const activePlan = plan ?? freeFallback;
  if (kind === "property" && !activePlan.unlimited_properties && limitReached(usage.properties, activePlan.property_limit)) {
    return blocked(kind, activePlan, "وصلت إلى حد العقارات", "باقتك الحالية لا تسمح بإضافة عقار جديد. قم بالترقية لزيادة الحد.");
  }
  if (kind === "unit" && !activePlan.unlimited_units && limitReached(usage.units, activePlan.unit_limit)) {
    return blocked(kind, activePlan, "وصلت إلى حد الوحدات", "باقتك الحالية لا تسمح بإضافة وحدة جديدة. قم بالترقية لفتح وحدات أكثر.");
  }
  if (kind === "member" && limitReached(usage.members, activePlan.user_limit)) {
    return blocked(kind, activePlan, "وصلت إلى حد المستخدمين", "باقتك الحالية لا تسمح بدعوة مستخدم إضافي. باقة المنشآت تدعم الفريق والأدوار.");
  }
  if (kind === "export" && !activePlan.unlimited_exports && limitReached(usage.exportsThisMonth, activePlan.export_limit_monthly)) {
    return blocked(kind, activePlan, "وصلت إلى حد التصدير الشهري", "باقتك الحالية وصلت إلى حد ملفات PDF لهذا الشهر. قم بالترقية للتصدير غير المحدود.");
  }
  return { allowed: true, kind, title: "مسموح", message: "ضمن حدود الباقة.", plan: activePlan };
}

function limitReached(current: number, limit: number | null) {
  return typeof limit === "number" && current >= limit;
}

function blocked(kind: LimitKind, plan: PlanRow, title: string, message: string): LimitDecision {
  return { allowed: false, kind, title, message, plan };
}
