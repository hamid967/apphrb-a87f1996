/**
 * Minimal UBL 2.1 invoice XML draft for ZATCA Phase-2.
 *
 * NOTE: This is a compliance-shaped draft (namespaces + required blocks) —
 * not a production submission. Real submission also requires cryptographic
 * signature, XAdES envelope, and CSID/PCSID onboarding via the Fatoora
 * portal. Those are out of scope for Wave 2 batch A.
 */

export interface UblInvoiceInput {
  invoiceNumber: string;
  uuid: string;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:mm:ssZ
  previousHash: string;
  invoiceType: "standard" | "simplified"; // maps to 388/381 subtypes
  sellerName: string;
  sellerVatNumber: string;
  buyerName?: string | null;
  currency: string;
  subtotal: number | string;
  vatAmount: number | string;
  total: number | string;
}

const escape = (s: string) =>
  s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );

export function buildUblXml(i: UblInvoiceInput): string {
  const typeCode = i.invoiceType === "standard" ? "388" : "388"; // 388 tax invoice
  const typeName = i.invoiceType === "standard" ? "0100000" : "0200000";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escape(i.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${escape(i.uuid)}</cbc:UUID>
  <cbc:IssueDate>${escape(i.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escape(i.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${typeName}">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${escape(i.currency)}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${escape(i.currency)}</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escape(i.previousHash)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escape(i.sellerVatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escape(i.sellerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escape(i.buyerName ?? "N/A")}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${escape(i.currency)}">${i.vatAmount}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escape(i.currency)}">${i.subtotal}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount  currencyID="${escape(i.currency)}">${i.subtotal}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount  currencyID="${escape(i.currency)}">${i.total}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount       currencyID="${escape(i.currency)}">${i.total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}
