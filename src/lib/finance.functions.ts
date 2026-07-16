/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const paymentMethod = z.enum(["cash", "bank_transfer", "cheque", "mada", "other"]);
const expenseScope = z.enum(["property", "personal"]);
const vatMode = z.enum(["inclusive", "exclusive", "exempt"]);

export const listLeasePayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { org_id: string }) =>
    z.object({ org_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("lease_payments")
      .select(
        [
          "id",
          "org_id",
          "contract_id",
          "tenant_id",
          "property_id",
          "unit_id",
          "due_date",
          "amount",
          "paid_amount",
          "paid_at",
          "payment_method",
          "receipt_number",
          "status",
          "notes",
          "tenant:tenants(id,full_name)",
          "property:properties(id,title_ar,title_en,city)",
          "unit:units(id,code,type)",
          "contract:contracts(id,contract_number)",
        ].join(","),
      )
      .eq("org_id", data.org_id)
      .order("due_date", { ascending: true })
      .limit(800);
    if (error) throw error;
    return rows ?? [];
  });

export const listPaymentReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { org_id: string; lease_payment_id?: string | null }) =>
    z
      .object({
        org_id: z.string().uuid(),
        lease_payment_id: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("payment_receipts")
      .select("*, lease_payment:lease_payments(id,due_date,amount,status)")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.lease_payment_id) q = q.eq("lease_payment_id", data.lease_payment_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const recordLeasePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        lease_payment_id: z.string().uuid(),
        amount: z.number().positive(),
        payment_method: paymentMethod,
        paid_at: z.string().min(1),
        notes: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc(
      "hbspro_record_lease_payment",
      {
        _lease_payment_id: data.lease_payment_id,
        _amount: data.amount,
        _payment_method: data.payment_method,
        _paid_at: new Date(data.paid_at).toISOString(),
        _notes: data.notes ?? null,
      },
    );
    if (error) throw error;
    return row;
  });

export const reversePaymentReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { receipt_id: string; notes?: string | null }) =>
    z
      .object({ receipt_id: z.string().uuid(), notes: z.string().max(500).optional().nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc(
      "hbspro_reverse_payment_receipt",
      {
        _receipt_id: data.receipt_id,
        _notes: data.notes ?? null,
      },
    );
    if (error) throw error;
    return row;
  });

export const listExpenseCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { org_id: string; scope?: "property" | "personal" | null }) =>
    z.object({ org_id: z.string().uuid(), scope: expenseScope.optional().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("expense_categories")
      .select("*")
      .eq("org_id", data.org_id)
      .is("archived_at", null)
      .order("is_default", { ascending: false })
      .order("name_ar", { ascending: true });
    if (data.scope) q = q.eq("scope", data.scope);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listFinanceExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { org_id: string; scope?: "property" | "personal" | null }) =>
    z.object({ org_id: z.string().uuid(), scope: expenseScope.optional().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("expenses")
      .select(
        [
          "id",
          "org_id",
          "spent_at",
          "scope",
          "category",
          "category_id",
          "vendor",
          "vendor_id",
          "property_id",
          "unit_id",
          "description",
          "amount",
          "net_amount",
          "vat_amount",
          "gross_amount",
          "vat_mode",
          "payment_method",
          "receipt_url",
          "receipt_path",
          "source",
          "finance_status",
          "currency",
          "category_ref:expense_categories(id,name_ar,name_en,scope)",
          "property:properties(id,title_ar,title_en,city)",
          "unit:units(id,code,type)",
          "vendor_ref:vendors(id,name,specialty)",
        ].join(","),
      )
      .eq("org_id", data.org_id)
      .is("archived_at", null)
      .order("spent_at", { ascending: false })
      .limit(800);
    if (data.scope) q = q.eq("scope", data.scope);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const createFinanceExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        spent_at: z.string().min(1),
        scope: expenseScope,
        category_id: z.string().uuid().optional().nullable(),
        category: z.string().max(80).default("other"),
        property_id: z.string().uuid().optional().nullable(),
        unit_id: z.string().uuid().optional().nullable(),
        vendor_id: z.string().uuid().optional().nullable(),
        vendor: z.string().max(160).optional().nullable(),
        description: z.string().max(2000).optional().nullable(),
        amount: z.number().positive(),
        vat_mode: vatMode.default("inclusive"),
        payment_method: paymentMethod.optional().nullable(),
        receipt_url: z.string().url().optional().nullable().or(z.literal("")),
        receipt_path: z.string().max(500).optional().nullable(),
        currency: z.string().min(3).max(6).default("SAR"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const fallbackCategory = data.category === "maintenance" ? "maintenance" : "other";
    const { data: row, error } = await (context.supabase as any)
      .from("expenses")
      .insert({
        ...data,
        category: fallbackCategory,
        vendor: data.vendor || null,
        property_id: data.scope === "property" ? (data.property_id ?? null) : null,
        unit_id: data.scope === "property" ? (data.unit_id ?? null) : null,
        receipt_url: data.receipt_url || null,
        receipt_path: data.receipt_path || null,
        source: "manual",
        finance_status: "confirmed",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const updateFinanceExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          spent_at: z.string().min(1).optional(),
          scope: expenseScope.optional(),
          category_id: z.string().uuid().optional().nullable(),
          category: z.string().max(80).optional(),
          property_id: z.string().uuid().optional().nullable(),
          unit_id: z.string().uuid().optional().nullable(),
          vendor_id: z.string().uuid().optional().nullable(),
          vendor: z.string().max(160).optional().nullable(),
          description: z.string().max(2000).optional().nullable(),
          amount: z.number().positive().optional(),
          vat_mode: vatMode.optional(),
          payment_method: paymentMethod.optional().nullable(),
          receipt_url: z.string().url().optional().nullable().or(z.literal("")),
          receipt_path: z.string().max(500).optional().nullable(),
          currency: z.string().min(3).max(6).optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch = {
      ...data.patch,
      vendor: data.patch.vendor || null,
      receipt_url: data.patch.receipt_url || null,
      receipt_path: data.patch.receipt_path || null,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await (context.supabase as any)
      .from("expenses")
      .update(patch)
      .eq("id", data.id)
      .is("archived_at", null)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const archiveFinanceExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("expenses")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
