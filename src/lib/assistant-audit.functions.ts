import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  action: z.string().max(80).optional(),
  actor: z.string().uuid().optional(),
  since: z.string().optional(),
});

const SCRIPT_ACTIONS = [
  "ASSISTANT_TOOL_CALL",
  "ASSISTANT_TOOL_DENIED",
  "ASSISTANT_ACTION",
  "ASSISTANT_ACTION_ERROR",
  "DASHBOARD_TOOL_CALL",
  "DASHBOARD_TOOL_DENIED",
];

export const listAssistantAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve org for the caller.
    const { data: mem } = await supabase
      .from("organization_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!mem?.org_id) throw new Error("No organization for user");
    const orgId = mem.org_id as string;
    const role = String(mem.role ?? "");

    // Only elevated org roles or super_admin may view the assistant audit log.
    const allowedOrgRoles = new Set(["owner", "admin", "manager", "finance"]);
    if (!allowedOrgRoles.has(role)) {
      const { data: isSuper } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "super_admin" as any,
      });
      if (isSuper !== true) throw new Error("Forbidden: elevated role required");
    }

    // audit_log RLS is scoped to specific roles; use admin client to bypass and
    // filter by org_id inside diff. Data is still gated by the role check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("audit_log")
      .select("id, action, actor, diff, created_at")
      .eq("entity", "assistant")
      .contains("diff", { org_id: orgId } as any)
      .in("action", data.action ? [data.action] : SCRIPT_ACTIONS)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.actor) q = q.eq("actor", data.actor);
    if (data.since) q = q.gte("created_at", data.since);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich with actor emails
    const actorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.actor).filter(Boolean)),
    ) as string[];
    const emailById: Record<string, string> = {};
    if (actorIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      for (const p of profs ?? []) {
        emailById[p.id as string] = (p as any).full_name ?? "";
      }
    }

    return {
      rows: (rows ?? []).map((r: any) => ({
        id: r.id,
        action: r.action,
        actor: r.actor,
        actor_email: r.actor ? (emailById[r.actor] ?? "") : "",
        tool: r.diff?.tool ?? r.diff?.action ?? null,
        diff: r.diff ?? {},
        created_at: r.created_at,
      })),
    };
  });
