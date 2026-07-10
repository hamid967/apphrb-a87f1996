import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorContent, getUserOrgId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_property",
  title: "Create a property",
  description:
    "Insert a new property into the signed-in user's company. Requires a title in Arabic or English.",
  inputSchema: {
    title_ar: z.string().trim().max(140).optional().describe("Arabic title."),
    title_en: z.string().trim().max(140).optional().describe("English title."),
    property_type: z
      .enum(["apartment", "villa", "office", "land", "shop", "building"])
      .default("apartment"),
    listing_type: z.enum(["rent", "sale"]).default("rent"),
    city: z.string().trim().max(80).optional().describe("City name."),
    price: z.number().min(0).default(0).describe("Price in SAR."),
    currency: z.string().trim().max(8).default("SAR"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");

    const title_ar = (input.title_ar ?? "").trim();
    const title_en = (input.title_en ?? "").trim();
    if (!title_ar && !title_en) {
      return errorContent("Provide title_ar or title_en (at least one).");
    }
    const finalAr = title_ar || title_en;
    const finalEn = title_en || title_ar;

    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);
    if (!orgId) return errorContent("No active company for this user");

    const sb = supabaseForUser(ctx);
    const { data, error: iErr } = await sb
      .from("properties")
      .insert({
        org_id: orgId,
        title_ar: finalAr,
        title_en: finalEn,
        property_type: input.property_type,
        listing_type: input.listing_type,
        status: "available",
        price: input.price,
        currency: input.currency,
        city: input.city ?? null,
        created_by: ctx.getUserId(),
      })
      .select("id, title_ar, title_en, property_type, listing_type, city, price, currency, created_at")
      .single();

    if (iErr) return errorContent(iErr.message);

    return {
      content: [{ type: "text", text: `Created property ${data.id}` }],
      structuredContent: { property: data },
    };
  },
});
