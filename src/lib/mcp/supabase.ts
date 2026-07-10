import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Returns a Supabase client bound to the caller's OAuth token so PostgREST
 * enforces the same RLS policies that apply to that user in the app.
 * Never returns or logs the token.
 */
export function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Resolve the user's active organization id (first membership). */
export async function getUserOrgId(
  ctx: ToolContext,
): Promise<{ orgId: string | null; error?: string }> {
  const sb = supabaseForUser(ctx);
  const { data, error } = await sb
    .from("organization_members")
    .select("org_id")
    .eq("user_id", ctx.getUserId())
    .limit(1)
    .maybeSingle();
  if (error) return { orgId: null, error: error.message };
  return { orgId: (data?.org_id as string | undefined) ?? null };
}

export function errorContent(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}
