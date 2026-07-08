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

const ticketStatus = z.enum([
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
]);
const ticketPriority = z.enum(["low", "medium", "high", "urgent"]);

// -------- Technicians --------
const createTechnicianSchema = z.object({
  org_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(160),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(40).optional().nullable(),
  specialty: z.string().max(120).optional().nullable(),
  hourly_rate: z.number().nonnegative().optional().nullable(),
  active: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

export const listTechnicians = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("technicians")
      .select("*")
      .eq("org_id", data.orgId)
      .order("active", { ascending: false })
      .order("full_name");
    if (error) throw error;
    return rows ?? [];
  });

export const createTechnician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createTechnicianSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const payload = { ...data, email: data.email || null, created_by: context.userId };
    const { data: row, error } = await context.supabase
      .from("technicians")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateTechnician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; patch: Record<string, unknown> }) =>
    z
      .object({
        id: z.string().uuid(),
        patch: createTechnicianSchema.omit({ org_id: true }).partial(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("technicians")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, existing.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("technicians")
      .update(data.patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteTechnician = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("technicians")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, existing.org_id, ADMIN_ROLES);
    const { error } = await context.supabase.from("technicians").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------- Tickets / Work orders --------
const createTicketSchema = z.object({
  org_id: z.string().uuid(),
  ticket_no: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  reported_by_contact_id: z.string().uuid().optional().nullable(),
  technician_id: z.string().uuid().optional().nullable(),
  priority: ticketPriority.default("medium"),
  status: ticketStatus.default("open"),
  scheduled_at: z.string().optional().nullable(),
  cost: z.number().nonnegative().optional().nullable(),
  currency: z.string().min(3).max(6).default("USD"),
  notes: z.string().max(4000).optional().nullable(),
});

const updateTicketSchema = z.object({
  id: z.string().uuid(),
  patch: createTicketSchema.omit({ org_id: true }).partial().extend({
    completed_at: z.string().optional().nullable(),
  }),
});

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("maintenance_tickets")
      .select("*, property:properties(id,title_ar,title_en), technician:technicians(id,full_name)")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return rows ?? [];
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createTicketSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const status = data.technician_id && data.status === "open" ? "assigned" : data.status;
    const { data: row, error } = await context.supabase
      .from("maintenance_tickets")
      .insert({ ...data, status, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateTicketSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("maintenance_tickets")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, existing.org_id, EDITOR_ROLES);
    const patch: any = { ...data.patch };
    if (patch.status === "completed" && !patch.completed_at)
      patch.completed_at = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("maintenance_tickets")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("maintenance_tickets")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, existing.org_id, ADMIN_ROLES);
    const { error } = await context.supabase.from("maintenance_tickets").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
