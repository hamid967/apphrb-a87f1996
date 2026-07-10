import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { regenerateZatcaPayload } from "@/lib/zatca/regenerate";


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

/**
 * Ensure a `payments` (voucher) row exists for a schedule and link it back.
 * Idempotent — returns the existing voucher when already linked. Uses the
 * caller's supabase client so RLS applies.
 */
async function ensureVoucherForSchedule(
  supabase: any,
  scheduleId: string,
  opts: { markPaid?: boolean } = {},
): Promise<{ voucherId: string; created: boolean }> {
  const { data: sched, error: sErr } = await supabase
    .from("payment_schedules")
    .select("id, org_id, contract_id, installment_no, due_date, total_amount, voucher_id, status, notes")
    .eq("id", scheduleId)
    .single();
  if (sErr) throw new Error(sErr.message);
  if (!sched) throw new Error("Schedule not found");
  if (sched.status === "cancelled") throw new Error("Schedule is cancelled");

  if (sched.voucher_id) {
    if (opts.markPaid) {
      await supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", sched.voucher_id);
      await supabase
        .from("payment_schedules")
        .update({ status: "paid" })
        .eq("id", scheduleId);
    }
    return { voucherId: sched.voucher_id, created: false };
  }

  const paidAtIso = opts.markPaid
    ? new Date().toISOString()
    : new Date(`${sched.due_date}T00:00:00Z`).toISOString();

  const { data: pay, error: pErr } = await supabase
    .from("payments")
    .insert({
      org_id: sched.org_id,
      contract_id: sched.contract_id,
      amount: sched.total_amount,
      currency_code: "SAR",
      reference: `INST-${sched.installment_no}`,
      paid_at: paidAtIso,
      status: opts.markPaid ? "paid" : "pending",
      notes: sched.notes ?? `Installment #${sched.installment_no}`,
    })
    .select("id")
    .single();
  if (pErr) throw new Error(pErr.message);

  const nextStatus = opts.markPaid ? "paid" : "invoiced";
  const { error: uErr } = await supabase
    .from("payment_schedules")
    .update({ voucher_id: pay.id, status: nextStatus })
    .eq("id", scheduleId);
  if (uErr) throw new Error(uErr.message);

  return { voucherId: pay.id, created: true };
}

const CreateVoucherSchema = z.object({ scheduleId: z.string().uuid() });
export const createVoucherFromSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateVoucherSchema.parse(data))
  .handler(async ({ data, context }) => {
    const res = await ensureVoucherForSchedule(context.supabase, data.scheduleId);
    return { ok: true, ...res };
  });

const MarkPaidSchema = z.object({
  scheduleId: z.string().uuid(),
  voucherId: z.string().uuid().optional(),
});
export const markInstallmentPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => MarkPaidSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (data.voucherId) {
      await context.supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", data.voucherId);
      const { error } = await context.supabase
        .from("payment_schedules")
        .update({ status: "paid", voucher_id: data.voucherId })
        .eq("id", data.scheduleId);
      if (error) throw new Error(error.message);
      return { ok: true, voucherId: data.voucherId, created: false };
    }
    const res = await ensureVoucherForSchedule(context.supabase, data.scheduleId, {
      markPaid: true,
    });
    return { ok: true, ...res };
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

/**
 * Batch-generate draft vouchers for every pending/overdue installment due
 * on/before `throughDate` (defaults to today). Idempotent — skips schedules
 * already linked to a voucher. Intended for both manual UI use and cron.
 */
const GenerateDueSchema = z.object({
  orgId: z.string().uuid().optional(),
  throughDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});
export const generateDueVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenerateDueSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const through = data.throughDate ?? new Date().toISOString().slice(0, 10);
    let q = context.supabase
      .from("payment_schedules")
      .select("id")
      .is("voucher_id", null)
      .in("status", ["pending", "overdue"])
      .lte("due_date", through)
      .order("due_date", { ascending: true })
      .limit(data.limit);
    if (data.orgId) q = q.eq("org_id", data.orgId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let created = 0;
    const errors: Array<{ id: string; message: string }> = [];
    for (const r of rows ?? []) {
      try {
        const res = await ensureVoucherForSchedule(context.supabase, r.id);
        if (res.created) created += 1;
      } catch (e) {
        errors.push({ id: r.id, message: (e as Error).message });
      }
    }
    return { ok: true, scanned: rows?.length ?? 0, created, errors };
  });

/* -------------------------------------------------------------------------- */
/*  Wave 2 — payment_schedules → invoices (with ZATCA) integration           */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the buyer contact id for a schedule based on its source.
 * Contracts → tenants have no `contact_id` column in this schema, so we
 * leave the invoice's `contact_id` NULL. Deals may already carry a
 * contact_id; commissions don't. Best-effort — returns null when unknown.
 */
async function resolveContactId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  row: { source_type: string; contract_id: string | null; deal_id: string | null; commission_id: string | null },
): Promise<string | null> {
  if (row.source_type === "deal" && row.deal_id) {
    const { data } = await supabase
      .from("deals")
      .select("contact_id")
      .eq("id", row.deal_id)
      .maybeSingle();
    return (data?.contact_id as string | null) ?? null;
  }
  return null;
}

