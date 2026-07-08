import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ROLES, type OrgRole } from "@/lib/permissions";

async function assertAdmin(supabase: ServerSupabase, userId: string, orgId: string) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: ADMIN_ROLES,
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: owner or admin only");
}

const orgIdSchema = z.object({ orgId: z.string().uuid() });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orgIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: members, error } = await context.supabase
      .from("organization_members")
      .select(
        "user_id, role, created_at, profiles:profiles!organization_members_user_id_fkey(full_name, avatar_url)",
      )
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: true });
    if (error) {
      // fallback without join if FK name differs
      const { data: m2, error: e2 } = await context.supabase
        .from("organization_members")
        .select("user_id, role, created_at")
        .eq("org_id", data.orgId)
        .order("created_at", { ascending: true });
      if (e2) throw e2;
      return {
        members: (m2 ?? []).map((r: any) => ({ ...r, profiles: null })),
        invitations: [] as any[],
      };
    }
    const { data: invs, error: ie } = await context.supabase
      .from("org_invitations")
      .select("id, email, role, expires_at, accepted_at, created_at, token")
      .eq("org_id", data.orgId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (ie) throw ie;
    return { members: members ?? [], invitations: invs ?? [] };
  });

const inviteSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["owner", "admin", "agent", "viewer"]),
});

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.orgId);
    const { data: inv, error } = await context.supabase
      .from("org_invitations")
      .insert({
        org_id: data.orgId,
        email: data.email,
        role: data.role as OrgRole,
        invited_by: context.userId,
      })
      .select("id, token, email, role, expires_at")
      .single();
    if (error) throw error;
    return inv;
  });

const roleUpdateSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "agent", "viewer"]),
});

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => roleUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.orgId);
    const { error } = await context.supabase
      .from("organization_members")
      .update({ role: data.role as OrgRole })
      .eq("org_id", data.orgId)
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

const removeSchema = z.object({ orgId: z.string().uuid(), userId: z.string().uuid() });
export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => removeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.orgId);
    if (data.userId === context.userId) throw new Error("You can't remove yourself");
    const { error } = await context.supabase
      .from("organization_members")
      .delete()
      .eq("org_id", data.orgId)
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

const revokeSchema = z.object({ orgId: z.string().uuid(), invitationId: z.string().uuid() });
export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => revokeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId, data.orgId);
    const { error } = await context.supabase
      .from("org_invitations")
      .delete()
      .eq("id", data.invitationId)
      .eq("org_id", data.orgId);
    if (error) throw error;
    return { ok: true };
  });

const tokenSchema = z.object({ token: z.string().min(8) });

export const getInvitationByToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => tokenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("get_invitation_by_token", {
      _token: data.token,
    });
    if (error) throw error;
    const inv = Array.isArray(row) ? row[0] : row;
    if (!inv) throw new Error("Invitation not found");
    return inv as {
      email: string;
      role: OrgRole;
      org_name: string;
      expires_at: string;
      accepted_at: string | null;
    };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => tokenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: orgId, error } = await context.supabase.rpc("accept_org_invitation", {
      _token: data.token,
    });
    if (error) throw error;
    return { orgId: orgId as string };
  });
