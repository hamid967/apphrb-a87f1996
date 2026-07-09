/**
 * ZATCA Phase-2 QR TLV encoder.
 *
 * Builds the mandatory 5-tag TLV payload for simplified tax invoices:
 *   1 = Seller name
 *   2 = VAT registration number
 *   3 = Timestamp (ISO 8601)
 *   4 = Invoice total (with VAT)
 *   5 = VAT amount
 *
 * Reference: ZATCA E-Invoicing Detailed Technical Guidelines §2.5.
 * Pure browser/Worker-safe — uses TextEncoder only.
 */

export interface TlvInput {
  sellerName: string;
  vatNumber: string;
  timestampIso: string; // e.g. "2026-07-09T21:00:00Z"
  invoiceTotal: number | string;
  vatTotal: number | string;
}

function tlvField(tag: number, value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 255) {
    throw new Error(`TLV field tag=${tag} exceeds 255 bytes`);
  }
  const out = new Uint8Array(bytes.length + 2);
  out[0] = tag;
  out[1] = bytes.length;
  out.set(bytes, 2);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  // btoa is available in Cloudflare Workers and browsers.
  return typeof btoa === "function"
    ? btoa(bin)
    : Buffer.from(bytes).toString("base64");
}

export function buildZatcaTlvBase64(input: TlvInput): string {
  const fields = [
    tlvField(1, input.sellerName),
    tlvField(2, input.vatNumber),
    tlvField(3, input.timestampIso),
    tlvField(4, String(input.invoiceTotal)),
    tlvField(5, String(input.vatTotal)),
  ];
  return toBase64(concat(fields));
}
