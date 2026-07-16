import { buildZatcaTlvBase64 } from "@/lib/zatca/tlv";

export interface SimplifiedInvoiceQrInput {
  sellerName: string;
  vatNumber: string;
  timestampIso: string;
  totalWithVat: number | string;
  vatAmount: number | string;
}

export function buildSimplifiedInvoiceQrBase64(input: SimplifiedInvoiceQrInput): string {
  return buildZatcaTlvBase64({
    sellerName: input.sellerName,
    vatNumber: input.vatNumber,
    timestampIso: input.timestampIso,
    invoiceTotal: input.totalWithVat,
    vatTotal: input.vatAmount,
  });
}
