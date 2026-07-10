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

const dealStatus = z.enum(["offer", "counter", "accepted", "contract", "closed", "cancelled"]);
const commissionStatus = z.enum(["pending", "invoiced", "paid"]);

function normalize<T extends Record<string, any>>(input: T): T {
  const out: Record<string, any> = { ...input };
  for (const k of Object.keys(out)) if (out[k] === "") out[k] = null;
  return out as T;
}

const createDealSchema = z.object({
  org_id: z.string().uuid(),
  property_id: z.string().uuid(),
  primary_contact_id: z.string().uuid(),
  lead_id: z.string().uuid().optional().nullable(),
  status: dealStatus.default("offer"),
  offer_amount: z.number().nonnegative().optional().nullable(),
  agreed_amount: z.number().nonnegative().optional().nullable(),
  currency: z.string().min(3).max(6).default("SAR"),
  offer_date: z.string().optional().nullable(),
  close_date: z.string().optional().nullable(),
  contract_url: z.string().url().max(2000).optional().nullable().or(z.literal("")),
  notes: z.string().max(4000).optional().nullable(),
});

const updateDealSchema = createDealSchema
  .omit({ org_id: true, property_id: true, primary_contact_id: true })
  .partial()
  .extend({ id: z.string().uuid() });

async function getDealOrgId(supabase: ServerSupabase, id: string): Promise<string> {
  const { data, error } = await supabase.from("deals").select("org_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Deal not found");
  return data.org_id as string;
}

export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("deals")
      .select(
        "*, property:properties(id, title_ar, title_en, cover_image_url), contact:contacts(id, full_name, email, phone), lead:leads(id, stage)",
      )
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const getDeal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("deals")
      .select(
        "*, property:properties(id, title_ar, title_en, cover_image_url, city, listing_type), contact:contacts(id, full_name, email, phone), lead:leads(id, stage, source)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Deal not found");
    return row;
  });

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createDealSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("deals")
      .insert({ ...normalize(data), created_by: context.userId } as any)
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const updateDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateDealSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const orgId = await getDealOrgId(context.supabase, id);
    await assertOrgRole(context.supabase, context.userId, orgId, EDITOR_ROLES);
    const { error } = await context.supabase
      .from("deals")
      .update(normalize(patch) as any)
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getDealOrgId(context.supabase, data.id);
    await assertOrgRole(context.supabase, context.userId, orgId, ADMIN_ROLES);
    const { error } = await context.supabase.from("deals").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Lead → Deal conversion ---------- */

const convertLeadSchema = z.object({
  lead_id: z.string().uuid(),
  property_id: z.string().uuid().optional().nullable(),
  offer_amount: z.number().nonnegative().optional().nullable(),
  currency: z.string().min(3).max(6).optional(),
  notes: z.string().max(4000).optional().nullable(),
});

export const convertLeadToDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => convertLeadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: lead, error: le } = await context.supabase
      .from("leads")
      .select("id, org_id, contact_id, property_id, currency, budget_max, budget_min, notes, stage")
      .eq("id", data.lead_id)
      .maybeSingle();
    if (le) throw le;
    if (!lead) throw new Error("Lead not found");
    const propertyId = data.property_id ?? lead.property_id;
    if (!propertyId) throw new Error("Property is required to convert lead");
    await assertOrgRole(context.supabase, context.userId, lead.org_id, EDITOR_ROLES);

    const offerAmount = data.offer_amount ?? lead.budget_max ?? lead.budget_min ?? null;
    const currency = data.currency ?? lead.currency ?? "SAR";

    const { data: deal, error } = await context.supabase
      .from("deals")
      .insert({
        org_id: lead.org_id,
        property_id: propertyId,
        primary_contact_id: lead.contact_id,
        lead_id: lead.id,
        status: "offer",
        offer_amount: offerAmount,
        currency,
        offer_date: new Date().toISOString().slice(0, 10),
        notes: data.notes ?? lead.notes ?? null,
        created_by: context.userId,
      } as any)
      .select("id")
      .single();
    if (error) throw error;

    // Move the lead to "won" — its trigger logs a stage_change activity.
    await context.supabase
      .from("leads")
      .update({ stage: "won" } as any)
      .eq("id", lead.id);

    // Log an explicit "converted" activity linking the new deal so the
    // lead's history (and the deal's linked history) shows the conversion.
    await context.supabase.from("lead_activities").insert({
      org_id: lead.org_id,
      lead_id: lead.id,
      actor_id: context.userId,
      activity_type: "converted",
      from_stage: lead.stage,
      to_stage: "won",
      body: data.notes ?? "Converted to deal",
      metadata: {
        deal_id: deal.id,
        offer_amount: offerAmount,
        currency,
        property_id: propertyId,
      },
    } as any);

    return { id: deal.id as string };
  });


/* ---------- Commissions ---------- */

const createCommissionSchema = z.object({
  deal_id: z.string().uuid(),
  agent_id: z.string().uuid().optional().nullable(),
  percent: z.number().min(0).max(100).optional().nullable(),
  amount: z.number().nonnegative().optional().nullable(),
  currency: z.string().min(3).max(6).default("SAR"),
  status: commissionStatus.default("pending"),
  paid_at: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateCommissionSchema = createCommissionSchema
  .omit({ deal_id: true })
  .partial()
  .extend({ id: z.string().uuid() });

async function getCommissionOrgId(supabase: ServerSupabase, id: string): Promise<string> {
  const { data, error } = await supabase
    .from("commissions")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Commission not found");
  return data.org_id as string;
}

export const listCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ deal_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("commissions")
      .select("*")
      .eq("deal_id", data.deal_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const createCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createCommissionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getDealOrgId(context.supabase, data.deal_id);
    await assertOrgRole(context.supabase, context.userId, orgId, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("commissions")
      .insert({ ...normalize(data), org_id: orgId, created_by: context.userId } as any)
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const updateCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateCommissionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const orgId = await getCommissionOrgId(context.supabase, id);
    await assertOrgRole(context.supabase, context.userId, orgId, EDITOR_ROLES);
    const { error } = await context.supabase
      .from("commissions")
      .update(normalize(patch) as any)
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getCommissionOrgId(context.supabase, data.id);
    await assertOrgRole(context.supabase, context.userId, orgId, ADMIN_ROLES);
    const { error } = await context.supabase.from("commissions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
