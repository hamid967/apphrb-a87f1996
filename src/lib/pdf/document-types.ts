export type PdfDocumentType =
  | "simplified_tax_invoice"
  | "receipt_voucher"
  | "payment_voucher"
  | "property_performance_report"
  | "tenant_statement"
  | "personal_expense_statement"
  | "maintenance_report";

export type PdfTemplateKey = "official" | "modern" | "luxury" | "simple";

export interface AccountPdfProfile {
  orgId: string;
  accountType?: "individual" | "business" | string | null;
  name: string;
  logoUrl?: string | null;
  taxNumber?: string | null;
  commercialRegistration?: string | null;
  nationalAddress?: string | null;
}

export interface PdfMoney {
  amount: number;
  currency?: string;
}

export interface PdfLineItem {
  label: string;
  value: string | number;
}

export interface DocumentEngineInput<TPayload = Record<string, unknown>> {
  documentType: PdfDocumentType;
  templateKey: PdfTemplateKey;
  account: AccountPdfProfile;
  payload: TPayload;
  issuedAt?: Date;
  title?: string;
}

export interface DocumentEngineResult {
  fileName: string;
  blob: Blob;
  open: () => void;
  download: () => void;
}
