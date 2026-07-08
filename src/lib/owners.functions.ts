import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: owners, error } = await context.supabase
      .from("owners")
      .select("id, full_name, email, phone")
      .eq("org_id", data.orgId)
      .is("deleted_at", null)
      .order("full_name", { ascending: true })
      .limit(500);
    if (error) throw error;
    if (!owners?.length) return [];

    const ids = owners.map((o: any) => o.id);
    const { data: contracts, error: cErr } = await context.supabase
      .from("contracts")
      .select("owner_id, status, amount, currency_code, payment_frequency")
      .eq("org_id", data.orgId)
      .in("owner_id", ids)
      .is("deleted_at", null);
    if (cErr) throw cErr;

    const agg = new Map<string, { active: number; total: number; monthly: number }>();
    for (const c of (contracts ?? []) as any[]) {
      const cur = agg.get(c.owner_id) ?? { active: 0, total: 0, monthly: 0 };
      cur.total += 1;
      if (c.status === "active") cur.active += 1;
      const amt = Number(c.amount || 0);
      const per =
        c.payment_frequency === "yearly"
          ? amt / 12
          : c.payment_frequency === "quarterly"
            ? amt / 3
            : amt / 12;
      cur.monthly += per;
      agg.set(c.owner_id, cur);
    }
    return owners.map((o: any) => ({
      ...o,
      ...(agg.get(o.id) ?? { active: 0, total: 0, monthly: 0 }),
    }));
  });

