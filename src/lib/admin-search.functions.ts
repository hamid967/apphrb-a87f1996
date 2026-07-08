import { createServerFn } from "@tanstack/react-start";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

export type AdminSearchInput = {
  q: string;
  from?: string | null; // ISO date
  to?: string | null; // ISO date
  status?: string | null; // profiles.approval_status filter
};

export type AdminSearchResult = {
  users: Array<{
    id: string;
    full_name: string | null;
    phone: string | null;
    approval_status: string;
    created_at: string;
  }>;
  organizations: Array<{ id: string; name: string; slug: string; created_at: string }>;
  audit: Array<{
    id: string;
    action: string;
    entity: string;
    entity_id: string;
    actor: string | null;
    created_at: string;
  }>;
};

export const adminGlobalSearch = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: AdminSearchInput) => ({
    q: (data?.q ?? "").trim().slice(0, 120),
    from: data?.from || null,
    to: data?.to || null,
    status: data?.status || null,
  }))
  .handler(async ({ data }): Promise<AdminSearchResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q;
    const like = q ? `%${q.replace(/[%_]/g, (m) => "\\" + m)}%` : null;

    // Users (profiles)
    let usersQ = supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, approval_status, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (like) usersQ = usersQ.or(`full_name.ilike.${like},phone.ilike.${like},id.eq.${q}`);
    if (data.status) usersQ = usersQ.eq("approval_status", data.status);
    if (data.from) usersQ = usersQ.gte("created_at", data.from);
    if (data.to) usersQ = usersQ.lte("created_at", data.to);

    // Organizations
    let orgsQ = supabaseAdmin
      .from("organizations")
      .select("id, name, slug, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (like) orgsQ = orgsQ.or(`name.ilike.${like},slug.ilike.${like}`);
    if (data.from) orgsQ = orgsQ.gte("created_at", data.from);
    if (data.to) orgsQ = orgsQ.lte("created_at", data.to);

    // Audit
    let auditQ = supabaseAdmin
      .from("audit_log")
      .select("id, action, entity, entity_id, actor, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (like)
      auditQ = auditQ.or(`action.ilike.${like},entity.ilike.${like},entity_id.ilike.${like}`);
    if (data.from) auditQ = auditQ.gte("created_at", data.from);
    if (data.to) auditQ = auditQ.lte("created_at", data.to);

    const [users, orgs, audit] = await Promise.all([usersQ, orgsQ, auditQ]);
    if (users.error) throw users.error;
    if (orgs.error) throw orgs.error;
    if (audit.error) throw audit.error;

    return {
      users: users.data ?? [],
      organizations: orgs.data ?? [],
      audit: audit.data ?? [],
    };
  });
