import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contracts")
      .select(
        "id, contract_number, type, status, start_date, end_date, amount, currency_code, payment_frequency, unit_id, tenant_id, tenants ( id, full_name ), units ( id, code )",
      )
      .eq("org_id", data.org_id)
      .is("deleted_at", null)
      .order("start_date", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listArchivedContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contracts")
      .select(
        "id, contract_number, type, status, start_date, end_date, amount, currency_code, payment_frequency, unit_id, tenant_id, deleted_at, tenants ( id, full_name ), units ( id, code )",
      )
      .eq("org_id", data.org_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const archiveContracts = createServerFn({ method: "POST" })
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
      .from("contracts")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", data.ids)
      .is("deleted_at", null);
    if (error) throw error;
    await context.supabase.rpc("log_soft_delete", {
      _entity: "contracts",
      _action: "archive",
      _ids: data.ids,
      _reason: data.reason ?? undefined,
    });
    return { ok: true, count: data.ids.length };
  });

export const restoreContracts = createServerFn({ method: "POST" })
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
      .from("contracts")
      .update({ deleted_at: null })
      .in("id", data.ids)
      .not("deleted_at", "is", null);
    if (error) throw error;
    await context.supabase.rpc("log_soft_delete", {
      _entity: "contracts",
      _action: "restore",
      _ids: data.ids,
      _reason: data.reason ?? undefined,
    });
    return { ok: true, count: data.ids.length };
  });

const createSchema = z.object({
  org_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  owner_id: z.string().uuid().optional().nullable(),
  type: z.enum(["rent", "sale"]).default("rent"),
  start_date: z.string(),
  end_date: z.string(),
  amount: z.number().nonnegative(),
  currency_code: z.string().default("SAR"),
  payment_frequency: z.enum(["monthly", "quarterly", "semi_annual", "annual"]).default("monthly"),
  deposit: z.number().nonnegative().default(0),
  notes: z.string().max(2000).optional().nullable(),
  activate: z.boolean().default(true),
});

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function frequencyMonths(f: string): number {
  return f === "monthly" ? 1 : f === "quarterly" ? 3 : f === "semi_annual" ? 6 : 12;
}

async function generateRentCharges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  contract: {
    id: string;
    org_id: string;
    tenant_id: string;
    start_date: string;
    end_date: string;
    amount: number;
    currency_code: string;
    payment_frequency: string;
  },
) {
  const step = frequencyMonths(contract.payment_frequency);
  const totalMonths = Math.max(
    1,
    Math.round(
      (new Date(contract.end_date).getTime() - new Date(contract.start_date).getTime()) /
        (1000 * 60 * 60 * 24 * 30),
    ),
  );
  const periods = Math.max(1, Math.ceil(totalMonths / step));
  const perPeriod = Number(contract.amount) / periods;
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < periods; i++) {
    const period_start = addMonths(contract.start_date, i * step);
    const period_end = addMonths(contract.start_date, (i + 1) * step);
    rows.push({
      org_id: contract.org_id,
      contract_id: contract.id,
      tenant_id: contract.tenant_id,
      period_start,
      period_end,
      due_date: period_start,
      amount: Number(perPeriod.toFixed(2)),
      currency: contract.currency_code,
      status: "pending",
    });
  }
  const { error } = await supabase.from("rent_charges").insert(rows);
  if (error) throw error;
}

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const status = data.activate ? "active" : "draft";
    const { data: inserted, error } = await context.supabase
      .from("contracts")
      .insert({
        org_id: data.org_id,
        unit_id: data.unit_id,
        tenant_id: data.tenant_id,
        owner_id: data.owner_id ?? null,
        type: data.type,
        status,
        start_date: data.start_date,
        end_date: data.end_date,
        amount: data.amount,
        currency_code: data.currency_code,
        payment_frequency: data.payment_frequency,
        deposit: data.deposit,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select(
        "id, org_id, tenant_id, start_date, end_date, amount, currency_code, payment_frequency, status",
      )
      .single();
    if (error) throw error;

    // Rent-charge generation + unit occupancy are handled by the DB trigger
    // `tg_contract_activated` (fires when status transitions to 'active').
    // Keep this in one place to avoid duplicate rows.

    return { id: inserted.id };
  });

