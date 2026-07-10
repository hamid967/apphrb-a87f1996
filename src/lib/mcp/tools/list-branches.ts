import { defineTool } from "@lovable.dev/mcp-js";
import {
  buildListResponse,
  errorContent,
  escapeIlike,
  getUserOrgId,
  listInputShape,
  supabaseForUser,
} from "../supabase";

export default defineTool({
  name: "list_branches",
  title: "List branches & departments",
  description:
    "List branches (with their departments) for the signed-in user's company. Supports text search over branch name/address and pagination. Returns a unified {id, title, subtitle, date} shape.",
  inputSchema: { ...listInputShape },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ q, page, page_size }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);
    if (!orgId) return errorContent("No active company for this user");

    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    const sb = supabaseForUser(ctx);
    let bq = sb
      .from("branches")
      .select("id, name, phone, address, created_at", { count: "exact" })
      .eq("org_id", orgId)
      .is("deleted_at", null);
    if (q) {
      const s = escapeIlike(q);
      bq = bq.or(`name.ilike.%${s}%,address.ilike.%${s}%`);
    }
    bq = bq.order("created_at", { ascending: true }).range(from, to);

    const { data: branches, error: bErr, count } = await bq;
    if (bErr) return errorContent(bErr.message);

    const branchIds = (branches ?? []).map((b) => b.id);
    let departments: { id: string; name: string; branch_id: string | null }[] = [];
    if (branchIds.length > 0) {
      const { data: depData, error: dErr } = await sb
        .from("departments")
        .select("id, name, branch_id")
        .eq("org_id", orgId)
        .in("branch_id", branchIds);
      if (dErr) return errorContent(dErr.message);
      departments = (depData ?? []) as typeof departments;
    }

    return buildListResponse(
      "branches",
      branches ?? [],
      { q, page, page_size },
      count ?? null,
      (row) => {
        const deps = departments.filter((d) => d.branch_id === row.id);
        return {
          id: String(row.id),
          title: row.name ?? `Branch ${String(row.id).slice(0, 8)}`,
          subtitle: row.address ?? null,
          status: null,
          date: row.created_at ?? null,
          meta: {
            phone: row.phone,
            departments: deps.map((d) => ({ id: d.id, name: d.name })),
          },
        };
      },
    );
  },
});
