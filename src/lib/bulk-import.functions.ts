import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EDITOR_ROLES, type OrgRole } from "@/lib/permissions";

type ImportResult = {
  created: number;
  updated?: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

async function assertRole(
  supabase: import("@/lib/server-types").ServerSupabase,
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

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v: unknown): number | null => {
  const n = numOrNull(v);
  return n === null ? null : Math.trunc(n);
};
const strOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const commonInput = z.object({
  org_id: z.string().uuid(),
  rows: z.array(z.record(z.string(), z.any())).min(1).max(2000),
});

/* ------------------------------------------------------------------ */
/* Properties                                                          */
/* ------------------------------------------------------------------ */
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

const propertyRowSchema = z.object({
  title_ar: z.string().trim().min(2).max(140),
  title_en: z.string().trim().min(2).max(140),
  property_type: propertyType,
  listing_type: listingType,
  status: listingStatus.optional().default("available"),
  price: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(6).optional().default("SAR"),
  area_sqm: z.number().nonnegative().nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  bathrooms: z.number().int().nonnegative().nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  address: z.string().max(240).nullable().optional(),
  description_ar: z.string().max(4000).nullable().optional(),
  description_en: z.string().max(4000).nullable().optional(),
});

export const bulkInsertProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => commonInput.parse(input))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const errors: { row: number; message: string }[] = [];
    const toInsert: any[] = [];
    let index = 0;
    for (const raw of data.rows) {
      index++;
      const normalized = {
        title_ar: strOrNull(raw.title_ar),
        title_en: strOrNull(raw.title_en),
        property_type: strOrNull(raw.property_type)?.toLowerCase(),
        listing_type: strOrNull(raw.listing_type)?.toLowerCase() ?? "rent",
        status: strOrNull(raw.status)?.toLowerCase() ?? "available",
        price: numOrNull(raw.price) ?? 0,
        currency: strOrNull(raw.currency)?.toUpperCase() ?? "SAR",
        area_sqm: numOrNull(raw.area_sqm),
        bedrooms: intOrNull(raw.bedrooms),
        bathrooms: intOrNull(raw.bathrooms),
        city: strOrNull(raw.city),
        address: strOrNull(raw.address),
        description_ar: strOrNull(raw.description_ar),
        description_en: strOrNull(raw.description_en),
      };
      const parsed = propertyRowSchema.safeParse(normalized);
      if (!parsed.success) {
        errors.push({ row: index, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      toInsert.push({
        ...parsed.data,
        org_id: data.org_id,
        created_by: context.userId,
      });
    }
    let created = 0;
    if (toInsert.length) {
      const { data: ins, error } = await context.supabase
        .from("properties")
        .insert(toInsert)
        .select("id");
      if (error) {
        errors.push({ row: 0, message: error.message });
      } else {
        created = ins?.length ?? 0;
      }
    }
    return { created, skipped: data.rows.length - created - errors.filter((e) => e.row > 0).length, errors };
  });

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */
const unitStatus = z.enum(["vacant", "occupied", "reserved", "maintenance"]);
const unitRowSchema = z.object({
  code: z.string().trim().min(1).max(64),
  type: z.string().trim().max(64).nullable().optional(),
  status: unitStatus.optional().default("vacant"),
  area: z.number().nonnegative().nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  bathrooms: z.number().int().nonnegative().nullable().optional(),
  rent_amount: z.number().nonnegative().nullable().optional(),
  currency_code: z.string().trim().max(6).nullable().optional(),
});

export const bulkInsertUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => commonInput.parse(input))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);

    const { data: props, error: pErr } = await context.supabase
      .from("properties")
      .select("id, title_ar, title_en, currency")
      .eq("org_id", data.org_id);
    if (pErr) throw pErr;
    const byId = new Map<string, any>((props ?? []).map((p) => [String(p.id), p]));
    const byTitle = new Map<string, any>();
    for (const p of props ?? []) {
      if (p.title_ar) byTitle.set(String(p.title_ar).trim().toLowerCase(), p);
      if (p.title_en) byTitle.set(String(p.title_en).trim().toLowerCase(), p);
    }

    const { data: bldgs, error: bErr } = await context.supabase
      .from("buildings")
      .select("id, property_id, created_at")
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (bErr) throw bErr;
    const buildingByProperty = new Map<string, string>();
    for (const b of bldgs ?? []) {
      const pid = String(b.property_id ?? "");
      if (pid && !buildingByProperty.has(pid)) buildingByProperty.set(pid, String(b.id));
    }

    const errors: { row: number; message: string }[] = [];
    const toInsert: any[] = [];
    let index = 0;
    for (const raw of data.rows) {
      index++;
      const propId = strOrNull(raw.property_id);
      const propTitle = strOrNull(raw.property_title);
      let prop: any | undefined;
      if (propId) prop = byId.get(propId);
      if (!prop && propTitle) prop = byTitle.get(propTitle.toLowerCase());
      if (!prop) {
        errors.push({ row: index, message: "Property not found (property_id or property_title)" });
        continue;
      }
      const normalized = {
        code: strOrNull(raw.code) ?? "",
        type: strOrNull(raw.type),
        status: (strOrNull(raw.status)?.toLowerCase() ?? "vacant"),
        area: numOrNull(raw.area),
        bedrooms: intOrNull(raw.bedrooms),
        bathrooms: intOrNull(raw.bathrooms),
        rent_amount: numOrNull(raw.rent_amount),
        currency_code: strOrNull(raw.currency_code)?.toUpperCase() ?? null,
      };
      const parsed = unitRowSchema.safeParse(normalized);
      if (!parsed.success) {
        errors.push({ row: index, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      // ensure a building for this property
      let buildingId = buildingByProperty.get(String(prop.id));
      if (!buildingId) {
        const name = (prop.title_ar as string) || (prop.title_en as string) || "Main";
        const { data: nb, error: nbErr } = await context.supabase
          .from("buildings")
          .insert({ org_id: data.org_id, property_id: prop.id, name })
          .select("id")
          .single();
        if (nbErr) {
          errors.push({ row: index, message: nbErr.message });
          continue;
        }
        buildingId = String(nb.id);
        buildingByProperty.set(String(prop.id), buildingId);
      }
      toInsert.push({
        org_id: data.org_id,
        building_id: buildingId,
        code: parsed.data.code,
        type: parsed.data.type ?? null,
        status: parsed.data.status,
        area: parsed.data.area ?? null,
        bedrooms: parsed.data.bedrooms ?? null,
        bathrooms: parsed.data.bathrooms ?? null,
        rent_amount: parsed.data.rent_amount ?? null,
        currency_code: parsed.data.currency_code ?? (prop.currency as string | null) ?? "SAR",
      });
    }
    let created = 0;
    if (toInsert.length) {
      const { data: ins, error } = await context.supabase
        .from("units")
        .insert(toInsert)
        .select("id");
      if (error) errors.push({ row: 0, message: error.message });
      else created = ins?.length ?? 0;
    }
    return { created, skipped: data.rows.length - created - errors.filter((e) => e.row > 0).length, errors };
  });

/* ------------------------------------------------------------------ */
/* Owners                                                              */
/* ------------------------------------------------------------------ */
const ownerRowSchema = z.object({
  full_name: z.string().trim().min(2).max(140),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(240).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const bulkInsertOwners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => commonInput.parse(input))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const errors: { row: number; message: string }[] = [];
    const toInsert: any[] = [];
    let index = 0;
    for (const raw of data.rows) {
      index++;
      const email = strOrNull(raw.email);
      const normalized = {
        full_name: strOrNull(raw.full_name) ?? "",
        email: email && email.length > 0 ? email : null,
        phone: strOrNull(raw.phone),
        address: strOrNull(raw.address),
        notes: strOrNull(raw.notes),
      };
      const parsed = ownerRowSchema.safeParse(normalized);
      if (!parsed.success) {
        errors.push({ row: index, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      toInsert.push({ ...parsed.data, org_id: data.org_id });
    }
    let created = 0;
    if (toInsert.length) {
      const { data: ins, error } = await context.supabase
        .from("owners")
        .insert(toInsert)
        .select("id");
      if (error) errors.push({ row: 0, message: error.message });
      else created = ins?.length ?? 0;
    }
    return { created, skipped: data.rows.length - created - errors.filter((e) => e.row > 0).length, errors };
  });

/* ------------------------------------------------------------------ */
/* Tenants                                                             */
/* ------------------------------------------------------------------ */
const tenantRowSchema = z.object({
  full_name: z.string().trim().min(2).max(140),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  nationality: z.string().max(60).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const bulkInsertTenants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => commonInput.parse(input))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    await assertRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const errors: { row: number; message: string }[] = [];
    const toInsert: any[] = [];
    let index = 0;
    for (const raw of data.rows) {
      index++;
      const email = strOrNull(raw.email);
      const normalized = {
        full_name: strOrNull(raw.full_name) ?? "",
        email: email && email.length > 0 ? email : null,
        phone: strOrNull(raw.phone),
        nationality: strOrNull(raw.nationality),
        notes: strOrNull(raw.notes),
      };
      const parsed = tenantRowSchema.safeParse(normalized);
      if (!parsed.success) {
        errors.push({ row: index, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      toInsert.push({ ...parsed.data, org_id: data.org_id });
    }
    let created = 0;
    if (toInsert.length) {
      const { data: ins, error } = await context.supabase
        .from("tenants")
        .insert(toInsert)
        .select("id");
      if (error) errors.push({ row: 0, message: error.message });
      else created = ins?.length ?? 0;
    }
    return { created, skipped: data.rows.length - created - errors.filter((e) => e.row > 0).length, errors };
  });