export const renewContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        new_end_date: z.string(),
        new_amount: z.number().nonnegative().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: old, error } = await context.supabase
      .from("contracts")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!old) throw new Error("Contract not found");

    const oldEnd = old.end_date as string;
    const newStart = addMonths(oldEnd, 0);
    const amount = data.new_amount ?? Number(old.amount);

    const { data: inserted, error: iErr } = await context.supabase
      .from("contracts")
      .insert({
        org_id: old.org_id,
        unit_id: old.unit_id,
        tenant_id: old.tenant_id,
        owner_id: old.owner_id,
        type: old.type,
        status: "active",
        start_date: newStart,
        end_date: data.new_end_date,
        amount,
        currency_code: old.currency_code,
        payment_frequency: old.payment_frequency,
        deposit: old.deposit,
        notes: `Renewal of ${old.contract_number ?? old.id}`,
        created_by: context.userId,
      })
      .select(
        "id, org_id, tenant_id, start_date, end_date, amount, currency_code, payment_frequency",
      )
      .single();
    if (iErr) throw iErr;

    if (old.type === "rent") {
      await generateRentCharges(
        context.supabase,
        inserted as unknown as {
          id: string;
          org_id: string;
          tenant_id: string;
          start_date: string;
          end_date: string;
          amount: number;
          currency_code: string;
          payment_frequency: string;
        },
      );
    }

    await context.supabase.from("contracts").update({ status: "renewed" }).eq("id", data.id);
    return { id: inserted.id };
  });

export const terminateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        termination_date: z.string(),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: c, error } = await context.supabase
      .from("contracts")
      .select("id, unit_id, notes")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!c) throw new Error("Contract not found");

    const notes = [c.notes, `[terminated ${data.termination_date}] ${data.reason ?? ""}`.trim()]
      .filter(Boolean)
      .join("\n");

    const { error: uErr } = await context.supabase
      .from("contracts")
      .update({ status: "terminated", end_date: data.termination_date, notes })
      .eq("id", data.id);
    if (uErr) throw uErr;

    // Void future pending charges
    await context.supabase
      .from("rent_charges")
      .update({ status: "void" })
      .eq("contract_id", data.id)
      .eq("status", "pending")
      .gt("due_date", data.termination_date);

    // Free the unit
    if (c.unit_id) {
      await context.supabase.from("units").update({ status: "vacant" }).eq("id", c.unit_id);
    }

    return { ok: true };
  });

