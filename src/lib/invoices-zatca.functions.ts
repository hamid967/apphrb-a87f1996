import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildUblXml,
  buildZatcaTlvBase64,
  sha256Hex,
  ZATCA_GENESIS_HASH,
} from "@/lib/zatca";

/**
 * Wave 2 — ZATCA Phase-2 invoice generator.
 *
 * Rebuilds the UBL 2.1 XML + QR TLV + hash chain for a single invoice
 * and persists the results on the invoice row. Does NOT transmit to
 * ZATCA — a later wave will add Fatoora API submission and cryptographic
 * signing (XAdES + CSID onboarding).
 *
 * Invariants:
 *   - Chain uses the previous `reported` invoice in the same org
 *     (index: idx_invoices_zatca_chain). Falls back to genesis hash.
 *   - Every call regenerates zatca_uuid to keep TLV and XML consistent.
 *   - Status is set to 'draft' after generation until the caller decides
 *     to submit (future wave).
 */

const GenSchema = z.object({ invoiceId: z.string().uuid() });

export const generateZatcaInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select(
        "id, org_id, number, issue_date, subtotal, vat_amount, total, currency, invoice_type, contact_id",
      )
      .eq("id", data.invoiceId)
      .single();
    if (invErr || !inv) throw new Error(invErr?.message ?? "Invoice not found");

    // Seller profile (org record)
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

    // Buyer (contact)
    let buyerName: string | null = null;
    if (inv.contact_id) {
      const { data: c } = await supabase
        .from("contacts")
        .select("full_name")
        .eq("id", inv.contact_id)
        .maybeSingle();
      buyerName = c?.full_name ?? null;
    }

    // Previous reported invoice hash for chaining
    const { data: prev } = await supabase
      .from("invoices")
      .select("zatca_hash")
      .eq("org_id", inv.org_id)
      .eq("zatca_status", "reported")
      .order("zatca_reported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousHash = prev?.zatca_hash ?? ZATCA_GENESIS_HASH;

    // Fresh UUID + timestamp for every regeneration
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

    const zatcaHash = await sha256Hex(xml);
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
        zatca_hash: zatcaHash,
        previous_hash: previousHash,
        qr_tlv: qrTlv,
        xml_ubl: xml,
        zatca_status: "draft",
      })
      .eq("id", inv.id);
    if (upErr) throw new Error(upErr.message);

    // Best-effort audit
    try {
      await supabase.rpc("log_audit", {
        _entity: "invoices",
        _entity_id: inv.id,
        _action: "zatca.generate",
        _diff: { uuid, previousHash, hash: zatcaHash } as unknown as never,
        _actor: userId,
      });
    } catch { /* ignore */ }

    return { ok: true, uuid, hash: zatcaHash, qrTlv };
  });

export const getZatcaBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select(
        "id, number, zatca_uuid, zatca_hash, previous_hash, qr_tlv, zatca_status, zatca_reported_at, invoice_type",
      )
      .eq("id", data.invoiceId)
      .single();
    if (error || !inv) throw new Error(error?.message ?? "Invoice not found");
    return inv;
  });
