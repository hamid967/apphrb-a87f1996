import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PortalOverview = {
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    department: string | null;
    email: string | null;
  };
  organization: {
    id: string;
    name: string | null;
    slug: string | null;
    logo_url: string | null;
    role: string | null;
  } | null;
  subscription: {
    plan: string;
    status: string;
    trial_ends_at: string | null;
  };
  kpis: {
    requests_total: number;
    requests_pending: number;
    requests_completed: number;
    requests_rejected: number;
    employees: number;
    contracts_active: number;
    invoices_outstanding: number;
    invoices_paid: number;
    documents: number;
    meetings_upcoming: number;
    notifications_unread: number;
    wallet_balance: number;
    loyalty_points: number;
  };
  expiries: Array<{
    id: string;
    kind: "contract" | "document";
    label: string;
    date: string;
  }>;
  recentRequests: Array<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
  }>;
  recentNotifications: Array<{
    id: string;
    title: string;
    body: string | null;
    type: string | null;
    read_at: string | null;
    created_at: string;
  }>;
  generatedAt: string;
};

export const getPortalOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PortalOverview> => {
    const { supabase, userId, claims } = context as {
      supabase: ServerSupabase;
      userId: string;
      claims: any;
    };

    // Profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, department, trial_ends_at")
      .eq("id", userId)
      .maybeSingle();

    // Primary organization membership
    const { data: membership } = await supabase
      .from("organization_members")
      .select("role, org_id, organizations:org_id(id, name, slug, logo_url)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const orgId: string | null = membership?.org_id ?? null;
    const org = membership?.organizations
      ? {
          id: (membership.organizations as any).id,
          name: (membership.organizations as any).name,
          slug: (membership.organizations as any).slug,
          logo_url: (membership.organizations as any).logo_url,
          role: membership.role ?? null,
        }
      : null;

    const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // Parallel counts (RLS scopes to user's org automatically).
    // Bypass the strict `from<T>` overload since we pass table names dynamically;
    // filters on generic columns like `org_id`/`status` are checked at runtime.
    const from = supabase.from.bind(supabase) as unknown as (
      table: string,
    ) => ReturnType<ServerSupabase["from"]>;
    const q = (table: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (from(table) as any).select("id", { count: "exact", head: true });
    const scoped = (table: string) => {
      const query = q(table);
      return orgId ? query.eq("org_id", orgId) : query;
    };

    const [
      tasksAll,
      tasksPending,
      tasksDone,
      tasksRejected,
      employees,
      contractsActive,
      invoicesOutstanding,
      invoicesPaid,
      documents,
      meetingsUpcoming,
      notifUnread,
      contractsExpiring,
      recentTasks,
      recentNotifs,
    ] = await Promise.all([
      scoped("tasks"),
      scoped("tasks").in("status", ["todo", "in_progress"]),
      scoped("tasks").eq("status", "done"),
      scoped("tasks").eq("status", "cancelled"),
      scoped("employees"),
      scoped("contracts").eq("status", "active"),
      scoped("invoices").in("status", ["draft", "sent", "overdue"]),
      scoped("invoices").eq("status", "paid"),
      scoped("documents"),
      scoped("meetings").gte("starts_at", now),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null),
      orgId
        ? supabase
            .from("contracts")
            .select("id, contract_number, end_date")
            .eq("org_id", orgId)
            .eq("status", "active")
            .is("deleted_at", null)
            .gte("end_date", today)
            .lte("end_date", in30d)
            .order("end_date", { ascending: true })
            .limit(6)
        : Promise.resolve({ data: [] as any[] }),
      orgId
        ? supabase
            .from("tasks")
            .select("id, title, status, updated_at")
            .eq("org_id", orgId)
            .order("updated_at", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("notifications")
        .select("id, title, body, type, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    const trialEnds: string | null = profile?.trial_ends_at ?? null;
    const inTrial = trialEnds != null && new Date(trialEnds).getTime() > Date.now();

    return {
      profile: {
        id: userId,
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        department: profile?.department ?? null,
        email: (claims?.email as string | undefined) ?? null,
      },
      organization: org,
      subscription: {
        plan: inTrial ? "trial" : "starter",
        status: inTrial ? "trial" : "active",
        trial_ends_at: trialEnds,
      },
      kpis: {
        requests_total: tasksAll.count ?? 0,
        requests_pending: tasksPending.count ?? 0,
        requests_completed: tasksDone.count ?? 0,
        requests_rejected: tasksRejected.count ?? 0,
        employees: employees.count ?? 0,
        contracts_active: contractsActive.count ?? 0,
        invoices_outstanding: invoicesOutstanding.count ?? 0,
        invoices_paid: invoicesPaid.count ?? 0,
        documents: documents.count ?? 0,
        meetings_upcoming: meetingsUpcoming.count ?? 0,
        notifications_unread: notifUnread.count ?? 0,
        wallet_balance: 0,
        loyalty_points: 0,
      },
      expiries: ((contractsExpiring.data ?? []) as any[]).map((c) => ({
        id: c.id,
        kind: "contract" as const,
        label: c.contract_number ?? "Contract",
        date: c.end_date,
      })),
      recentRequests: ((recentTasks.data ?? []) as any[]).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        updated_at: t.updated_at,
      })),
      recentNotifications: ((recentNotifs.data ?? []) as any[]).map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        read_at: n.read_at,
        created_at: n.created_at,
      })),
      generatedAt: new Date().toISOString(),
    };
  });

