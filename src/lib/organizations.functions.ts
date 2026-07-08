import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, hyphens"),
});

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("organization_members")
      .select("role, organizations!inner(id, name, slug, logo_url, created_at)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true, referencedTable: "organizations" });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      role: row.role,
      org: row.organizations,
    }));
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organizations")
      .insert({ name: data.name, slug: data.slug, created_by: context.userId })
      .select("id, name, slug")
      .single();
    if (error) throw error;
    return org;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  logo_url: z.string().url().optional().nullable().or(z.literal("")),
});

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organizations")
      .update({ name: data.name, logo_url: data.logo_url || null })
      .eq("id", data.id)
      .select("id, name, slug, logo_url")
      .single();
    if (error) throw error;
    return org;
  });

export const provisionDeveloperWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("provision_developer_workspace");
    if (error) throw error;
    return data as {
      org_id: string;
      role_id: string;
      permissions: number;
      created_org: boolean;
    };
  });

export const logProvisioningResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: unknown) =>
      d as { org_id?: string | null; ok: boolean; message: string; meta?: Record<string, unknown> },
  )
  .handler(async ({ data, context }) => {
    if (!data.org_id) return { logged: false };
    const { error } = await context.supabase.from("logs").insert({
      org_id: data.org_id,
      level: data.ok ? "info" : "error",
      source: "onboarding.workspace",
      message: data.message,
      meta: (data.meta ?? {}) as never,
    });
    if (error) return { logged: false, error: error.message };
    return { logged: true };
  });

export const getWorkspaceProvisioningStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // 1) org membership
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1);
    const orgId = memberships?.[0]?.org_id ?? null;
    // 2) RBAC role for this user in that org
    let hasRole = false;
    let permissions = 0;
    if (orgId) {
      const { data: roles } = await supabase
        .from("rbac_user_roles")
        .select("role_id")
        .eq("user_id", userId)
        .eq("org_id", orgId);
      hasRole = !!roles && roles.length > 0;
      if (hasRole) {
        const roleIds = roles!.map((r) => r.role_id);
        const { count } = await supabase
          .from("rbac_role_permissions")
          .select("permission_id", { head: true, count: "exact" })
          .in("role_id", roleIds);
        permissions = count ?? 0;
      }
    }
    const steps = { org: !!orgId, role: hasRole, perms: permissions > 0 };
    const done = Object.values(steps).filter(Boolean).length;
    return {
      org_id: orgId,
      steps,
      permissions,
      progress: Math.round((done / 3) * 100),
      complete: done === 3,
    };
  });
