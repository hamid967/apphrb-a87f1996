import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Wave 3 — Credit / Debit Notes
 *
 * A note is always linked to an original invoice, inherits its org_id +
 * currency, and gets a per-org sequential number: CN-YYYY-#### or
 * DN-YYYY-####. Totals are computed server-side from subtotal + vat_rate.
 */

const NoteType = z.enum(["credit", "debit"]);

const ListSchema = z.object({ invoiceId: z.string().uuid() });
const GetSchema = z.object({ noteId: z.string().uuid() });
const DeleteSchema = z.object({ noteId: z.string().uuid() });

const CreateSchema = z.object({
  invoiceId: z.string().uuid(),
  note_type: NoteType,
  reason: z.string().min(2).max(500),
  subtotal: z.number().nonnegative(),
  vat_rate: z.number().min(0).max(100).default(15),
  issue_date: z.string().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function nextNoteNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  noteType: "credit" | "debit",
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = noteType === "credit" ? "CN" : "DN";
  const like = `${prefix}-${year}-%`;
  const { data, error } = await supabase
    .from("invoice_notes")
    .select("number")
    .eq("org_id", orgId)
    .like("number", like)
    .order("number", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const last = data?.[0]?.number as string | undefined;
  const nextSeq = last ? parseInt(last.split("-").pop() ?? "0", 10) + 1 : 1;
  return `${prefix}-${year}-${String(nextSeq).padStart(4, "0")}`;
}

export const listInvoiceNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("invoice_notes")
      .select("id, number, note_type, reason, issue_date, subtotal, vat_rate, vat_amount, total, currency, notes, created_at")
      .eq("invoice_id", data.invoiceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createInvoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, org_id, currency, total")
      .eq("id", data.invoiceId)
      .single();
    if (invErr || !inv) throw new Error(invErr?.message ?? "Invoice not found");

    if (data.note_type === "credit" && data.subtotal > Number(inv.total)) {
      throw new Error("Credit note subtotal cannot exceed original invoice total");
    }

    const subtotal = round2(data.subtotal);
    const vatAmount = round2(subtotal * (data.vat_rate / 100));
    const total = round2(subtotal + vatAmount);

    const number = await nextNoteNumber(supabase, inv.org_id, data.note_type);

    const { data: inserted, error: insErr } = await supabase
      .from("invoice_notes")
      .insert({
        org_id: inv.org_id,
        invoice_id: inv.id,
        number,
        note_type: data.note_type,
        reason: data.reason,
        issue_date: data.issue_date ?? new Date().toISOString().slice(0, 10),
        subtotal,
        vat_rate: data.vat_rate,
        vat_amount: vatAmount,
        total,
        currency: inv.currency ?? "SAR",
        notes: data.notes ?? null,
        created_by: userId,
      })
      .select("id, number")
      .single();
    if (insErr) throw new Error(insErr.message);
    return inserted;
  });

export const getInvoiceNoteForPdf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GetSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: note, error } = await supabase
      .from("invoice_notes")
      .select("id, org_id, invoice_id, number, note_type, reason, issue_date, subtotal, vat_rate, vat_amount, total, currency, notes")
      .eq("id", data.noteId)
      .single();
    if (error || !note) throw new Error(error?.message ?? "Note not found");

    const { data: inv } = await supabase
      .from("invoices")
      .select("number, issue_date, contact_id")
      .eq("id", note.invoice_id)
      .maybeSingle();

    const [orgRes, settingsRes, contactRes] = await Promise.all([
      supabase.from("organizations").select("name, logo_url").eq("id", note.org_id).maybeSingle(),
      supabase.from("org_settings").select("key, value").eq("org_id", note.org_id).in("key", [
        "seller_name_ar", "seller_name_en", "seller_vat_number", "seller_cr_number", "seller_address",
      ]),
      inv?.contact_id
        ? supabase.from("contacts").select("full_name, email, phone").eq("id", inv.contact_id).maybeSingle()
        : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
    ]);

    const settings = new Map<string, string>();
    for (const r of (settingsRes.data ?? []) as Array<{ key: string; value: unknown }>) {
      const v = r.value as { value?: string } | string | null;
      settings.set(r.key, typeof v === "string" ? v : (v?.value ?? ""));
    }

    return {
      note,
      original: { number: inv?.number ?? null, issue_date: inv?.issue_date ?? null },
      seller: {
        name_ar: settings.get("seller_name_ar") || orgRes.data?.name || "",
        name_en: settings.get("seller_name_en") || undefined,
        vat_number: settings.get("seller_vat_number") || undefined,
        cr_number: settings.get("seller_cr_number") || undefined,
        address: settings.get("seller_address") || undefined,
      },
      buyer: {
        name: contactRes.data?.full_name ?? "—",
        email: contactRes.data?.email ?? undefined,
        phone: contactRes.data?.phone ?? undefined,
      },
    };
  });

export const deleteInvoiceNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invoice_notes")
      .delete()
      .eq("id", data.noteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
