import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const statusEnum = z.enum([
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
]);

async function assertMember(supabase: any, userId: string, orgId: string) {
  const { data, error } = await supabase.rpc("is_org_member", {
    _org: orgId,
    _user: userId,
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden");
}

/** List tickets with their technician + parts summary for the interactive log. */
export const listMaintenanceLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { org_id: string; status?: string | null; q?: string | null }) =>
      z
        .object({
          org_id: z.string().uuid(),
          status: statusEnum.optional().nullable(),
          q: z.string().max(200).optional().nullable(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.org_id);
    let q = context.supabase
      .from("maintenance_tickets")
      .select(
        "id, ticket_no, title, description, status, priority, scheduled_at, completed_at, cost, currency, created_at, updated_at, property:properties(id, title_ar, title_en, city), technician:technicians(id, full_name, phone, specialty), parts:maintenance_parts(id, name, sku, quantity, unit_cost, currency, supplier)",
      )
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    if (data.q && data.q.trim().length >= 2) {
      const like = `%${data.q.trim().replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`title.ilike.${like},ticket_no.ilike.${like},description.ilike.${like}`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const assignTechnician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { ticket_id: string; technician_id: string | null }) =>
      z
        .object({
          ticket_id: z.string().uuid(),
          technician_id: z.string().uuid().nullable(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      technician_id: string | null;
      status?: "assigned";
    } = { technician_id: data.technician_id };
    // Auto-move to assigned if it was open
    const { data: cur } = await context.supabase
      .from("maintenance_tickets")
      .select("status")
      .eq("id", data.ticket_id)
      .single();
    if (cur?.status === "open" && data.technician_id) patch.status = "assigned";
    const { data: row, error } = await context.supabase
      .from("maintenance_tickets")
      .update(patch)
      .eq("id", data.ticket_id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { ticket_id: string; status: string }) =>
      z
        .object({
          ticket_id: z.string().uuid(),
          status: statusEnum,
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      status: z.infer<typeof statusEnum>;
      completed_at?: string;
    } = { status: data.status };
    if (data.status === "completed") patch.completed_at = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("maintenance_tickets")
      .update(patch)
      .eq("id", data.ticket_id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const addMaintenancePart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    ticket_id: string;
    name: string;
    sku?: string | null;
    quantity: number;
    unit_cost: number;
    supplier?: string | null;
    notes?: string | null;
  }) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        name: z.string().trim().min(1).max(160),
        sku: z.string().max(80).optional().nullable(),
        quantity: z.number().positive().max(100000),
        unit_cost: z.number().min(0).max(10_000_000),
        supplier: z.string().max(160).optional().nullable(),
        notes: z.string().max(800).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: t, error: e1 } = await context.supabase
      .from("maintenance_tickets")
      .select("org_id, currency")
      .eq("id", data.ticket_id)
      .single();
    if (e1) throw e1;
    await assertMember(context.supabase, context.userId, t.org_id);
    const { data: row, error } = await context.supabase
      .from("maintenance_parts")
      .insert({
        org_id: t.org_id,
        ticket_id: data.ticket_id,
        name: data.name,
        sku: data.sku ?? null,
        quantity: data.quantity,
        unit_cost: data.unit_cost,
        currency: t.currency ?? "SAR",
        supplier: data.supplier ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteMaintenancePart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("maintenance_parts")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });