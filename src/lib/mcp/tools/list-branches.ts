import { defineTool } from "@lovable.dev/mcp-js";
import { errorContent, getUserOrgId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_branches",
  title: "List branches & departments",
  description:
    "List branches (and their departments) belonging to the signed-in user's company.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);
    if (!orgId) return errorContent("No active company for this user");

    const sb = supabaseForUser(ctx);
    const [{ data: branches, error: bErr }, { data: departments, error: dErr }] = await Promise.all([
      sb
        .from("branches")
        .select("id, name, phone, address, created_at")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      sb
        .from("departments")
        .select("id, name, branch_id")
        .eq("org_id", orgId),
    ]);
    if (bErr) return errorContent(bErr.message);
    if (dErr) return errorContent(dErr.message);

    const items = (branches ?? []).map((b) => ({
      ...b,
      departments: (departments ?? [])
        .filter((d) => d.branch_id === b.id)
        .map((d) => ({ id: d.id, name: d.name })),
    }));

    return {
      content: [{ type: "text", text: `Found ${items.length} branch(es).\n${JSON.stringify(items, null, 2)}` }],
      structuredContent: { count: items.length, items },
    };
  },
});
