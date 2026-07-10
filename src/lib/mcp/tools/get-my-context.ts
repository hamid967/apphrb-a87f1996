import { defineTool } from "@lovable.dev/mcp-js";
import { errorContent, getUserOrgId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_context",
  title: "Get my account context",
  description:
    "Return the signed-in user's profile summary and active company (organization) they belong to.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const sb = supabaseForUser(ctx);
    const { data: profile } = await sb
      .from("profiles")
      .select("full_name, phone, job_title, signup_reason, language")
      .eq("id", ctx.getUserId())
      .maybeSingle();

    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);

    let company: unknown = null;
    if (orgId) {
      const { data } = await sb
        .from("companies")
        .select("id, name, phone, address, created_at")
        .eq("id", orgId)
        .maybeSingle();
      company = data ?? null;
    }

    const payload = {
      user: { id: ctx.getUserId(), email: ctx.getUserEmail() },
      profile: profile ?? null,
      company,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
