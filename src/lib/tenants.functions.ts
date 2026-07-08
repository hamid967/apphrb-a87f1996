import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tenants")
      .select("id, full_name, email, phone, nationality, notes, created_at")
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("full_name");
    if (error) throw error;
    return rows ?? [];
  });

export const createTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        full_name: z.string().trim().min(2).max(140),
        email: z.string().email().optional().nullable().or(z.literal("")),
        phone: z.string().max(40).optional().nullable().or(z.literal("")),
        nationality: z.string().max(60).optional().nullable().or(z.literal("")),
        notes: z.string().max(2000).optional().nullable().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("tenants")
      .insert({
        org_id: data.org_id,
        full_name: data.full_name,
        email: data.email || null,
        phone: data.phone || null,
        nationality: data.nationality || null,
        notes: data.notes || null,
      })
      .select("id, full_name")
      .single();
    if (error) throw error;
    return row;
  });

export const updateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        org_id: z.string().uuid(),
        full_name: z.string().trim().min(2).max(140),
        email: z.string().email().optional().nullable().or(z.literal("")),
        phone: z.string().max(40).optional().nullable().or(z.literal("")),
        nationality: z.string().max(60).optional().nullable().or(z.literal("")),
        notes: z.string().max(2000).optional().nullable().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tenants")
      .update({
        full_name: data.full_name,
        email: data.email || null,
        phone: data.phone || null,
        nationality: data.nationality || null,
        notes: data.notes || null,
      })
      .eq("id", data.id)
      .eq("org_id", data.org_id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        org_id: z.string().uuid(),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tenants")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("org_id", data.org_id);
    if (error) throw error;
    await context.supabase.rpc("log_soft_delete", {
      _entity: "tenants",
      _action: "archive",
      _ids: [data.id],
      _reason: data.reason ?? undefined,
    });
    return { ok: true };
  });

export const listArchivedTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tenants")
      .select("id, full_name, email, phone, nationality, notes, deleted_at, created_at")
      .eq("org_id", data.org_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const restoreTenants = createServerFn({ method: "POST" })
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
      .from("tenants")
      .update({ deleted_at: null })
      .in("id", data.ids)
      .not("deleted_at", "is", null);
    if (error) throw error;
    await context.supabase.rpc("log_soft_delete", {
      _entity: "tenants",
      _action: "restore",
      _ids: data.ids,
      _reason: data.reason ?? undefined,
    });
    return { ok: true, count: data.ids.length };
  });
