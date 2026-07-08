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

const invoiceStatus = z.enum(["draft", "sent", "paid", "overdue", "cancelled"]);
const expenseCategory = z.enum([
  "marketing",
  "rent",
  "utilities",
  "salaries",
  "maintenance",
  "commissions",
  "office",
  "travel",
  "software",
  "other",
]);

// -------- Invoices --------
const createInvoiceSchema = z.object({
  org_id: z.string().uuid(),
  number: z.string().trim().min(1).max(40),
  contact_id: z.string().uuid().optional().nullable(),
  deal_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  issue_date: z.string().min(1),
  due_date: z.string().min(1).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  subtotal: z.number().nonnegative(),
  vat_rate: z.number().min(0).max(100).default(0),
  currency: z.string().min(3).max(6).default("USD"),
  status: invoiceStatus.default("draft"),
  notes: z.string().max(4000).optional().nullable(),
});

const updateInvoiceSchema = z.object({
  id: z.string().uuid(),
  patch: createInvoiceSchema.omit({ org_id: true }).partial().extend({
    paid_at: z.string().optional().nullable(),
  }),
});

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("org_id", data.orgId)
      .order("issue_date", { ascending: false })
      .limit(500);
    if (error) throw error;
    return rows ?? [];
  });

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createInvoiceSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const vat = +(data.subtotal * (data.vat_rate / 100)).toFixed(2);
    const total = +(data.subtotal + vat).toFixed(2);
    const { data: row, error } = await context.supabase
      .from("invoices")
      .insert({ ...data, vat_amount: vat, total, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateInvoiceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("invoices")
      .select("org_id, subtotal, vat_rate")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, existing.org_id, EDITOR_ROLES);
    const patch: any = { ...data.patch };
    const subtotal = patch.subtotal ?? existing.subtotal;
    const vatRate = patch.vat_rate ?? existing.vat_rate;
    patch.vat_amount = +(subtotal * (vatRate / 100)).toFixed(2);
    patch.total = +(subtotal + patch.vat_amount).toFixed(2);
    const { data: row, error } = await context.supabase
      .from("invoices")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("invoices")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, existing.org_id, ADMIN_ROLES);
    const { error } = await context.supabase.from("invoices").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------- Expenses --------
const createExpenseSchema = z.object({
  org_id: z.string().uuid(),
  spent_at: z.string().min(1),
  category: expenseCategory.default("other"),
  vendor: z.string().max(160).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  amount: z.number().nonnegative(),
  vat_amount: z.number().nonnegative().default(0),
  currency: z.string().min(3).max(6).default("USD"),
  receipt_url: z.string().url().optional().nullable().or(z.literal("")),
  property_id: z.string().uuid().optional().nullable(),
});

const updateExpenseSchema = z.object({
  id: z.string().uuid(),
  patch: createExpenseSchema.omit({ org_id: true }).partial(),
});

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("expenses")
      .select("*")
      .eq("org_id", data.orgId)
      .order("spent_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return rows ?? [];
  });

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createExpenseSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const payload = { ...data, receipt_url: data.receipt_url || null, created_by: context.userId };
    const { data: row, error } = await context.supabase
      .from("expenses")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateExpenseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("expenses")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, existing.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("expenses")
      .update(data.patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await context.supabase
      .from("expenses")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, existing.org_id, ADMIN_ROLES);
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------- Aggregates for VAT + P&L --------
export const getAccountingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; from: string; to: string }) =>
    z
      .object({
        orgId: z.string().uuid(),
        from: z.string().min(1),
        to: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [invRes, expRes] = await Promise.all([
      context.supabase
        .from("invoices")
        .select("id, number, issue_date, status, subtotal, vat_rate, vat_amount, total, currency")
        .eq("org_id", data.orgId)
        .gte("issue_date", data.from)
        .lte("issue_date", data.to),
      context.supabase
        .from("expenses")
        .select("id, spent_at, category, vendor, amount, vat_amount, currency")
        .eq("org_id", data.orgId)
        .gte("spent_at", data.from)
        .lte("spent_at", data.to),
    ]);
    if (invRes.error) throw invRes.error;
    if (expRes.error) throw expRes.error;
    return { invoices: invRes.data ?? [], expenses: expRes.data ?? [] };
  });
