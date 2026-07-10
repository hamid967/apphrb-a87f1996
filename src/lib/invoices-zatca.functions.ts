import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { regenerateZatcaPayload } from "@/lib/zatca/regenerate";

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
 *
 * Payload construction lives in `@/lib/zatca/regenerate` so the payment-
 * schedules → invoice flow can reuse it without invoking a server fn.
 */

const GenSchema = z.object({ invoiceId: z.string().uuid() });

export const generateZatcaInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const res = await regenerateZatcaPayload(supabase, data.invoiceId);

    // Best-effort audit
    try {
      await supabase.rpc("log_audit", {
        _entity: "invoices",
        _entity_id: data.invoiceId,
        _action: "zatca.generate",
        _diff: { uuid: res.uuid, previousHash: res.previousHash, hash: res.hash } as unknown as never,
        _actor: userId,
      });
    } catch { /* ignore */ }

    return { ok: true, uuid: res.uuid, hash: res.hash, qrTlv: res.qrTlv };
  });


export const getZatcaBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select(
        "id, number, zatca_uuid, zatca_hash, previous_hash, qr_tlv, xml_ubl, zatca_status, zatca_reported_at, zatca_counter, zatca_sealed_at, invoice_type, total, currency, issue_date",
      )
      .eq("id", data.invoiceId)
      .single();
    if (error || !inv) throw new Error(error?.message ?? "Invoice not found");
    return inv;
  });

/**
 * Seal an invoice for ZATCA: assign a per-org monotonic counter, mark
 * status = 'reported' with a sealed_at timestamp. Idempotent — a re-seal
 * throws instead of allocating a new counter.
 */
export const sealZatcaInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, org_id, zatca_hash, zatca_counter, zatca_status")
      .eq("id", data.invoiceId)
      .single();
    if (invErr || !inv) throw new Error(invErr?.message ?? "Invoice not found");
    if (!inv.zatca_hash) {
      throw new Error("Generate ZATCA payload before sealing");
    }
    if (inv.zatca_counter) {
      throw new Error("Invoice is already sealed");
    }

    const { data: nextCounter, error: cErr } = await supabase.rpc(
      "zatca_next_counter",
      { _org_id: inv.org_id },
    );
    if (cErr) throw new Error(cErr.message);

    const sealedAt = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("invoices")
      .update({
        zatca_counter: nextCounter as unknown as number,
        zatca_sealed_at: sealedAt,
        zatca_reported_at: sealedAt,
        zatca_status: "reported",
      })
      .eq("id", inv.id)
      .is("zatca_counter", null);
    if (upErr) throw new Error(upErr.message);

    try {
      await supabase.rpc("log_audit", {
        _entity: "invoices",
        _entity_id: inv.id,
        _action: "zatca.seal",
        _diff: { counter: nextCounter, sealedAt } as unknown as never,
        _actor: userId,
      });
    } catch { /* ignore */ }

    return { ok: true, counter: nextCounter as unknown as number, sealedAt };
  });

export type ZatcaChainRow = {
  org_id: string;
  invoice_id: string;
  number: string | null;
  zatca_counter: number;
  zatca_hash: string | null;
  previous_hash: string | null;
  zatca_sealed_at: string | null;
  expected_previous_hash: string | null;
  counter_gap: boolean;
  hash_break: boolean;
};

export const getZatcaChainAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc(
      "zatca_chain_audit",
      { _org_id: undefined },
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ZatcaChainRow[];
  });
