import { createServerFn } from "@tanstack/react-start";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";
import { z } from "zod";

export const listUsersForApproval = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, approval_status, approved_at, approved_by, trial_ends_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (pErr) throw pErr;

    // Fetch emails via auth admin
    const emails = new Map<string, string>();
    let page = 1;
    while (page <= 20) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw error;
      for (const u of list.users) emails.set(u.id, u.email ?? "");
      if (list.users.length < 200) break;
      page++;
    }

    return (profiles ?? []).map((p) => ({
      ...p,
      email: emails.get(p.id) ?? "",
    }));
  });

export const approveUserTrial = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({ userId: z.string().uuid(), days: z.number().int().min(1).max(365).default(7) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("approve_user_trial", {
      _user_id: data.userId,
      _days: data.days,
    });
    if (error) throw error;
    const { logDecisionAction } = await import("@/lib/decision-audit.server");
    await logDecisionAction({
      kind: "user",
      action: "approve",
      entity_id: data.userId,
      actor: (context as any).userId,
      target_user_id: data.userId,
      extra: { trial_days: data.days },
    });
    return { ok: true };
  });

export const rejectUserAccount = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), reason: z.string().trim().min(1).max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reject_user", { _user_id: data.userId });
    if (error) throw error;
    const { logDecisionAction } = await import("@/lib/decision-audit.server");
    await logDecisionAction({
      kind: "user",
      action: "reject",
      entity_id: data.userId,
      actor: (context as any).userId,
      target_user_id: data.userId,
      reason: data.reason ?? null,
    });
    return { ok: true };
  });

export const adminResetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        newPassword: z.string().min(8).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find user by email
    let target: { id: string; email?: string | null } | null = null;
    let page = 1;
    while (page <= 20) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw error;
      const found = list.users.find(
        (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
      );
      if (found) {
        target = { id: found.id, email: found.email };
        break;
      }
      if (list.users.length < 200) break;
      page++;
    }
    if (!target) throw new Error("User not found");

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
      password: data.newPassword,
    });
    if (updErr) throw updErr;

    try {
      await context.supabase.rpc("log_assistant_access", {
        _org: "00000000-0000-0000-0000-000000000000",
        _action: "ADMIN_PASSWORD_RESET",
        _diff: { target_user_id: target.id, target_email: target.email },
      });
    } catch {}

    return { ok: true, userId: target.id };
  });
