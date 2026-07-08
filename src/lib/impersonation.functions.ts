import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader } from "@tanstack/react-start/server";

async function assertAdmin(context: any) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

export type ImpersonationTarget = {
  id: string;
  email: string | null;
  full_name: string | null;
};

export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { targetUserId?: string; targetEmail?: string; reason?: string }) => data)
  .handler(
    async ({ data, context }): Promise<{ session_id: string; target: ImpersonationTarget }> => {
      await assertAdmin(context);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Resolve target
      let targetId = data.targetUserId?.trim();
      let email: string | null = null;
      let fullName: string | null = null;

      if (!targetId && data.targetEmail?.trim()) {
        const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (error) throw error;
        const found = list?.users?.find(
          (u) => u.email?.toLowerCase() === data.targetEmail!.trim().toLowerCase(),
        );
        if (!found) throw new Error("Target user not found");
        targetId = found.id;
        email = found.email ?? null;
      }
      if (!targetId) throw new Error("Provide target user id or email");

      if (!email) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(targetId);
        email = u?.user?.email ?? null;
      }
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", targetId)
        .maybeSingle();
      fullName = prof?.full_name ?? null;

      if (targetId === context.userId) throw new Error("Cannot impersonate yourself");

      // Block impersonation of other Super Admins
      const { data: targetIsAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
        _user_id: targetId,
        _role: "admin",
      });
      if (roleErr) throw roleErr;
      if (targetIsAdmin) {
        const ipRej =
          getRequestHeader("x-forwarded-for") ?? getRequestHeader("cf-connecting-ip") ?? null;
        const uaRej = getRequestHeader("user-agent") ?? null;
        await supabaseAdmin.from("audit_log").insert({
          action: "IMPERSONATE_REJECTED",
          entity: "auth.users",
          entity_id: targetId,
          actor: context.userId,
          diff: {
            reason: "Target is a Super Admin; impersonation of admins is not allowed",
            target_email: email,
            requested_reason: data.reason ?? null,
            ip: ipRej,
            user_agent: uaRej,
          },
        });
        throw new Error("Cannot impersonate another Super Admin");
      }

      const session_id = crypto.randomUUID();
      const ip =
        getRequestHeader("x-forwarded-for") ?? getRequestHeader("cf-connecting-ip") ?? null;
      const ua = getRequestHeader("user-agent") ?? null;

      await supabaseAdmin.from("audit_log").insert({
        action: "IMPERSONATE_START",
        entity: "auth.users",
        entity_id: targetId,
        actor: context.userId,
        diff: { session_id, target_email: email, reason: data.reason ?? null, ip, user_agent: ua },
      });

      return { session_id, target: { id: targetId, email, full_name: fullName } };
    },
  );

export const endImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { session_id: string; targetUserId: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      action: "IMPERSONATE_END",
      entity: "auth.users",
      entity_id: data.targetUserId,
      actor: context.userId,
      diff: { session_id: data.session_id, ended_at: new Date().toISOString() },
    });
    return { ok: true };
  });