/**
 * Idempotent: creates a draft invoice for a schedule row, links
 * `payment_schedules.invoice_id`, marks the schedule as `invoiced`, and
 * generates the ZATCA payload (UBL + hash + QR TLV). Returns the linked
 * invoice regardless of whether it was newly created.
 */
async function ensureInvoiceForSchedule(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  scheduleId: string,
): Promise<{ invoiceId: string; number: string; created: boolean }> {
  const { data: sched, error: sErr } = await supabase
    .from("payment_schedules")
    .select(
      "id, org_id, source_type, contract_id, deal_id, commission_id, installment_no, due_date, amount, vat_rate, vat_amount, total_amount, invoice_id, status, notes",
    )
    .eq("id", scheduleId)
    .single();
  if (sErr) throw new Error(sErr.message);
  if (!sched) throw new Error("Schedule not found");
  if (sched.status === "cancelled") throw new Error("Schedule is cancelled");

  if (sched.invoice_id) {
    const { data: existing } = await supabase
      .from("invoices")
      .select("id, number")
      .eq("id", sched.invoice_id)
      .maybeSingle();
    if (existing) {
      return { invoiceId: existing.id, number: existing.number, created: false };
    }
    // Dangling link → fall through and create a fresh invoice.
  }

  const contactId = await resolveContactId(supabase, sched);

  // Per-org monotonic sequence for invoice numbers.
  const { data: seqRaw, error: seqErr } = await supabase.rpc("next_org_sequence", {
    _org: sched.org_id,
    _kind: "invoice",
  });
  if (seqErr) throw new Error(seqErr.message);
  const seq = Number(seqRaw ?? 0);
  const year = new Date().getUTCFullYear();
  const number = `INV-${year}-${String(seq).padStart(6, "0")}`;

  const description = sched.source_type === "contract"
    ? `Rent installment #${sched.installment_no}`
    : sched.source_type === "deal"
      ? `Deal installment #${sched.installment_no}`
      : `Commission installment #${sched.installment_no}`;

  const { data: inv, error: iErr } = await supabase
    .from("invoices")
    .insert({
      org_id: sched.org_id,
      number,
      contact_id: contactId,
      deal_id: sched.source_type === "deal" ? sched.deal_id : null,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: sched.due_date,
      subtotal: sched.amount,
      vat_rate: sched.vat_rate,
      vat_amount: sched.vat_amount,
      total: sched.total_amount,
      currency: "SAR",
      status: "draft",
      invoice_type: "simplified",

      description,
      notes: sched.notes ?? null,
    })
    .select("id, number")
    .single();
  if (iErr) throw new Error(iErr.message);

  // Link schedule → invoice + status transition.
  const { error: linkErr } = await supabase
    .from("payment_schedules")
    .update({ invoice_id: inv.id, status: "invoiced" })
    .eq("id", scheduleId);
  if (linkErr) throw new Error(linkErr.message);

  // Immediately populate the ZATCA payload so the invoice is submit-ready.
  try {
    await regenerateZatcaPayload(supabase, inv.id);
  } catch (e) {
    // Non-fatal: the invoice exists and can be regenerated later from
    // the invoice detail page. Surface via an audit note.
    try {
      await supabase.rpc("log_audit", {
        _entity: "invoices",
        _entity_id: inv.id,
        _action: "zatca.generate.failed",
        _diff: { error: (e as Error).message } as unknown as never,
        _actor: null,
      });
    } catch { /* ignore */ }
  }

  return { invoiceId: inv.id, number: inv.number, created: true };
}

const CreateInvoiceSchema = z.object({ scheduleId: z.string().uuid() });
export const createInvoiceFromSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInvoiceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const res = await ensureInvoiceForSchedule(context.supabase, data.scheduleId);
    return { ok: true, ...res };
  });

/**
 * Batch — issue draft ZATCA invoices for every pending/overdue installment
 * due on/before `throughDate` that isn't already invoiced. Mirrors
 * `generateDueVouchers` for the invoicing side.
 */
const GenerateDueInvoicesSchema = z.object({
  orgId: z.string().uuid().optional(),
  throughDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});
export const generateDueInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenerateDueInvoicesSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const through = data.throughDate ?? new Date().toISOString().slice(0, 10);
    let q = context.supabase
      .from("payment_schedules")
      .select("id")
      .is("invoice_id", null)
      .in("status", ["pending", "overdue"])
      .lte("due_date", through)
      .order("due_date", { ascending: true })
      .limit(data.limit);
    if (data.orgId) q = q.eq("org_id", data.orgId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let created = 0;
    const errors: Array<{ id: string; message: string }> = [];
    for (const r of rows ?? []) {
      try {
        const res = await ensureInvoiceForSchedule(context.supabase, r.id);
        if (res.created) created += 1;
      } catch (e) {
        errors.push({ id: r.id, message: (e as Error).message });
      }
    }
    return { ok: true, scanned: rows?.length ?? 0, created, errors };
  });

