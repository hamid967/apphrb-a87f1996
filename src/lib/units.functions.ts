import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("units")
      .select(
        "id, code, type, status, area, bedrooms, bathrooms, rent_amount, currency_code, building_id, buildings ( id, name, code, property_id, properties ( id, title_ar, title_en, city ) )",
      )
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const getUnit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), includeDeleted: z.boolean().optional().default(false) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const q = context.supabase
      .from("units")
      .select(
        "*, buildings ( id, name, code, property_id, properties ( id, title_ar, title_en, city, address ) )",
      )
      .eq("id", data.id);
    const { data: unit, error } = await (
      data.includeDeleted ? q : q.is("deleted_at", null)
    ).maybeSingle();
    if (error) throw error;
    if (!unit) throw new Error("Unit not found");

    const { data: contracts, error: cErr } = await context.supabase
      .from("contracts")
      .select("id, contract_number, status, start_date, end_date, amount, currency_code, tenant_id")
      .eq("unit_id", data.id)
      .is("deleted_at", null)
      .order("start_date", { ascending: false });
    if (cErr) throw cErr;

    return { unit, contracts: contracts ?? [] };
  });

export const listArchivedUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("units")
      .select(
        "id, code, type, status, area, bedrooms, bathrooms, rent_amount, currency_code, building_id, deleted_at, buildings ( id, name, code, property_id, properties ( id, title_ar, title_en, city ) )",
      )
      .eq("org_id", data.org_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const archiveUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("units")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", data.ids)
      .is("deleted_at", null);
    if (error) throw error;
    await context.supabase.rpc("log_soft_delete", {
      _entity: "units",
      _action: "archive",
      _ids: data.ids,
      _reason: data.reason ?? undefined,
    });
    return { ok: true, count: data.ids.length };
  });

export const restoreUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("units")
      .update({ deleted_at: null })
      .in("id", data.ids)
      .not("deleted_at", "is", null);
    if (error) throw error;
    await context.supabase.rpc("log_soft_delete", {
      _entity: "units",
      _action: "restore",
      _ids: data.ids,
      _reason: data.reason ?? undefined,
    });
    return { ok: true, count: data.ids.length };
  });

export const listUnitsByProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ property_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: bldgs, error: bErr } = await context.supabase
      .from("buildings")
      .select("id")
      .eq("property_id", data.property_id)
      .is("deleted_at", null);
    if (bErr) throw bErr;
    const ids = (bldgs ?? []).map((b) => b.id as string);
    if (ids.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("units")
      .select("id, code, type, status, area, bedrooms, bathrooms, rent_amount, currency_code, building_id")
      .in("building_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const quickCreateUnitForProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        property_id: z.string().uuid(),
        code: z.string().trim().min(1).max(64),
        type: z.string().trim().max(64).optional().nullable(),
        status: z.enum(["vacant", "occupied", "reserved", "maintenance"]).optional().default("vacant"),
        area: z.number().nonnegative().optional().nullable(),
        bedrooms: z.number().int().nonnegative().optional().nullable(),
        bathrooms: z.number().int().nonnegative().optional().nullable(),
        rent_amount: z.number().nonnegative().optional().nullable(),
        currency_code: z.string().trim().max(6).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: prop, error: pErr } = await context.supabase
      .from("properties")
      .select("id, org_id, title_ar, title_en, currency")
      .eq("id", data.property_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!prop) throw new Error("Property not found");
    const orgId = prop.org_id as string;

    // Find or auto-create a default building for this property
    const { data: existing, error: bErr } = await context.supabase
      .from("buildings")
      .select("id")
      .eq("property_id", data.property_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (bErr) throw bErr;

    let buildingId = existing?.id as string | undefined;
    if (!buildingId) {
      const name = (prop.title_ar as string) || (prop.title_en as string) || "Main";
      const { data: nb, error: nbErr } = await context.supabase
        .from("buildings")
        .insert({ org_id: orgId, property_id: data.property_id, name })
        .select("id")
        .single();
      if (nbErr) throw nbErr;
      buildingId = nb.id as string;
    }

    const { data: unit, error: uErr } = await context.supabase
      .from("units")
      .insert({
        org_id: orgId,
        building_id: buildingId,
        code: data.code,
        type: data.type ?? null,
        status: data.status ?? "vacant",
        area: data.area ?? null,
        bedrooms: data.bedrooms ?? null,
        bathrooms: data.bathrooms ?? null,
        rent_amount: data.rent_amount ?? null,
        currency_code: data.currency_code ?? (prop.currency as string | null) ?? "SAR",
      })
      .select("id, code, type, status, area, bedrooms, bathrooms, rent_amount, currency_code, building_id")
      .single();
    if (uErr) throw uErr;
    return unit;
  });
