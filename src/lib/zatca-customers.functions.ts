import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * ZATCA customer management — a filtered view of `contacts` enriched with
 * VAT / CR / structured address fields required by ZATCA Phase-2 invoices.
 */

const AddressSchema = z.object({
  address_street: z.string().max(200).optional().nullable(),
  address_building_number: z
    .string()
    .regex(/^\d{4}$/, "Building number must be 4 digits")
    .optional()
    .nullable()
    .or(z.literal("")),
  address_additional_number: z
    .string()
    .regex(/^\d{4}$/, "Additional number must be 4 digits")
    .optional()
    .nullable()
    .or(z.literal("")),
  address_district: z.string().max(100).optional().nullable(),
  address_city: z.string().max(100).optional().nullable(),
  address_postal_code: z
    .string()
    .regex(/^\d{5}$/, "Postal code must be 5 digits")
    .optional()
    .nullable()
    .or(z.literal("")),
  address_country_code: z.string().length(2).default("SA"),
});

const UpsertSchema = z
  .object({
    id: z.string().uuid().optional(),
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
    phone: z.string().trim().max(30).optional().nullable().or(z.literal("")),
    vat_number: z
      .string()
      .regex(/^3\d{13}3$/, "VAT must be 15 digits, start and end with 3")
      .optional()
      .nullable()
      .or(z.literal("")),
    cr_number: z
      .string()
      .regex(/^\d{7,10}$/, "CR must be 7-10 digits")
      .optional()
      .nullable()
      .or(z.literal("")),
  })
  .merge(AddressSchema);

export type ZatcaCustomerInput = z.infer<typeof UpsertSchema>;

export type ZatcaCustomerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  vat_number: string | null;
  cr_number: string | null;
  address_street: string | null;
  address_building_number: string | null;
  address_additional_number: string | null;
  address_district: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  address_country_code: string | null;
  invoice_count: number;
};

async function primaryOrgId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (data?.org_id as string) ?? null;
}

/** List customers (contact_type=customer) with invoice counts. */
export const listZatcaCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) return { items: [] as ZatcaCustomerRow[] };

    let q = supabase
      .from("contacts")
      .select(
        "id, full_name, email, phone, vat_number, cr_number, address_street, address_building_number, address_additional_number, address_district, address_city, address_postal_code, address_country_code",
      )
      .eq("org_id", orgId)
      .eq("contact_type", "customer")
      .order("full_name", { ascending: true })
      .limit(500);

    if (data.q && data.q.trim()) {
      const n = data.q.trim().replace(/[%_]/g, "\\$&");
      q = q.or(
        `full_name.ilike.%${n}%,vat_number.ilike.%${n}%,cr_number.ilike.%${n}%,email.ilike.%${n}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: invRows, error: invErr } = await supabase
        .from("invoices")
        .select("contact_id")
        .eq("org_id", orgId)
        .in("contact_id", ids);
      if (invErr) throw new Error(invErr.message);
      for (const r of (invRows ?? []) as Array<{ contact_id: string | null }>) {
        if (!r.contact_id) continue;
        counts.set(r.contact_id, (counts.get(r.contact_id) ?? 0) + 1);
      }
    }

    const items: ZatcaCustomerRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      vat_number: r.vat_number,
      cr_number: r.cr_number,
      address_street: r.address_street,
      address_building_number: r.address_building_number,
      address_additional_number: r.address_additional_number,
      address_district: r.address_district,
      address_city: r.address_city,
      address_postal_code: r.address_postal_code,
      address_country_code: r.address_country_code,
      invoice_count: counts.get(r.id) ?? 0,
    }));
    return { items };
  });

/** Create or update a ZATCA customer. */
export const upsertZatcaCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) throw new Error("No organization found");

    // Empty strings → null so trigger validation accepts them
    const clean = <T extends string | null | undefined>(v: T) =>
      v === "" || v === undefined ? null : v;

    const payload = {
      org_id: orgId,
      full_name: data.full_name,
      contact_type: "customer" as const,
      email: clean(data.email),
      phone: clean(data.phone),
      vat_number: clean(data.vat_number),
      cr_number: clean(data.cr_number),
      address_street: clean(data.address_street),
      address_building_number: clean(data.address_building_number),
      address_additional_number: clean(data.address_additional_number),
      address_district: clean(data.address_district),
      address_city: clean(data.address_city),
      address_postal_code: clean(data.address_postal_code),
      address_country_code: data.address_country_code || "SA",
      created_by: userId,
    };

    if (data.id) {
      const { data: row, error } = await supabase
        .from("contacts")
        .update(payload)
        .eq("id", data.id)
        .eq("org_id", orgId)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, id: row.id };
    } else {
      const { data: row, error } = await supabase
        .from("contacts")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, id: row.id };
    }
  });

/** Link (or unlink) an invoice to a ZATCA customer. */
export const linkInvoiceToCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        invoice_id: z.string().uuid(),
        contact_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("invoices")
      .update({ contact_id: data.contact_id })
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Invoices linked to a given customer. */
export const listCustomerInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ contact_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("invoices")
      .select("id, number, issue_date, total, currency, status, zatca_status")
      .eq("contact_id", data.contact_id)
      .order("issue_date", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

/** Unlinked invoices in the org (contact_id IS NULL) — for the linker dialog. */
export const listUnlinkedInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) return { items: [] as Array<{ id: string; number: string | null; total: number | null; issue_date: string | null }> };
    const { data, error } = await supabase
      .from("invoices")
      .select("id, number, issue_date, total")
      .eq("org_id", orgId)
      .is("contact_id", null)
      .order("issue_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });
