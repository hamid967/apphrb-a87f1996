import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum([
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);
const sourceEnum = z.enum(["internal", "portal", "website", "whatsapp", "other"]);

const createSchema = z.object({
  org_id: z.string().uuid(),
  property_id: z.string().uuid().optional().nullable(),
  visitor_name: z.string().trim().min(2).max(120),
  visitor_phone: z.string().trim().max(40).optional().nullable(),
  visitor_email: z.string().trim().email().max(180).optional().nullable().or(z.literal("")),
  scheduled_at: z.string().min(10),
  duration_min: z.number().int().min(5).max(480).default(30),
  source: sourceEnum.default("internal"),
  notes: z.string().max(1000).optional().nullable(),
});

export const createViewing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: ok, error: mErr } = await context.supabase.rpc("is_org_member", {
      _org: data.org_id,
      _user: context.userId,
    });
    if (mErr) throw mErr;
    if (!ok) throw new Error("Forbidden");

    const { data: row, error } = await context.supabase
      .from("property_viewings")
      .insert({
        org_id: data.org_id,
        property_id: data.property_id ?? null,
        created_by: context.userId,
        visitor_name: data.visitor_name,
        visitor_phone: data.visitor_phone || null,
        visitor_email: data.visitor_email || null,
        scheduled_at: new Date(data.scheduled_at).toISOString(),
        duration_min: data.duration_min,
        source: data.source,
        notes: data.notes || null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const listViewings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        from: z.string().optional().nullable(),
        to: z.string().optional().nullable(),
        status: statusEnum.optional().nullable(),
        property_id: z.string().uuid().optional().nullable(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("property_viewings")
      .select(
        "id, org_id, property_id, visitor_name, visitor_phone, visitor_email, scheduled_at, duration_min, status, source, notes, created_at, properties(id, title_ar, title_en, city)",
      )
      .eq("org_id", data.org_id)
      .order("scheduled_at", { ascending: true })
      .limit(data.limit);
    if (data.from) q = q.gte("scheduled_at", data.from);
    if (data.to) q = q.lte("scheduled_at", data.to);
    if (data.status) q = q.eq("status", data.status);
    if (data.property_id) q = q.eq("property_id", data.property_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const updateViewingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("property_viewings")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteViewing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("property_viewings")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
