import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ROLES, EDITOR_ROLES, type OrgRole } from "@/lib/permissions";

async function assertOrgRole(
  supabase: ServerSupabase,
  userId: string,
  orgId: string,
  allowed: OrgRole[],
) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: allowed,
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: insufficient role");
}

async function getPropertyOrgId(supabase: ServerSupabase, id: string): Promise<string> {
  const { data, error } = await supabase
    .from("properties")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Property not found");
  return data.org_id as string;
}

const propertyType = z.enum([
  "apartment",
  "villa",
  "office",
  "land",
  "shop",
  "warehouse",
  "building",
  "farm",
  "chalet",
  "other",
]);
const listingType = z.enum(["sale", "rent"]);
const listingStatus = z.enum(["available", "reserved", "sold", "rented", "inactive"]);

const createSchema = z.object({
  org_id: z.string().uuid(),
  title_ar: z.string().trim().min(2).max(140),
  title_en: z.string().trim().min(2).max(140),
  description_ar: z.string().max(4000).optional().nullable(),
  description_en: z.string().max(4000).optional().nullable(),
  property_type: propertyType,
  listing_type: listingType,
  status: listingStatus,
  price: z.number().nonnegative(),
  currency: z.string().min(3).max(6).default("SAR"),
  area_sqm: z.number().nonnegative().optional().nullable(),
  bedrooms: z.number().int().nonnegative().optional().nullable(),
  bathrooms: z.number().int().nonnegative().optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  address: z.string().max(240).optional().nullable(),
  cover_image_url: z.string().url().optional().nullable(),
});

const updateSchema = createSchema.omit({ org_id: true }).partial().extend({
  id: z.string().uuid(),
});

export const listProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("properties")
      .select("*")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const getProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Property not found");
    return row;
  });

export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("properties")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getPropertyOrgId(context.supabase, data.id);
    await assertOrgRole(context.supabase, context.userId, orgId, ADMIN_ROLES);
    const { error } = await context.supabase.from("properties").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const updateProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const orgId = await getPropertyOrgId(context.supabase, id);
    await assertOrgRole(context.supabase, context.userId, orgId, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("properties")
      .update(patch)
      .eq("id", id)
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const archiveProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getPropertyOrgId(context.supabase, data.id);
    await assertOrgRole(context.supabase, context.userId, orgId, EDITOR_ROLES);
    const { error } = await context.supabase
      .from("properties")
      .update({ status: "inactive" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
