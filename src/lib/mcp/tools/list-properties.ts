import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  buildListResponse,
  errorContent,
  escapeIlike,
  getUserOrgId,
  listInputShape,
  supabaseForUser,
} from "../supabase";

export default defineTool({
  name: "list_properties",
  title: "List properties",
  description:
    "List real-estate properties in the signed-in user's company. Supports text search over title/city, pagination, and optional filters by city and listing type. Returns a unified {id, title, subtitle, status, date} shape.",
  inputSchema: {
    ...listInputShape,
    city: z.string().trim().min(1).max(80).optional().describe("Filter by city name (exact)."),
    listing_type: z
      .enum(["rent", "sale"])
      .optional()
      .describe("Filter by listing type: rent or sale."),
    sort: z
      .enum(["created_at", "price", "city", "status"])
      .default("created_at")
      .describe("Column to sort by. Combined with the shared `order` (asc/desc)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ q, page, page_size, city, listing_type, sort, order }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);
    if (!orgId) return errorContent("No active company for this user");

    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    const sb = supabaseForUser(ctx);
    let query = sb
      .from("properties")
      .select(
        "id, title_ar, title_en, property_type, listing_type, status, city, price, currency, created_at",
        { count: "exact" },
      )
      .eq("org_id", orgId);
    if (city) query = query.eq("city", city);
    if (listing_type) query = query.eq("listing_type", listing_type);
    if (q) {
      const s = escapeIlike(q);
      query = query.or(`title_ar.ilike.%${s}%,title_en.ilike.%${s}%,city.ilike.%${s}%`);
    }
    query = query.order(sort, { ascending: order === "asc" }).range(from, to);

    const { data, error: qErr, count } = await query;
    if (qErr) return errorContent(qErr.message);

    return buildListResponse(
      "properties",
      data ?? [],
      { q, page, page_size },
      count ?? null,
      (row) => ({
        id: String(row.id),
        title: row.title_ar || row.title_en || `Property ${String(row.id).slice(0, 8)}`,
        subtitle: [row.property_type, row.city].filter(Boolean).join(" · ") || null,
        status: row.status ?? null,
        date: row.created_at ?? null,
        meta: {
          listing_type: row.listing_type,
          price: row.price,
          currency: row.currency,
        },
      }),
    );
  },
});
