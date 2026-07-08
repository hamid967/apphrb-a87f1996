import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listRentCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("rent_charges")
      .select(
        "id, org_id, contract_id, tenant_id, period_start, period_end, due_date, amount, currency, status, paid_at, tenants ( id, full_name ), contracts ( id, contract_number, unit_id, units ( id, code ) )",
      )
      .eq("org_id", data.org_id)
      .order("due_date", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const recordRentPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        charge_id: z.string().uuid(),
        amount: z.number().positive(),
        paid_at: z.string(),
        reference: z.string().max(120).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: charge, error: cErr } = await context.supabase
      .from("rent_charges")
      .select("id, org_id, contract_id, tenant_id, currency, amount, status")
      .eq("id", data.charge_id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!charge) throw new Error("Rent charge not found");

    const { data: payment, error: pErr } = await context.supabase
      .from("payments")
      .insert({
        org_id: charge.org_id,
        contract_id: charge.contract_id,
        tenant_id: charge.tenant_id,
        amount: data.amount,
        currency_code: charge.currency ?? "SAR",
        paid_at: data.paid_at,
        status: "completed",
        reference: data.reference ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (pErr) throw pErr;

    // Mark charge paid when fully covered
    if (Number(data.amount) >= Number(charge.amount)) {
      const { error: uErr } = await context.supabase
        .from("rent_charges")
        .update({ status: "paid", paid_at: data.paid_at })
        .eq("id", charge.id);
      if (uErr) throw uErr;
    }

    return { payment_id: payment.id };
  });

export const listArchivedPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("payments")
      .select(
        "id, contract_id, tenant_id, amount, currency_code, paid_at, status, reference, notes, deleted_at, contracts ( id, contract_number ), tenants ( id, full_name )",
      )
      .eq("org_id", data.org_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const archivePayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("payments")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", data.ids)
      .is("deleted_at", null);
    if (error) throw error;
    await context.supabase.rpc("log_soft_delete", {
      _entity: "payments",
      _action: "archive",
      _ids: data.ids,
      _reason: data.reason ?? undefined,
    });
    return { ok: true, count: data.ids.length };
  });

export const restorePayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("payments")
      .update({ deleted_at: null })
      .in("id", data.ids)
      .not("deleted_at", "is", null);
    if (error) throw error;
    await context.supabase.rpc("log_soft_delete", {
      _entity: "payments",
      _action: "restore",
      _ids: data.ids,
      _reason: data.reason ?? undefined,
    });
    return { ok: true, count: data.ids.length };
  });
