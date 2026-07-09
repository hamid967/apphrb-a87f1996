import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Write-side counterpart to `company-modules.functions.ts` (list-only).
 * Covers Vouchers (payments) and Commissions CRUD used by dashboard pages.
 */

// ---------------- Vouchers (backed by `payments` table) ----------------

const voucherInput = z.object({
  org_id: z.string().uuid(),
  reference: z.string().max(50).optional().nullable(),
  amount: z.number().nonnegative(),
  currency_code: z.string().min(3).max(3).default("SAR"),
  status: z.enum(["draft", "pending", "paid", "cancelled"]).default("pending"),
  paid_at: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => voucherInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("payments")
      .insert({
        org_id: data.org_id,
        reference: data.reference ?? null,
        amount: data.amount,
        currency_code: data.currency_code,
        status: data.status,
        paid_at: data.paid_at ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const updateVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ id: z.string().uuid() })
      .merge(voucherInput.partial().omit({ org_id: true }))
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("payments").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("payments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------------- Commissions ----------------

const commissionInput = z.object({
  org_id: z.string().uuid(),
  deal_id: z.string().uuid().optional().nullable(),
  agent_id: z.string().uuid().optional().nullable(),
  percent: z.number().min(0).max(100).optional().nullable(),
  amount: z.number().nonnegative().optional().nullable(),
  currency: z.string().min(3).max(3).default("SAR"),
  status: z.enum(["pending", "approved", "paid", "cancelled"]).default("pending"),
  paid_at: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => commissionInput.parse(i))
  .handler(async ({ data, context }) => {
    if (data.percent == null && data.amount == null) {
      throw new Error("يجب تحديد نسبة أو مبلغ للعمولة.");
    }
    const { data: row, error } = await context.supabase
      .from("commissions")
      .insert({
        org_id: data.org_id,
        deal_id: data.deal_id ?? null,
        agent_id: data.agent_id ?? null,
        percent: data.percent ?? null,
        amount: data.amount ?? null,
        currency: data.currency,
        status: data.status,
        paid_at: data.paid_at ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const updateCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ id: z.string().uuid() })
      .merge(commissionInput.partial().omit({ org_id: true }))
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("commissions").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("commissions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
