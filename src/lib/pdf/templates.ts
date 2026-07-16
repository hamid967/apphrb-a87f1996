import type { PdfTemplateKey } from "./document-types";

export interface PdfTemplateDefinition {
  key: PdfTemplateKey;
  labelAr: string;
  labelEn: string;
  primary: string;
  accent: string;
  border: string;
  text: string;
  muted: string;
  tableHeaderFill: string;
  dense: boolean;
}

export const PDF_TEMPLATES: Record<PdfTemplateKey, PdfTemplateDefinition> = {
  official: {
    key: "official",
    labelAr: "الرسمي",
    labelEn: "Official",
    primary: "#0A1A2F",
    accent: "#00D9C0",
    border: "#0A1A2F",
    text: "#111827",
    muted: "#64748B",
    tableHeaderFill: "#0A1A2F",
    dense: false,
  },
  modern: {
    key: "modern",
    labelAr: "العصري",
    labelEn: "Modern",
    primary: "#00D9C0",
    accent: "#0A1A2F",
    border: "#99F6E4",
    text: "#0F172A",
    muted: "#64748B",
    tableHeaderFill: "#CCFBF1",
    dense: false,
  },
  luxury: {
    key: "luxury",
    labelAr: "الفاخر",
    labelEn: "Luxury",
    primary: "#0A1A2F",
    accent: "#C9A961",
    border: "#C9A961",
    text: "#111827",
    muted: "#6B7280",
    tableHeaderFill: "#0A1A2F",
    dense: false,
  },
  simple: {
    key: "simple",
    labelAr: "المبسّط",
    labelEn: "Simple",
    primary: "#111111",
    accent: "#444444",
    border: "#111111",
    text: "#111111",
    muted: "#555555",
    tableHeaderFill: "#F3F4F6",
    dense: true,
  },
};

export function getPdfTemplate(key: PdfTemplateKey): PdfTemplateDefinition {
  return PDF_TEMPLATES[key] ?? PDF_TEMPLATES.official;
}
