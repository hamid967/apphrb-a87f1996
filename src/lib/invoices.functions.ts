import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fatoora-like internal invoicing portal — list + summaries.
 * Read-only aggregation used by the invoices dashboard route.
 */

const ListSchema = z.object({
  status: z.string().optional(),          // invoice_status enum or 'all'
  zatca_status: z.string().optional(),    // zatca_status enum or 'all'
  q: z.string().optional(),               // search: number / notes / description
  from: z.string().optional(),            // issue_date >=
  to: z.string().optional(),              // issue_date <=
  limit: z.number().int().positive().max(500).optional(),
});

export type InvoiceListRow = {
  id: string;
  number: string | null;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total: number | null;
  currency: string | null;
  status: string | null;
  zatca_status: string | null;
  zatca_counter: number | null;
  description: string | null;
  contact_id: string | null;
  contact_name: string | null;
};

export type InvoiceListTotals = {
  count: number;
  total: number;
  paid: number;
  outstanding: number;
  overdue: number;
  draft: number;
  vat: number;
  byStatus: Record<string, { count: number; total: number }>;
};

export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let q = supabase
      .from("invoices")
      .select(
        "id, number, issue_date, due_date, paid_at, subtotal, vat_amount, total, currency, status, zatca_status, zatca_counter, description, contact_id, contacts(full_name)",
      )
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 300);

    if (data.status && data.status !== "all") q = q.eq("status", data.status as never);
    if (data.zatca_status && data.zatca_status !== "all")
      q = q.eq("zatca_status", data.zatca_status as never);
    if (data.from) q = q.gte("issue_date", data.from);
    if (data.to) q = q.lte("issue_date", data.to);
    if (data.q && data.q.trim()) {
      const needle = data.q.trim().replace(/[%_]/g, "\\$&");
      q = q.or(
        `number.ilike.%${needle}%,description.ilike.%${needle}%,notes.ilike.%${needle}%`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const items: InvoiceListRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      number: r.number,
      issue_date: r.issue_date,
      due_date: r.due_date,
      paid_at: r.paid_at,
      subtotal: r.subtotal == null ? null : Number(r.subtotal),
      vat_amount: r.vat_amount == null ? null : Number(r.vat_amount),
      total: r.total == null ? null : Number(r.total),
      currency: r.currency,
      status: r.status,
      zatca_status: r.zatca_status,
      zatca_counter: r.zatca_counter,
      description: r.description,
      contact_id: r.contact_id,
      contact_name: r.contacts?.full_name ?? null,
    }));

    const totals: InvoiceListTotals = {
      count: items.length,
      total: 0,
      paid: 0,
      outstanding: 0,
      overdue: 0,
      draft: 0,
      vat: 0,
      byStatus: {},
    };
    for (const it of items) {
      const t = Number(it.total ?? 0);
      const v = Number(it.vat_amount ?? 0);
      totals.total += t;
      totals.vat += v;
      if (it.status === "paid") totals.paid += t;
      else if (it.status === "overdue") {
        totals.overdue += t;
        totals.outstanding += t;
      } else if (it.status === "draft") totals.draft += t;
      else if (it.status === "sent") totals.outstanding += t;
      const key = it.status ?? "unknown";
      const s = (totals.byStatus[key] ??= { count: 0, total: 0 });
      s.count += 1;
      s.total += t;
    }

    return { items, totals };
  });
