import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ROLES } from "@/lib/permissions";

async function assertAdmin(supabase: ServerSupabase, userId: string, orgId: string) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: ADMIN_ROLES,
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden");
}

const orgIdSchema = z.object({ orgId: z.string().uuid() });

export const listPortalInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.orgId);
    const [{ data: invs, error: ie }, { data: tenants }, { data: owners }] = await Promise.all([
      context.supabase
        .from("portal_invitations")
        .select("id, kind, tenant_id, owner_id, email, token, expires_at, accepted_at, created_at")
        .eq("org_id", data.orgId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("tenants")
        .select("id, full_name, email")
        .eq("org_id", data.orgId)
        .is("deleted_at", null),
      context.supabase
        .from("owners")
        .select("id, full_name, email")
        .eq("org_id", data.orgId)
        .is("deleted_at", null),
    ]);
    if (ie) throw ie;
    return { invitations: invs ?? [], tenants: tenants ?? [], owners: owners ?? [] };
  });

const createSchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(["tenant", "owner"]),
  targetId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
});

export const createPortalInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.orgId);
    const row: any = {
      org_id: data.orgId,
      kind: data.kind,
      email: data.email,
      invited_by: context.userId,
      tenant_id: data.kind === "tenant" ? data.targetId : null,
      owner_id: data.kind === "owner" ? data.targetId : null,
    };
    const { data: inv, error } = await context.supabase
      .from("portal_invitations")
      .insert(row)
      .select("id, token, email, kind, expires_at")
      .single();
    if (error) throw error;
    return inv;
  });

const revokeSchema = z.object({ orgId: z.string().uuid(), invitationId: z.string().uuid() });
export const revokePortalInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => revokeSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.orgId);
    const { error } = await context.supabase
      .from("portal_invitations")
      .delete()
      .eq("id", data.invitationId)
      .eq("org_id", data.orgId);
    if (error) throw error;
    return { ok: true };
  });

// Super-admin global list of pending invitations across all orgs
export const listAllPendingPortalInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("portal_invitations")
      .select(
        "id, org_id, kind, tenant_id, owner_id, email, expires_at, created_at, organizations:org_id(name, slug)",
      )
      .is("accepted_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { items: (data ?? []) as any[] };
  });

// Super-admin revoke without needing org context
export const superAdminRevokePortalInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("portal_invitations")
      .select("org_id, email, kind")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("portal_invitations")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    const { logDecisionAction } = await import("@/lib/decision-audit.server");
    await logDecisionAction({
      kind: "invitation",
      action: "revoke",
      entity_id: data.id,
      actor: context.userId,
      org_id: existing?.org_id ?? null,
      target_email: existing?.email ?? null,
      reason: data.reason ?? null,
      extra: { invitation_kind: existing?.kind ?? null },
    });
    return { ok: true };
  });

const tokenSchema = z.object({ token: z.string().min(8) });

export const getPortalInvitationByToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => tokenSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("get_portal_invitation_by_token", {
      _token: data.token,
    });
    if (error) throw error;
    const inv = Array.isArray(row) ? row[0] : row;
    if (!inv) throw new Error("Invitation not found");
    return inv as {
      id: string;
      org_id: string;
      org_name: string;
      kind: "tenant" | "owner";
      tenant_id: string | null;
      owner_id: string | null;
      email: string;
      expires_at: string;
      accepted_at: string | null;
    };
  });

export const acceptPortalInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => tokenSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: orgId, error } = await context.supabase.rpc("accept_portal_invitation", {
      _token: data.token,
    });
    if (error) throw error;
    return { orgId: orgId as string };
  });
