import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ROLES, EDITOR_ROLES, type OrgRole } from "@/lib/permissions";
import { loadImportSettings } from "@/lib/import-settings.functions";

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

const contactType = z.enum(["buyer", "seller", "tenant", "landlord", "other"]);
const leadStage = z.enum([
  "new",
  "contacted",
  "qualified",
  "viewing",
  "negotiation",
  "won",
  "lost",
]);

const createContactSchema = z.object({
  org_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  contact_type: contactType.default("buyer"),
  notes: z.string().max(4000).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

const updateContactSchema = createContactSchema.omit({ org_id: true }).partial().extend({
  id: z.string().uuid(),
});

const createLeadSchema = z.object({
  org_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  property_id: z.string().uuid().optional().nullable(),
  stage: leadStage.default("new"),
  source: z.string().max(80).optional().nullable(),
  budget_min: z.number().nonnegative().optional().nullable(),
  budget_max: z.number().nonnegative().optional().nullable(),
  currency: z.string().min(3).max(6).default("SAR"),
  notes: z.string().max(4000).optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  lost_reason: z.string().max(500).optional().nullable(),
  expected_close_date: z.string().date().optional().nullable(),
});

const updateLeadSchema = createLeadSchema
  .omit({ org_id: true, contact_id: true })
  .partial()
  .extend({
    id: z.string().uuid(),
  });

async function getContactOrgId(supabase: ServerSupabase, id: string): Promise<string> {
  const { data, error } = await supabase
    .from("contacts")
    .select("org_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Contact not found");
  return data.org_id as string;
}

async function getLeadOrgId(supabase: ServerSupabase, id: string): Promise<string> {
  const { data, error } = await supabase.from("leads").select("org_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lead not found");
  return data.org_id as string;
}

function normalize<T extends Record<string, any>>(input: T): T {
  const out: Record<string, any> = { ...input };
  for (const k of Object.keys(out)) if (out[k] === "") out[k] = null;
  return out as T;
}

/* ---------- Contacts ---------- */

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contacts")
      .select("*")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createContactSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("contacts")
      .insert({ ...normalize(data), created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateContactSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const orgId = await getContactOrgId(context.supabase, id);
    await assertOrgRole(context.supabase, context.userId, orgId, EDITOR_ROLES);
    const { error } = await context.supabase.from("contacts").update(normalize(patch)).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getContactOrgId(context.supabase, data.id);
    await assertOrgRole(context.supabase, context.userId, orgId, ADMIN_ROLES);
    const { error } = await context.supabase.from("contacts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Leads ---------- */

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select(
        "*, contact:contacts(id, full_name, email, phone), property:properties(id, title_ar, title_en)",
      )
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createLeadSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({ ...normalize(data), created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateLeadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const orgId = await getLeadOrgId(context.supabase, id);
    await assertOrgRole(context.supabase, context.userId, orgId, EDITOR_ROLES);
    const { error } = await context.supabase.from("leads").update(normalize(patch)).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getLeadOrgId(context.supabase, data.id);
    await assertOrgRole(context.supabase, context.userId, orgId, ADMIN_ROLES);
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- CSV Import ---------- */

const importContactRow = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  contact_type: contactType.optional(),
  notes: z.string().max(4000).optional().nullable(),
  tags: z.string().max(400).optional().nullable(),
});

export const importContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        rows: z.array(z.record(z.string(), z.any())).min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);

    const settings = await loadImportSettings(context.supabase, data.org_id);
    const matchEmail = settings.contacts_match_keys.includes("email");
    const matchPhone = settings.contacts_match_keys.includes("phone");

    const { data: existing, error: exErr } = await context.supabase
      .from("contacts")
      .select("id, full_name, email, phone, contact_type, notes, tags")
      .eq("org_id", data.org_id);
    if (exErr) throw exErr;
    const byEmail = new Map<string, any>();
    const byPhone = new Map<string, any>();
    for (const r of existing ?? []) {
      if (matchEmail && r.email) byEmail.set(String(r.email).toLowerCase(), r);
      if (matchPhone && r.phone) byPhone.set(String(r.phone).replace(/\s+/g, ""), r);
    }

    const created: any[] = [];
    const updates: { id: string; patch: Record<string, any> }[] = [];
    const errors: { row: number; message: string }[] = [];
    let skipped = 0;
    let updated = 0;
    let index = 0;

    for (const raw of data.rows) {
      index++;
      const parsed = importContactRow.safeParse(raw);
      if (!parsed.success) {
        errors.push({ row: index, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      const r = parsed.data;
      const emailKey = r.email ? r.email.toLowerCase() : "";
      const phoneKey = r.phone ? r.phone.replace(/\s+/g, "") : "";
      const dup =
        (emailKey && byEmail.get(emailKey)) || (phoneKey && byPhone.get(phoneKey)) || null;
      const tags = r.tags
        ? String(r.tags)
            .split(/[,;|]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 20)
        : [];
      const row = {
        full_name: r.full_name,
        email: r.email || null,
        phone: r.phone || null,
        contact_type: r.contact_type ?? "buyer",
        notes: r.notes || null,
        tags,
      };
      if (dup) {
        if (settings.contacts_strategy === "skip") {
          skipped++;
          continue;
        }
        const patch: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (settings.contacts_strategy === "update") {
            if (v !== null && !(Array.isArray(v) && v.length === 0)) patch[k] = v;
          } else {
            // merge: only fill missing/empty existing fields
            const existingVal = (dup as any)[k];
            const isEmpty =
              existingVal === null ||
              existingVal === undefined ||
              existingVal === "" ||
              (Array.isArray(existingVal) && existingVal.length === 0);
            if (isEmpty && v !== null && !(Array.isArray(v) && v.length === 0)) patch[k] = v;
          }
        }
        if (Object.keys(patch).length) updates.push({ id: dup.id, patch });
        else skipped++;
        continue;
      }
      created.push({
        org_id: data.org_id,
        ...row,
        created_by: context.userId,
      });
      if (matchEmail && emailKey) byEmail.set(emailKey, { id: "pending", ...row });
      if (matchPhone && phoneKey) byPhone.set(phoneKey, { id: "pending", ...row });
    }

    let insertedCount = 0;
    if (created.length) {
      const { data: ins, error: insErr } = await context.supabase
        .from("contacts")
        .insert(created)
        .select("id");
      if (insErr) throw insErr;
      insertedCount = ins?.length ?? 0;
    }
    for (const u of updates) {
      const { error: upErr } = await context.supabase
        .from("contacts")
        .update(u.patch as any)
        .eq("id", u.id);
      if (upErr) errors.push({ row: 0, message: upErr.message });
      else updated++;
    }
    return { created: insertedCount, updated, skipped, errors };
  });

const importLeadRow = z.object({
  contact_email: z.string().trim().email().optional().nullable().or(z.literal("")),
  contact_phone: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  contact_name: z.string().trim().max(120).optional().nullable().or(z.literal("")),
  stage: leadStage.optional(),
  source: z.string().max(80).optional().nullable(),
  budget_min: z.union([z.string(), z.number()]).optional().nullable(),
  budget_max: z.union([z.string(), z.number()]).optional().nullable(),
  currency: z.string().min(3).max(6).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const importLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        rows: z.array(z.record(z.string(), z.any())).min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);

    const settings = await loadImportSettings(context.supabase, data.org_id);

    const { data: contacts, error: cErr } = await context.supabase
      .from("contacts")
      .select("id, email, phone, full_name")
      .eq("org_id", data.org_id);
    if (cErr) throw cErr;
    const byEmail = new Map<string, string>();
    const byPhone = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c.email) byEmail.set(String(c.email).toLowerCase(), c.id);
      if (c.phone) byPhone.set(String(c.phone).replace(/\s+/g, ""), c.id);
      if (c.full_name) byName.set(String(c.full_name).trim().toLowerCase(), c.id);
    }

    const { data: existingLeads, error: lErr } = await context.supabase
      .from("leads")
      .select("id, contact_id, stage, source, budget_min, budget_max, currency, notes")
      .eq("org_id", data.org_id);
    if (lErr) throw lErr;
    const openLeadByContact = new Map<string, any>();
    for (const l of existingLeads ?? []) {
      if (l.stage !== "won" && l.stage !== "lost") openLeadByContact.set(l.contact_id, l);
    }

    const created: any[] = [];
    const updates: { id: string; patch: Record<string, any> }[] = [];
    const errors: { row: number; message: string }[] = [];
    let skipped = 0;
    let updated = 0;
    let index = 0;

    for (const raw of data.rows) {
      index++;
      const parsed = importLeadRow.safeParse(raw);
      if (!parsed.success) {
        errors.push({ row: index, message: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      const r = parsed.data;
      const key =
        (r.contact_email && byEmail.get(r.contact_email.toLowerCase())) ||
        (r.contact_phone && byPhone.get(r.contact_phone.replace(/\s+/g, ""))) ||
        (r.contact_name && byName.get(r.contact_name.trim().toLowerCase())) ||
        null;
      if (!key) {
        errors.push({ row: index, message: "Contact not found in org" });
        continue;
      }
      const row = {
        stage: r.stage ?? "new",
        source: r.source || null,
        budget_min: toNum(r.budget_min),
        budget_max: toNum(r.budget_max),
        currency: r.currency || "SAR",
        notes: r.notes || null,
      };
      const dup = openLeadByContact.get(key);
      if (dup) {
        if (settings.leads_strategy === "skip") {
          skipped++;
          continue;
        }
        const patch: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (settings.leads_strategy === "update") {
            if (v !== null && v !== undefined) patch[k] = v;
          } else {
            const ex = (dup as any)[k];
            if ((ex === null || ex === undefined || ex === "") && v !== null && v !== undefined)
              patch[k] = v;
          }
        }
        if (Object.keys(patch).length) updates.push({ id: dup.id, patch });
        else skipped++;
        continue;
      }
      created.push({ org_id: data.org_id, contact_id: key, ...row, created_by: context.userId });
      openLeadByContact.set(key, { id: "pending", ...row });
    }

    let insertedCount = 0;
    if (created.length) {
      const { data: ins, error: insErr } = await context.supabase
        .from("leads")
        .insert(created)
        .select("id");
      if (insErr) throw insErr;
      insertedCount = ins?.length ?? 0;
    }
    for (const u of updates) {
      const { error: upErr } = await context.supabase
        .from("leads")
        .update(u.patch as any)
        .eq("id", u.id);
      if (upErr) errors.push({ row: 0, message: upErr.message });
      else updated++;
    }
    return { created: insertedCount, updated, skipped, errors };
  });
