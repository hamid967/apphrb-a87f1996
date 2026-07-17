import { createServerFn } from "@tanstack/react-start";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();
    const in7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();

    // Phase 4: 16 KPI counters collapsed into one pre-aggregated MV row.
    // Remaining queries are lists/series that need row-level detail.
    const [
      overview,
      recentAudit,
      recentLogins,
      activityByDay,
      planDist,
      expiringSoon,
      newCompanies12m,
      revenue12m,
    ] = await Promise.all([
      supabaseAdmin.rpc("get_admin_overview"),
      supabaseAdmin
        .from("audit_log")
        .select("id, entity, action, actor, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabaseAdmin
        .from("login_events")
        .select("id, email, status, ip_address, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin.from("audit_log").select("created_at").gte("created_at", since7d).limit(5000),
      supabaseAdmin
        .from("subscriptions")
        .select("package_id, packages(name, code)")
        .eq("status", "active")
        .is("deleted_at", null)
        .limit(5000),
      supabaseAdmin
        .from("subscriptions")
        .select("id, org_id, end_date, organizations(name)")
        .eq("status", "active")
        .is("deleted_at", null)
        .gte("end_date", today)
        .lte("end_date", in7d)
        .order("end_date", { ascending: true })
        .limit(20),
      supabaseAdmin
        .from("organizations")
        .select("created_at")
        .gte("created_at", twelveMonthsAgo)
        .limit(5000),
      supabaseAdmin
        .from("subscription_payments")
        .select("amount, reviewed_at")
        .eq("status", "approved")
        .gte("reviewed_at", twelveMonthsAgo)
        .limit(5000),
    ]);

    const ov = (overview.data ?? {}) as {
      users_total?: number; users_pending?: number; orgs_total?: number;
      active_contracts?: number; login_success_24h?: number; login_failed_24h?: number;
      events_24h?: number; active_subs?: number; trial_subs?: number;
      pending_receipts?: number; pending_subs?: number; pending_invites?: number;
      rejected_subs_24h?: number; mrr?: number; revenue_month?: number; revenue_year?: number;
    };


    // Bucketize activity by day (last 7 days)
    const buckets = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const row of (activityByDay.data ?? []) as { created_at: string }[]) {
      const k = row.created_at.slice(0, 10);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    const series = Array.from(buckets.entries()).map(([d, v]) => ({ d, v }));

    // MRR from active subscriptions (yearly billed → /12)
    const mrr = (activeSubsForMrr.data ?? []).reduce(
      (sum, s: { amount: number | null; billing_cycle: string | null }) => {
        const amt = Number(s.amount ?? 0);
        const monthly = s.billing_cycle === "yearly" ? amt / 12 : amt;
        return sum + monthly;
      },
      0,
    );

    const sumAmount = (rows: Array<{ amount: number | null }> | null) =>
      (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // Plan distribution
    const planMap = new Map<string, number>();
    for (const row of (planDist.data ?? []) as Array<{
      package_id: string | null;
      packages: { name: string | null; code: string | null } | null;
    }>) {
      const label = row.packages?.name ?? row.packages?.code ?? "—";
      planMap.set(label, (planMap.get(label) ?? 0) + 1);
    }
    const planDistribution = Array.from(planMap.entries()).map(([name, value]) => ({
      name,
      value,
    }));

    // 12-month buckets
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthBuckets = () => {
      const m = new Map<string, number>();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        m.set(monthKey(d), 0);
      }
      return m;
    };
    const companiesMonthly = monthBuckets();
    for (const row of (newCompanies12m.data ?? []) as { created_at: string }[]) {
      const k = monthKey(new Date(row.created_at));
      if (companiesMonthly.has(k)) companiesMonthly.set(k, (companiesMonthly.get(k) ?? 0) + 1);
    }
    const revenueMonthly = monthBuckets();
    for (const row of (revenue12m.data ?? []) as {
      amount: number | null;
      reviewed_at: string | null;
    }[]) {
      if (!row.reviewed_at) continue;
      const k = monthKey(new Date(row.reviewed_at));
      if (revenueMonthly.has(k))
        revenueMonthly.set(k, (revenueMonthly.get(k) ?? 0) + Number(row.amount ?? 0));
    }
    const newCompaniesSeries = Array.from(companiesMonthly.entries()).map(([m, v]) => ({ m, v }));
    const revenueSeries = Array.from(revenueMonthly.entries()).map(([m, v]) => ({ m, v }));

    return {
      kpis: {
        users: profilesTotal.count ?? 0,
        pending: profilesPending.count ?? 0,
        orgs: orgsTotal.count ?? 0,
        activeContracts: contractsActive.count ?? 0,
        loginSuccess24h: loginSuccess24h.count ?? 0,
        loginFailed24h: loginFailed24h.count ?? 0,
        events24h: events24h.count ?? 0,
        activeSubs: activeSubs.count ?? 0,
        trialSubs: trialSubs.count ?? 0,
        pendingReceipts: pendingReceipts.count ?? 0,
        mrr: Math.round(mrr),
        revenueMonth: Math.round(sumAmount(revenueMonth.data)),
        revenueYear: Math.round(sumAmount(revenueYear.data)),
        pendingSubs: pendingSubs.count ?? 0,
        pendingInvites: pendingInvites.count ?? 0,
        rejectedSubs24h: rejectedSubs24h.count ?? 0,
      },
      recentAudit: (recentAudit.data ?? []) as Array<{
        id: string;
        entity: string;
        action: string;
        actor: string | null;
        created_at: string;
      }>,
      recentLogins: (recentLogins.data ?? []) as Array<{
        id: string;
        email: string | null;
        status: string;
        ip_address: string | null;
        created_at: string;
      }>,
      activity: series,
      planDistribution,
      newCompanies: newCompaniesSeries,
      revenueMonthly: revenueSeries,
      expiringSoon: (expiringSoon.data ?? []) as Array<{
        id: string;
        org_id: string;
        end_date: string;
        organizations: { name: string | null } | null;
      }>,
      generatedAt: new Date().toISOString(),
    };
  });
