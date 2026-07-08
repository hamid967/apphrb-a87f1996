import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgIdSchema = z.object({ orgId: z.string().uuid() });

async function assertAdmin(supabase: any, orgId: string, userId: string) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: ["owner", "admin"],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — owner/admin only");
}

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => orgIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.orgId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("api_keys")
      .select("id,name,key_prefix,last_used_at,expires_at,revoked_at,created_at,scopes")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; name: string; expiresInDays?: number | null }) =>
    z
      .object({
        orgId: z.string().uuid(),
        name: z.string().min(2).max(80),
        expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.orgId, context.userId);
    const { randomBytes, createHash } = await import("node:crypto");
    const rand = randomBytes(24).toString("hex"); // 48 chars
    const token = `hbs_${rand}`;
    const key_prefix = token.slice(0, 8);
    const key_hash = createHash("sha256").update(token).digest("hex");
    const expires_at = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86400_000).toISOString()
      : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        org_id: data.orgId,
        name: data.name,
        key_prefix,
        key_hash,
        expires_at,
        created_by: context.userId,
        scopes: ["read"],
      })
      .select("id,name,key_prefix,expires_at,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { ...row, token };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; id: string }) =>
    z.object({ orgId: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.orgId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
