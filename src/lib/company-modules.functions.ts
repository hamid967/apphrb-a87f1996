import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgSchema = z.object({ org_id: z.string().uuid() });

// ---------- Units ----------
export const listUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("units")
      .select("id, code, type, status, area, bedrooms, bathrooms, rent_amount, sale_price, currency_code, building_id, created_at")
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("code");
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Owners ----------
export const listOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("owners")
      .select("id, full_name, email, phone, address, notes, created_at")
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("full_name");
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Vouchers (payments) ----------
export const listVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("payments")
      .select("id, reference, amount, currency_code, status, paid_at, notes, created_at")
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Commissions ----------
export const listCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("commissions")
      .select("id, percent, amount, currency, status, paid_at, notes, deal_id, agent_id, created_at")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Leads ----------
export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("id, stage, source, budget_min, budget_max, currency, notes, assigned_to, created_at")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Deals ----------
export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("deals")
      .select("id, status, offer_amount, agreed_amount, currency, offer_date, close_date, notes, created_at")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Meetings ----------
export const listMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meetings")
      .select("id, title, description, starts_at, ends_at, location, link, created_at")
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Tasks ----------
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tasks")
      .select("id, title, description, due_at, priority, status, assignee_id, created_at")
      .eq("org_id", data.org_id)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Documents ----------
export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("documents")
      .select("id, title, category, status, signature_status, signed_at, tags, created_at")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Viewings ----------
export const listViewings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("property_viewings")
      .select("id, visitor_name, visitor_phone, visitor_email, scheduled_at, duration_min, status, source, notes, created_at")
      .eq("org_id", data.org_id)
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Valuations ----------
export const listValuations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => orgSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("property_valuations")
      .select("id, purpose, suggested_price, min_price, max_price, currency, confidence, ai_notes, created_at")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });
