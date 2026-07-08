import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EDITOR_ROLES, type OrgRole } from "@/lib/permissions";

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

export const listRentalContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contracts")
      .select(
        "id, contract_number, status, start_date, end_date, amount, currency_code, payment_frequency, unit_id, tenant_id, owner_id, deposit",
      )
      .eq("org_id", data.orgId)
      .eq("type", "rent")
      .is("deleted_at", null)
      .order("end_date", { ascending: true })
      .limit(500);
    if (error) throw error;
    return rows ?? [];
  });

export const rentalsStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [contracts, invoices, payments] = await Promise.all([
      context.supabase
        .from("contracts")
        .select("id,status,end_date,amount")
        .eq("org_id", data.orgId)
        .eq("type", "rent")
        .is("deleted_at", null),
      context.supabase
        .from("invoices")
        .select("id,status,total,due_date,issue_date")
        .eq("org_id", data.orgId),
      context.supabase
        .from("payments")
        .select("amount,paid_at")
        .eq("org_id", data.orgId)
        .is("deleted_at", null),
    ]);
    if (contracts.error) throw contracts.error;
    if (invoices.error) throw invoices.error;
    if (payments.error) throw payments.error;

    const today = new Date();
    const in30 = new Date();
    in30.setDate(today.getDate() + 30);
    const c = contracts.data ?? [];
    const inv = invoices.data ?? [];
    const pay = payments.data ?? [];

    const active = c.filter((x: any) => x.status === "active").length;
    const expiring = c.filter(
      (x: any) =>
        x.status === "active" && new Date(x.end_date) <= in30 && new Date(x.end_date) >= today,
    ).length;
    const expired = c.filter((x: any) => new Date(x.end_date) < today).length;

    const byStatus = { draft: 0, sent: 0, paid: 0, overdue: 0, cancelled: 0 } as Record<
      string,
      number
    >;
    let outstanding = 0,
      collected = 0;
    for (const i of inv as any[]) {
      byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
      const t = Number(i.total || 0);
      if (i.status === "paid") collected += t;
      else if (i.status === "sent" || i.status === "overdue") outstanding += t;
      // Auto-detect overdue for display purposes
      if (i.status === "sent" && i.due_date && new Date(i.due_date) < today) {
        byStatus.overdue += 1;
        byStatus.sent -= 1;
      }
    }
    const totalPaid = pay.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

    return {
      contracts: { total: c.length, active, expiring, expired },
      invoices: { total: inv.length, byStatus, outstanding, collected },
      paymentsTotal: totalPaid,
    };
  });

export const generateMonthlyInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { contractId: string; orgId: string; issueDate?: string }) =>
    z
      .object({
        contractId: z.string().uuid(),
        orgId: z.string().uuid(),
        issueDate: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.orgId, EDITOR_ROLES);

    const { data: c, error: cErr } = await context.supabase
      .from("contracts")
      .select("*")
      .eq("id", data.contractId)
      .eq("org_id", data.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!c) throw new Error("Contract not found");

    const freq: string = c.payment_frequency || "monthly";
    const perPeriod =
      freq === "yearly"
        ? Number(c.amount)
        : freq === "quarterly"
          ? Number(c.amount) / 4
          : Number(c.amount) / 12;
    const vatRate = 15;
    const subtotal = Math.round(perPeriod * 100) / 100;
    const vatAmount = Math.round(subtotal * vatRate) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;
    const issue = data.issueDate ?? new Date().toISOString().slice(0, 10);
    const due = new Date(issue);
    due.setDate(due.getDate() + 15);
    const number = `INV-${issue.slice(0, 7).replace("-", "")}-${(c.contract_number || c.id.slice(0, 4)).toString().slice(-6)}`;

    const { data: inserted, error } = await context.supabase
      .from("invoices")
      .insert({
        org_id: data.orgId,
        number,
        issue_date: issue,
        due_date: due.toISOString().slice(0, 10),
        description: `Rent for contract ${c.contract_number ?? c.id}`,
        subtotal,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        currency: c.currency_code || "SAR",
        status: "sent",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return inserted;
  });
