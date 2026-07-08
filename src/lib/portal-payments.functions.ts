import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ServerSupabase } from "@/lib/server-types";

async function getMyRole(supabase: ServerSupabase) {
  const { data, error } = await supabase.rpc("get_my_role");
  if (error) throw new Error(error.message);
  return data as string | null;
}

async function getMyTenantId(supabase: ServerSupabase, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.tenant_id as string | undefined) ?? null;
}

async function getMyOwnerId(supabase: ServerSupabase, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("owner_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.owner_id as string | undefined) ?? null;
}

// Tenant reports a payment against a rent charge. Creates a pending payments
// row that admins must verify before it's marked paid.
export const submitTenantPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        charge_id: z.string().uuid(),
        amount: z.number().positive(),
        paid_at: z.string(),
        reference: z.string().trim().max(120).optional().nullable(),
        method: z.enum(["bank_transfer", "cash", "cheque", "card", "other"]),
        notes: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await getMyRole(context.supabase);
    if (role !== "tenant") throw new Error("Forbidden: tenant only");
    const tenantId = await getMyTenantId(context.supabase, context.userId);
    if (!tenantId) throw new Error("لم يتم ربط الحساب بمستأجر");

    // Read charge scoped to tenant (RLS allows own reads)
    const { data: charge, error: cErr } = await context.supabase
      .from("rent_charges")
      .select("id, org_id, contract_id, tenant_id, currency, amount, status")
      .eq("id", data.charge_id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!charge || charge.tenant_id !== tenantId) throw new Error("دفعة غير موجودة");
    if (charge.status === "paid") throw new Error("هذه الدفعة مسددة بالفعل");

    // Insert as pending via admin client (tenant has no insert policy on payments)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const noteWithMethod = `[${data.method}] ${data.notes ?? ""}`.trim();
    const { data: payment, error: pErr } = await supabaseAdmin
      .from("payments")
      .insert({
        org_id: charge.org_id,
        contract_id: charge.contract_id,
        tenant_id: charge.tenant_id,
        amount: data.amount,
        currency_code: charge.currency ?? "SAR",
        paid_at: data.paid_at,
        status: "pending",
        reference: data.reference ?? null,
        notes: noteWithMethod,
      })
      .select("id")
      .single();
    if (pErr) throw pErr;

    return { payment_id: payment.id };
  });

// Payments the current tenant has submitted (any status)
export const listTenantPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getMyRole(context.supabase);
    if (role !== "tenant") throw new Error("Forbidden: tenant only");
    const tenantId = await getMyTenantId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("payments")
      .select(
        "id, amount, currency_code, paid_at, status, reference, notes, contract_id, contracts(contract_number)",
      )
      .eq("tenant_id", tenantId ?? "00000000-0000-0000-0000-000000000000")
      .is("deleted_at", null)
      .order("paid_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

// Payments received on the current owner's contracts
export const listOwnerPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getMyRole(context.supabase);
    if (role !== "owner_investor") throw new Error("Forbidden: owner only");
    const ownerId = await getMyOwnerId(context.supabase, context.userId);
    if (!ownerId) {
      const { data } = await context.supabase
        .from("payments")
        .select(
          "id, amount, currency_code, paid_at, status, reference, contract_id, tenant_id, tenants(full_name), contracts(contract_number)",
        )
        .eq("id", "00000000-0000-0000-0000-000000000000");
      return data ?? [];
    }

    const { data: contracts } = await context.supabase
      .from("contracts")
      .select("id")
      .eq("owner_id", ownerId)
      .is("deleted_at", null);
    const ids = (contracts ?? []).map((c) => c.id as string);
    if (ids.length === 0) {
      const { data } = await context.supabase
        .from("payments")
        .select(
          "id, amount, currency_code, paid_at, status, reference, contract_id, tenant_id, tenants(full_name), contracts(contract_number)",
        )
        .eq("id", "00000000-0000-0000-0000-000000000000");
      return data ?? [];
    }

    const { data, error } = await context.supabase
      .from("payments")
      .select(
        "id, amount, currency_code, paid_at, status, reference, contract_id, tenant_id, tenants(full_name), contracts(contract_number)",
      )
      .in("contract_id", ids)
      .is("deleted_at", null)
      .order("paid_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

// Admin: list tenant-submitted payments awaiting verification
export const listPendingPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("payments")
      .select(
        "id, amount, currency_code, paid_at, status, reference, notes, contract_id, tenant_id, tenants(full_name), contracts(contract_number)",
      )
      .eq("org_id", data.org_id)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("paid_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

// Admin: approve/reject a submitted payment
export const reviewSubmittedPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        payment_id: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: payment, error: pErr } = await context.supabase
      .from("payments")
      .select("id, org_id, contract_id, tenant_id, amount, paid_at, status")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!payment) throw new Error("الدفعة غير موجودة");
    if (payment.status !== "pending") throw new Error("تمت مراجعة هذه الدفعة مسبقًا");

    const { enqueuePaymentStatusUpdate } = await import("@/lib/rent-reminders.server");

    if (data.decision === "reject") {
      const { error } = await context.supabase
        .from("payments")
        .update({
          status: "failed",
          notes: data.reason ? `[rejected] ${data.reason}` : "[rejected]",
        })
        .eq("id", payment.id);
      if (error) throw error;
      if (payment.tenant_id) {
        await enqueuePaymentStatusUpdate({
          org_id: payment.org_id,
          tenant_id: payment.tenant_id,
          amount: Number(payment.amount),
          currency: "SAR",
          decision: "reject",
          reason: data.reason ?? null,
        });
      }
      return { ok: true, status: "failed" as const };
    }

    // Approve → mark completed and mark related unpaid charge paid if fully covered
    const { error: uErr } = await context.supabase
      .from("payments")
      .update({ status: "completed" })
      .eq("id", payment.id);
    if (uErr) throw uErr;

    if (payment.contract_id && payment.tenant_id) {
      const { data: charge } = await context.supabase
        .from("rent_charges")
        .select("id, amount, status")
        .eq("contract_id", payment.contract_id)
        .eq("tenant_id", payment.tenant_id)
        .neq("status", "paid")
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (charge && Number(payment.amount) >= Number(charge.amount)) {
        await context.supabase
          .from("rent_charges")
          .update({ status: "paid", paid_at: payment.paid_at })
          .eq("id", charge.id);
      }
    }
    if (payment.tenant_id) {
      await enqueuePaymentStatusUpdate({
        org_id: payment.org_id,
        tenant_id: payment.tenant_id,
        amount: Number(payment.amount),
        currency: "SAR",
        decision: "approve",
      });
    }
    return { ok: true, status: "completed" as const };
  });