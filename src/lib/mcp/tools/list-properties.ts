import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorContent, getUserOrgId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_properties",
  title: "List properties",
  description:
    "List real-estate properties in the signed-in user's company. Supports optional filters by city and listing type.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Max rows to return (1-100)."),
    city: z.string().trim().min(1).max(80).optional().describe("Filter by city name."),
    listing_type: z
      .enum(["rent", "sale"])
      .optional()
      .describe("Filter by listing type: rent or sale."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, city, listing_type }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);
    if (!orgId) return errorContent("No active company for this user");

    const sb = supabaseForUser(ctx);
    let q = sb
      .from("properties")
      .select("id, title_ar, title_en, property_type, listing_type, status, city, price, currency, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (city) q = q.eq("city", city);
    if (listing_type) q = q.eq("listing_type", listing_type);

    const { data, error: qErr } = await q;
    if (qErr) return errorContent(qErr.message);

    const rows = data ?? [];
    return {
      content: [{ type: "text", text: `Found ${rows.length} propertie(s).\n${JSON.stringify(rows, null, 2)}` }],
      structuredContent: { count: rows.length, items: rows },
    };
  },
});
