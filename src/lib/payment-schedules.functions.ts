import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Wave 2 — Payment schedule engine.
 *
 * Generates and manages installment rows in `payment_schedules`. Sources
 * are one of: contract (rent installments), deal (staged sale payments),
 * or commission (multi-payment agent compensation).
 *
 * Frequencies: monthly | quarterly | semiannual | annual — computed via
 * calendar month arithmetic to keep due dates aligned to the anchor day.
 *
 * VAT rate is applied per installment; total_amount = amount + vat_amount.
 * Wave 3 will add automatic voucher creation and ZATCA invoice linkage.
 */

export type ScheduleFrequency = "monthly" | "quarterly" | "semiannual" | "annual";
export type ScheduleSource = "contract" | "deal" | "commission";
export type ScheduleStatus =
  | "pending" | "invoiced" | "paid" | "overdue" | "cancelled";

const FREQ_MONTHS: Record<ScheduleFrequency, number> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
};

const CreateSchema = z.object({
  orgId: z.string().uuid(),
  sourceType: z.enum(["contract", "deal", "commission"]),
  sourceId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(1).max(120),
  frequency: z.enum(["monthly", "quarterly", "semiannual", "annual"]),
  amount: z.number().positive(),
  vatRate: z.number().min(0).max(100).default(15),
  notes: z.string().max(500).optional(),
});

function addMonths(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const out = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), day));
  return out.toISOString().slice(0, 10);
}

export const createPaymentSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const step = FREQ_MONTHS[data.frequency];
    const vatAmt = +(data.amount * (data.vatRate / 100)).toFixed(2);
    const total = +(data.amount + vatAmt).toFixed(2);

    const rows = Array.from({ length: data.count }, (_, i) => ({
      org_id: data.orgId,
      source_type: data.sourceType,
      contract_id:   data.sourceType === "contract"   ? data.sourceId : null,
      deal_id:       data.sourceType === "deal"       ? data.sourceId : null,
      commission_id: data.sourceType === "commission" ? data.sourceId : null,
      installment_no: i + 1,
      due_date: addMonths(data.startDate, i * step),
      amount: data.amount,
      vat_rate: data.vatRate,
      vat_amount: vatAmt,
      total_amount: total,
      status: "pending" as const,
      notes: data.notes ?? null,
      created_by: userId,
    }));

    const { data: inserted, error } = await supabase
      .from("payment_schedules")
      .insert(rows)
      .select("id, installment_no, due_date, total_amount");
    if (error) throw new Error(error.message);
    return { ok: true, created: inserted?.length ?? 0, items: inserted ?? [] };
  });

const ListSchema = z.object({
  orgId: z.string().uuid().optional(),
  status: z.enum(["pending", "invoiced", "paid", "overdue", "cancelled"]).optional(),
  sourceType: z.enum(["contract", "deal", "commission"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listPaymentSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("payment_schedules")
      .select(
        "id, org_id, source_type, contract_id, deal_id, commission_id, installment_no, due_date, amount, vat_amount, total_amount, status, voucher_id, invoice_id, notes, created_at",
      )
      .order("due_date", { ascending: true })
      .limit(data.limit);
    if (data.orgId) q = q.eq("org_id", data.orgId);
    if (data.status) q = q.eq("status", data.status);
    if (data.sourceType) q = q.eq("source_type", data.sourceType);
    if (data.from) q = q.gte("due_date", data.from);
    if (data.to) q = q.lte("due_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

const MarkPaidSchema = z.object({
  scheduleId: z.string().uuid(),
  voucherId: z.string().uuid().optional(),
});
export const markInstallmentPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => MarkPaidSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("payment_schedules")
      .update({ status: "paid", voucher_id: data.voucherId ?? null })
      .eq("id", data.scheduleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CancelSchema = z.object({ scheduleId: z.string().uuid() });
export const cancelInstallment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CancelSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("payment_schedules")
      .update({ status: "cancelled" })
      .eq("id", data.scheduleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
