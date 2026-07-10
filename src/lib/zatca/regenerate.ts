import { buildUblXml, buildZatcaTlvBase64, sha256Hex, ZATCA_GENESIS_HASH } from "@/lib/zatca";

/**
 * Regenerate the ZATCA Phase-2 payload (UBL XML + hash + QR TLV) for an
 * invoice and persist it. Pure async helper — no auth middleware. Callers
 * pass the RLS-scoped supabase client (from a server-fn context) so writes
 * respect the caller's permissions.
 *
 * Used by both:
 *   - `generateZatcaInvoice` server fn (invoice detail page action)
 *   - `createInvoiceFromSchedule` (payment-schedules → invoice flow)
 */
export async function regenerateZatcaPayload(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  invoiceId: string,
): Promise<{ uuid: string; hash: string; qrTlv: string; xml: string; previousHash: string }> {
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, org_id, number, issue_date, subtotal, vat_amount, total, currency, invoice_type, contact_id",
    )
    .eq("id", invoiceId)
    .single();
  if (invErr || !inv) throw new Error(invErr?.message ?? "Invoice not found");

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", inv.org_id)
    .single();

  const { data: settingsRows } = await supabase
    .from("org_settings")
    .select("key, value")
    .eq("org_id", inv.org_id)
    .in("key", ["vat_number", "legal_name"]);
  const settingsMap = new Map<string, string>();
  for (const r of settingsRows ?? []) {
    if (r?.key) settingsMap.set(r.key, String(r.value ?? ""));
  }
  const sellerName = settingsMap.get("legal_name") || org?.name || "Seller";
  const sellerVat = settingsMap.get("vat_number") || "300000000000003";

  let buyerName: string | null = null;
  if (inv.contact_id) {
    const { data: c } = await supabase
      .from("contacts")
      .select("full_name")
      .eq("id", inv.contact_id)
      .maybeSingle();
    buyerName = c?.full_name ?? null;
  }

  const { data: prev } = await supabase
    .from("invoices")
    .select("zatca_hash")
    .eq("org_id", inv.org_id)
    .eq("zatca_status", "reported")
    .order("zatca_reported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousHash: string = prev?.zatca_hash ?? ZATCA_GENESIS_HASH;

  const uuid = crypto.randomUUID();
  const now = new Date();
  const issueDate = String(inv.issue_date ?? now.toISOString().slice(0, 10));
  const issueTime = now.toISOString().slice(11, 19) + "Z";

  const xml = buildUblXml({
    invoiceNumber: inv.number ?? inv.id,
    uuid,
    issueDate,
    issueTime,
    previousHash,
    invoiceType: (inv.invoice_type ?? "simplified") as "standard" | "simplified",
    sellerName,
    sellerVatNumber: sellerVat,
    buyerName,
    currency: inv.currency ?? "SAR",
    subtotal: inv.subtotal ?? 0,
    vatAmount: inv.vat_amount ?? 0,
    total: inv.total ?? 0,
  });

  const hash = await sha256Hex(xml);
  const qrTlv = buildZatcaTlvBase64({
    sellerName,
    vatNumber: sellerVat,
    timestampIso: now.toISOString(),
    invoiceTotal: inv.total ?? 0,
    vatTotal: inv.vat_amount ?? 0,
  });

  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      zatca_uuid: uuid,
      zatca_hash: hash,
      previous_hash: previousHash,
      qr_tlv: qrTlv,
      xml_ubl: xml,
      zatca_status: "draft",
    })
    .eq("id", invoiceId);
  if (upErr) throw new Error(upErr.message);

  return { uuid, hash, qrTlv, xml, previousHash };
}
