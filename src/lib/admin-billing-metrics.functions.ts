import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

export type BillingSeriesRow = {
  month_start: string;
  revenue: number;
  paying_orgs: number;
  new_paying_orgs: number;
  churned_orgs: number;
};

export type BillingMetrics = {
  generated_at: string;
  data_refreshed_at: string | null;
  refresh_interval_minutes: number;
  currency: string;
  package_id: string | null;
  mrr_current: number;
  mrr_previous: number;
  mrr_growth_pct: number | null;
  paying_orgs_current: number;
  paying_orgs_previous: number;
  new_paying_orgs_current: number;
  churned_orgs_current: number;
  churn_rate_pct: number;
  arpu: number;
  ltv: number | null;
  total_orgs: number;
  paying_orgs_lifetime: number;
  trial_cohort: number;
  trial_converted: number;
  trial_conversion_pct: number;
  series: BillingSeriesRow[];
};

const inputSchema = z.object({
  months: z.number().int().min(1).max(36).default(12),
  packageId: z.string().uuid().nullable().optional().default(null),
});

export const getBillingMetrics = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((d: unknown) => inputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("admin_billing_metrics", {
      _months: data.months,
      _package_id: data.packageId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return row as unknown as BillingMetrics;
  });

export const getBillingSeries = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((d: unknown) => inputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("admin_billing_series", {
      _months: data.months,
      _package_id: data.packageId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as BillingSeriesRow[];
  });

export type AdminPackage = { id: string; code: string; name: string; active: boolean };

export const listAdminPackages = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_packages");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AdminPackage[];
  });

export type ChurnedOrgRow = {
  month_start: string;
  org_id: string;
  org_name: string;
  last_payment_at: string;
  last_amount: number;
  tenure_months: number;
};

export type TrialOrgRow = {
  org_id: string;
  org_name: string;
  created_at: string;
  cohort_month: string;
  converted: boolean;
  first_payment_at: string | null;
  first_amount: number | null;
};

const drillInputSchema = z.object({
  months: z.number().int().min(1).max(36).default(12),
  packageId: z.string().uuid().nullable().optional().default(null),
});

export const getChurnedOrgs = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((d: unknown) => drillInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("admin_billing_churned_orgs", {
      _months: data.months,
      _package_id: data.packageId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChurnedOrgRow[];
  });

export const getTrialOrgs = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((d: unknown) => drillInputSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("admin_billing_trial_orgs", {
      _days_min: 14,
      _days_max: 90,
      _package_id: data.packageId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as TrialOrgRow[];
  });