export const getContractDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; contractId: string; includeDeleted?: boolean }) =>
    z
      .object({
        orgId: z.string().uuid(),
        contractId: z.string().uuid(),
        includeDeleted: z.boolean().optional().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { orgId, contractId, includeDeleted } = data;

    const contractQ = context.supabase
      .from("contracts")
      .select("*")
      .eq("id", contractId)
      .eq("org_id", orgId);
    const { data: contract, error } = await (
      includeDeleted ? contractQ : contractQ.is("deleted_at", null)
    ).maybeSingle();
    if (error) throw error;
    if (!contract) throw new Error("Contract not found");

    const c: any = contract;

    const [ownerRes, tenantRes, unitRes, paymentsRes, auditRes] = await Promise.all([
      c.owner_id
        ? context.supabase
            .from("owners")
            .select("id, full_name, email, phone")
            .eq("id", c.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      c.tenant_id
        ? context.supabase
            .from("tenants")
            .select("id, full_name, email, phone")
            .eq("id", c.tenant_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      c.unit_id
        ? context.supabase
            .from("units")
            .select("id, code, type, area, bedrooms, bathrooms, rent_amount, building_id")
            .eq("id", c.unit_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null } as any),
      (() => {
        let q = context.supabase
          .from("payments")
          .select(
            "id, amount, currency_code, paid_at, status, method, reference, notes, deleted_at, created_at",
          )
          .eq("contract_id", contractId)
          .order("paid_at", { ascending: false });
        if (!includeDeleted) q = q.is("deleted_at", null);
        return q;
      })(),
      context.supabase
        .from("audit_log")
        .select("id, action, actor, at, diff")
        .eq("entity", "contracts")
        .eq("entity_id", contractId)
        .order("at", { ascending: false })
        .limit(200),
    ]);
    if (ownerRes.error) throw ownerRes.error;
    if (tenantRes.error) throw tenantRes.error;
    if (unitRes.error) throw unitRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    if (auditRes.error) throw auditRes.error;

    const unit: any = unitRes.data;
    const building = unit?.building_id
      ? (
          await context.supabase
            .from("buildings")
            .select("id, name, code")
            .eq("id", unit.building_id)
            .maybeSingle()
        ).data
      : null;

    // Build timeline entries from audit log
    const timeline = ((auditRes.data ?? []) as any[]).map((a) => {
      const before = a.diff?.before ?? {};
      const after = a.diff?.after ?? {};
      const changes: { field: string; from: any; to: any }[] = [];
      let label = a.action as string;
      if (a.action === "INSERT") {
        label = "Created";
      } else if (a.action === "DELETE") {
        label = "Deleted";
      } else if (a.action === "UPDATE") {
        const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
        for (const k of keys) {
          if (["updated_at", "created_at"].includes(k)) continue;
          if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
            changes.push({ field: k, from: before[k], to: after[k] });
          }
        }
        if (changes.length === 1 && changes[0].field === "status") {
          const to = changes[0].to;
          label =
            to === "active"
              ? "Activated"
              : to === "ended" || to === "terminated"
                ? "Ended"
                : to === "cancelled"
                  ? "Cancelled"
                  : `Status → ${to}`;
        } else {
          label = "Updated";
        }
      }
      return { id: a.id, at: a.at, actor: a.actor, action: a.action, label, changes };
    });

    return {
      contract: c,
      owner: ownerRes.data,
      tenant: tenantRes.data,
      unit,
      building,
      payments: (paymentsRes.data ?? []) as any[],
      timeline,
    };
  });

/**
 * Mark a contract as "sent to Ejar portal". Stores the timestamp and an
 * optional Ejar reference number on the contract row. Also inserts an
 * audit_log row so the action shows up in the contract timeline.
 *
 * Note: This does NOT integrate with the real Ejar API — that requires a
 * partner agreement. The UI provides a deep-link the user opens manually,
 * then calls this function to record that the transfer was performed.
 */
export const markContractSentToEjar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        ejar_reference: z.string().trim().max(64).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Load the existing row so we can compute a before/after diff for audit.
    const { data: before, error: readErr } = await context.supabase
      .from("contracts")
      .select("id, org_id, ejar_sent_at, ejar_reference")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!before) throw new Error("Contract not found");

    const sentAt = new Date().toISOString();
    const nextRef = data.ejar_reference?.trim() || null;

    const { data: updated, error } = await context.supabase
      .from("contracts")
      .update({ ejar_sent_at: sentAt, ejar_reference: nextRef })
      .eq("id", data.id)
      .select("id, ejar_sent_at, ejar_reference")
      .maybeSingle();
    if (error) throw error;

    // Best-effort audit trail — do not fail the mutation if this insert fails
    // (audit_log may be triggered automatically depending on schema).
    try {
      await context.supabase.from("audit_log").insert({
        entity: "contracts",
        entity_id: data.id,
        action: "EJAR_SENT",
        actor: context.userId,
        diff: {
          before: { ejar_sent_at: before.ejar_sent_at, ejar_reference: before.ejar_reference },
          after: { ejar_sent_at: sentAt, ejar_reference: nextRef },
        },
      } as never);
    } catch {
      // ignore — audit is best-effort
    }

    return updated;
  });