export const listOwnerContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; ownerId?: string; status?: string }) =>
    z
      .object({
        orgId: z.string().uuid(),
        ownerId: z.string().uuid().optional(),
        status: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contracts")
      .select(
        "id, contract_number, status, start_date, end_date, amount, currency_code, payment_frequency, deposit, unit_id, tenant_id, owner_id, created_at",
      )
      .eq("org_id", data.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.ownerId) q = q.eq("owner_id", data.ownerId);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: contracts, error } = await q;
    if (error) throw error;
    const rows = (contracts ?? []) as any[];
    if (!rows.length) return [];

    const ownerIds = Array.from(new Set(rows.map((c) => c.owner_id).filter(Boolean)));
    const unitIds = Array.from(new Set(rows.map((c) => c.unit_id).filter(Boolean)));
    const tenantIds = Array.from(new Set(rows.map((c) => c.tenant_id).filter(Boolean)));

    const [ownersRes, unitsRes, tenantsRes] = await Promise.all([
      ownerIds.length
        ? context.supabase
            .from("owners")
            .select("id, full_name, email, phone")
            .in("id", ownerIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
      unitIds.length
        ? context.supabase
            .from("units")
            .select("id, code, type, status, area, bedrooms, bathrooms, rent_amount, building_id")
            .in("id", unitIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
      tenantIds.length
        ? context.supabase
            .from("tenants")
            .select("id, full_name, phone")
            .in("id", tenantIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (ownersRes.error) throw ownersRes.error;
    if (unitsRes.error) throw unitsRes.error;
    if (tenantsRes.error) throw tenantsRes.error;

    const buildingIds = Array.from(
      new Set(((unitsRes.data ?? []) as any[]).map((u) => u.building_id).filter(Boolean)),
    );
    const buildingsRes = buildingIds.length
      ? await context.supabase.from("buildings").select("id, name, code").in("id", buildingIds)
      : ({ data: [], error: null } as any);
    if (buildingsRes.error) throw buildingsRes.error;

    const ownerById = new Map(((ownersRes.data ?? []) as any[]).map((o) => [o.id, o]));
    const unitById = new Map(((unitsRes.data ?? []) as any[]).map((u) => [u.id, u]));
    const tenantById = new Map(((tenantsRes.data ?? []) as any[]).map((t) => [t.id, t]));
    const buildingById = new Map(((buildingsRes.data ?? []) as any[]).map((b) => [b.id, b]));

    return rows.map((c) => {
      const unit: any = c.unit_id ? (unitById.get(c.unit_id) ?? null) : null;
      return {
        ...c,
        owner: c.owner_id ? (ownerById.get(c.owner_id) ?? null) : null,
        tenant: c.tenant_id ? (tenantById.get(c.tenant_id) ?? null) : null,
        unit,
        building: unit?.building_id ? (buildingById.get(unit.building_id) ?? null) : null,
      };
    });
  });

function monthsBetween(from: string, to: string) {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  return Math.max(
    0,
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1,
  );
}

function overlapMonths(cStart: string, cEnd: string, from: string, to: string) {
  const s = cStart > from ? cStart : from;
  const e = cEnd < to ? cEnd : to;
  if (s > e) return 0;
  return monthsBetween(s.slice(0, 10), e.slice(0, 10));
}

export const getOwnerStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orgId: string;
      ownerId: string;
      from: string;
      to: string;
      managementFeePct?: number;
    }) =>
      z
        .object({
          orgId: z.string().uuid(),
          ownerId: z.string().uuid(),
          from: z.string().min(10),
          to: z.string().min(10),
          managementFeePct: z.number().min(0).max(100).default(5),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { orgId, ownerId, from, to } = data;
    const feePct = data.managementFeePct ?? 5;

    const [ownerRes, contractsRes] = await Promise.all([
      context.supabase
        .from("owners")
        .select("id, full_name, email, phone")
        .eq("id", ownerId)
        .eq("org_id", orgId)
        .maybeSingle(),
      context.supabase
        .from("contracts")
        .select(
          "id, contract_number, status, start_date, end_date, amount, currency_code, payment_frequency, unit_id, tenant_id",
        )
        .eq("org_id", orgId)
        .eq("owner_id", ownerId)
        .is("deleted_at", null),
    ]);
    if (ownerRes.error) throw ownerRes.error;
    if (contractsRes.error) throw contractsRes.error;
    const owner = ownerRes.data;
    if (!owner) throw new Error("Owner not found");
    const contracts = (contractsRes.data ?? []) as any[];
    const contractIds = contracts.map((c) => c.id);
    const unitIds = Array.from(new Set(contracts.map((c) => c.unit_id).filter(Boolean)));
    const tenantIds = Array.from(new Set(contracts.map((c) => c.tenant_id).filter(Boolean)));

    const [paymentsRes, unitsRes, tenantsRes] = await Promise.all([
      contractIds.length
        ? context.supabase
            .from("payments")
            .select("id, contract_id, amount, currency_code, paid_at, status, reference")
            .in("contract_id", contractIds)
            .gte("paid_at", from)
            .lte("paid_at", to + "T23:59:59Z")
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
      unitIds.length
        ? context.supabase
            .from("units")
            .select("id, code, type, rent_amount, building_id")
            .in("id", unitIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
      tenantIds.length
        ? context.supabase
            .from("tenants")
            .select("id, full_name")
            .in("id", tenantIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (paymentsRes.error) throw paymentsRes.error;
    if (unitsRes.error) throw unitsRes.error;
    if (tenantsRes.error) throw tenantsRes.error;

    const unitById = new Map((unitsRes.data ?? []).map((u: any) => [u.id, u]));
    const tenantById = new Map((tenantsRes.data ?? []).map((t: any) => [t.id, t]));

    // Rows per contract with expected income in range
    const rows = contracts.map((c) => {
      const amt = Number(c.amount || 0);
      const perMonth =
        c.payment_frequency === "yearly"
          ? amt / 12
          : c.payment_frequency === "quarterly"
            ? amt / 3
            : amt / 12;
      const months = overlapMonths(c.start_date, c.end_date, from, to);
      const expected = Math.round(perMonth * months * 100) / 100;
      const collected = ((paymentsRes.data ?? []) as any[])
        .filter((p) => p.contract_id === c.id)
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      return {
        contract_id: c.id,
        contract_number: c.contract_number,
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        currency: c.currency_code || "SAR",
        unit: unitById.get(c.unit_id) ?? null,
        tenant: tenantById.get(c.tenant_id) ?? null,
        months_in_range: months,
        per_month: Math.round(perMonth * 100) / 100,
        expected,
        collected: Math.round(collected * 100) / 100,
        outstanding: Math.round((expected - collected) * 100) / 100,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.expected += r.expected;
        acc.collected += r.collected;
        acc.outstanding += r.outstanding;
        return acc;
      },
      { expected: 0, collected: 0, outstanding: 0 },
    );
    const managementFee = Math.round(totals.collected * (feePct / 100) * 100) / 100;
    const netPayout = Math.round((totals.collected - managementFee) * 100) / 100;

    return {
      owner,
      period: { from, to },
      currency: rows[0]?.currency ?? "SAR",
      rows,
      payments: (paymentsRes.data ?? []) as any[],
      totals: {
        expected: Math.round(totals.expected * 100) / 100,
        collected: Math.round(totals.collected * 100) / 100,
        outstanding: Math.round(totals.outstanding * 100) / 100,
        managementFeePct: feePct,
        managementFee,
        netPayout,
      },
    };
  });

export const getOwnerLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orgId: string;
      ownerId: string;
      from: string;
      to: string;
      managementFeePct?: number;
    }) =>
      z
        .object({
          orgId: z.string().uuid(),
          ownerId: z.string().uuid(),
          from: z.string().min(10),
          to: z.string().min(10),
          managementFeePct: z.number().min(0).max(100).default(5),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { orgId, ownerId, from, to } = data;
    const feePct = data.managementFeePct ?? 5;

    const [ownerRes, contractsRes] = await Promise.all([
      context.supabase
        .from("owners")
        .select("id, full_name")
        .eq("id", ownerId)
        .eq("org_id", orgId)
        .maybeSingle(),
      context.supabase
        .from("contracts")
        .select("id, contract_number, unit_id, tenant_id, currency_code")
        .eq("org_id", orgId)
        .eq("owner_id", ownerId)
        .is("deleted_at", null),
    ]);
    if (ownerRes.error) throw ownerRes.error;
    if (contractsRes.error) throw contractsRes.error;
    const owner = ownerRes.data;
    if (!owner) throw new Error("Owner not found");
    const contracts = (contractsRes.data ?? []) as any[];
    const contractIds = contracts.map((c) => c.id);
    const unitIds = Array.from(new Set(contracts.map((c) => c.unit_id).filter(Boolean)));
    const tenantIds = Array.from(new Set(contracts.map((c) => c.tenant_id).filter(Boolean)));

    const [paymentsRes, expensesRes, unitsRes, tenantsRes] = await Promise.all([
      contractIds.length
        ? context.supabase
            .from("payments")
            .select(
              "id, contract_id, amount, currency_code, paid_at, status, method, reference, notes",
            )
            .in("contract_id", contractIds)
            .gte("paid_at", from)
            .lte("paid_at", to + "T23:59:59Z")
            .is("deleted_at", null)
            .order("paid_at", { ascending: true })
        : Promise.resolve({ data: [], error: null } as any),
      context.supabase
        .from("expenses")
        .select(
          "id, spent_at, category, vendor, description, amount, vat_amount, currency, contract_id, unit_id",
        )
        .eq("org_id", orgId)
        .gte("spent_at", from)
        .lte("spent_at", to)
        .is("deleted_at", null)
        .order("spent_at", { ascending: true }),
      unitIds.length
        ? context.supabase.from("units").select("id, code").in("id", unitIds).is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
      tenantIds.length
        ? context.supabase
            .from("tenants")
            .select("id, full_name")
            .in("id", tenantIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (paymentsRes.error) throw paymentsRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (unitsRes.error) throw unitsRes.error;
    if (tenantsRes.error) throw tenantsRes.error;

    const contractById = new Map(contracts.map((c) => [c.id, c]));
    const unitById = new Map(((unitsRes.data ?? []) as any[]).map((u) => [u.id, u]));
    const tenantById = new Map(((tenantsRes.data ?? []) as any[]).map((t) => [t.id, t]));

    type Entry = {
      date: string;
      type: "payment" | "management_fee" | "expense";
      contract_number: string | null;
      unit_code: string | null;
      tenant_name: string | null;
      description: string;
      reference: string | null;
      status: string | null;
      currency: string;
      debit: number;
      credit: number;
    };
    const entries: Entry[] = [];

    // Filter payments to owner contracts already ensured by contract_id filter
    const ownerContractIds = new Set(contractIds);

    for (const p of (paymentsRes.data ?? []) as any[]) {
      const c: any = contractById.get(p.contract_id);
      const unit = c?.unit_id ? unitById.get(c.unit_id) : null;
      const tenant = c?.tenant_id ? tenantById.get(c.tenant_id) : null;
      const amount = Number(p.amount || 0);
      const cur = p.currency_code || c?.currency_code || "SAR";
      const date = String(p.paid_at || "").slice(0, 10);
      entries.push({
        date,
        type: "payment",
        contract_number: c?.contract_number ?? null,
        unit_code: unit?.code ?? null,
        tenant_name: tenant?.full_name ?? null,
        description: `Rent payment${p.reference ? ` (${p.reference})` : ""}`,
        reference: p.reference ?? null,
        status: p.status ?? null,
        currency: cur,
        debit: 0,
        credit: Math.round(amount * 100) / 100,
      });
      if (p.status === "paid" || p.status === "completed" || !p.status) {
        const fee = Math.round(amount * (feePct / 100) * 100) / 100;
        if (fee > 0) {
          entries.push({
            date,
            type: "management_fee",
            contract_number: c?.contract_number ?? null,
            unit_code: unit?.code ?? null,
            tenant_name: tenant?.full_name ?? null,
            description: `Management fee ${feePct}%`,
            reference: p.reference ?? null,
            status: "deducted",
            currency: cur,
            debit: fee,
            credit: 0,
          });
        }
      }
    }

    for (const e of (expensesRes.data ?? []) as any[]) {
      // Only include expenses tied to this owner's contracts/units
      const linkedContract = e.contract_id && ownerContractIds.has(e.contract_id);
      const unit = e.unit_id ? unitById.get(e.unit_id) : null;
      const linkedUnit = e.unit_id && unitIds.includes(e.unit_id);
      if (!linkedContract && !linkedUnit) continue;
      const c: any = e.contract_id ? contractById.get(e.contract_id) : null;
      const total = Number(e.amount || 0) + Number(e.vat_amount || 0);
      entries.push({
        date: String(e.spent_at || "").slice(0, 10),
        type: "expense",
        contract_number: c?.contract_number ?? null,
        unit_code: unit?.code ?? null,
        tenant_name: null,
        description: `${e.category ?? "expense"}${e.vendor ? ` — ${e.vendor}` : ""}${e.description ? `: ${e.description}` : ""}`,
        reference: null,
        status: "deducted",
        currency: e.currency || "SAR",
        debit: Math.round(total * 100) / 100,
        credit: 0,
      });
    }

    entries.sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.type.localeCompare(b.type),
    );

    let running = 0;
    const rows = entries.map((e) => {
      running += e.credit - e.debit;
      return { ...e, balance: Math.round(running * 100) / 100 };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.credit += r.credit;
        acc.debit += r.debit;
        return acc;
      },
      { credit: 0, debit: 0 },
    );

    return {
      owner,
      period: { from, to },
      currency: rows[0]?.currency ?? "SAR",
      managementFeePct: feePct,
      rows,
      totals: {
        credit: Math.round(totals.credit * 100) / 100,
        debit: Math.round(totals.debit * 100) / 100,
        net: Math.round((totals.credit - totals.debit) * 100) / 100,
      },
    };
  });