/* ============================================================
 * Per-section fetchers — all RLS-scoped through requireSupabaseAuth
 * ============================================================ */

async function primaryOrgId(supabase: ServerSupabase, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.org_id as string) ?? null;
}

export const listPortalRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string; search?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) return { items: [] as any[] };
    let q = supabase
      .from("tasks")
      .select("id, title, status, priority, due_at, updated_at, created_at, description")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search?.trim()) q = q.ilike("title", `%${data.search.trim()}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { items: (rows ?? []) as any[] };
  });

export const listPortalDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { category?: string; search?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) return { items: [] as any[] };
    let q = supabase
      .from("documents")
      .select("id, title, category, status, tags, created_at, updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (data.category && data.category !== "all") q = q.eq("category", data.category);
    if (data.search?.trim()) q = q.ilike("title", `%${data.search.trim()}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { items: (rows ?? []) as any[] };
  });

export const listPortalEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) return { items: [] as any[] };
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, job_title, email, phone, hire_date, status")
      .eq("org_id", orgId)
      .order("full_name", { ascending: true })
      .limit(200);
    if (error) throw error;
    return { items: (data ?? []) as any[] };
  });

export const listPortalInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) return { items: [] as any[], totals: { outstanding: 0, paid: 0 } };
    let q = supabase
      .from("invoices")
      .select("id, number, issue_date, due_date, paid_at, total, currency, status")
      .eq("org_id", orgId)
      .order("issue_date", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    const items = (rows ?? []) as any[];
    const totals = items.reduce(
      (acc, r) => {
        if (r.status === "paid") acc.paid += Number(r.total ?? 0);
        else acc.outstanding += Number(r.total ?? 0);
        return acc;
      },
      { outstanding: 0, paid: 0 },
    );
    return { items, totals };
  });

export const listPortalMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) return { items: [] as any[] };
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title, description, starts_at, ends_at, location, link")
      .eq("org_id", orgId)
      .gte("starts_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    return { items: (data ?? []) as any[] };
  });

export const listPortalNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { unreadOnly?: boolean; type?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    let q = supabase
      .from("notifications")
      .select("id, title, body, type, link, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.unreadOnly) q = q.is("read_at", null);
    if (data.type && data.type !== "all") q = q.eq("type", data.type);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { items: (rows ?? []) as any[] };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });
