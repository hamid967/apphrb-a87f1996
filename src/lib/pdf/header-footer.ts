import type { jsPDF } from "jspdf";
import { ARABIC_FONT, shapeArabic } from "@/lib/pdf-arabic";
import type { AccountPdfProfile } from "./document-types";
import type { PdfTemplateDefinition } from "./templates";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;

export interface PdfChromeOptions {
  account: AccountPdfProfile;
  template: PdfTemplateDefinition;
  title: string;
  issuedAt: Date;
  platformName?: string;
}

async function rtlText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: { size?: number; bold?: boolean },
) {
  doc.setFont(ARABIC_FONT, options?.bold ? "bold" : "normal");
  doc.setFontSize(options?.size ?? 10);
  doc.text(await shapeArabic(text), x, y, { align: "right" });
}

export async function drawUnifiedHeader(doc: jsPDF, options: PdfChromeOptions): Promise<void> {
  const { account, template, title } = options;
  doc.setFillColor(template.primary);
  doc.rect(0, 0, PAGE_WIDTH, template.dense ? 22 : 30, "F");

  doc.setTextColor("#FFFFFF");
  await rtlText(doc, title, PAGE_WIDTH - MARGIN, template.dense ? 12 : 14, {
    size: template.dense ? 13 : 16,
    bold: true,
  });
  await rtlText(doc, account.name, PAGE_WIDTH - MARGIN, template.dense ? 19 : 23, {
    size: template.dense ? 9 : 10,
  });

  doc.setTextColor(template.text);
  const y = template.dense ? 31 : 40;
  const details = [
    account.taxNumber ? `الرقم الضريبي: ${account.taxNumber}` : null,
    account.commercialRegistration ? `السجل التجاري: ${account.commercialRegistration}` : null,
    account.nationalAddress ? `العنوان الوطني: ${account.nationalAddress}` : null,
  ].filter(Boolean);

  let lineY = y;
  for (const detail of details) {
    await rtlText(doc, detail ?? "", PAGE_WIDTH - MARGIN, lineY, { size: 8 });
    lineY += 5;
  }

  doc.setDrawColor(template.border);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, lineY + 2, PAGE_WIDTH - MARGIN, lineY + 2);
}

export async function drawUnifiedFooter(doc: jsPDF, options: PdfChromeOptions): Promise<void> {
  const issued = new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(options.issuedAt);
  doc.setDrawColor(options.template.border);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, PAGE_HEIGHT - 18, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 18);
  doc.setTextColor(options.template.muted);
  await rtlText(doc, `صادر في: ${issued}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 11, { size: 8 });
  doc.setFont(ARABIC_FONT, "normal");
  doc.setFontSize(8);
  doc.text("AMLAK HBSH", MARGIN, PAGE_HEIGHT - 11);
  doc.text("1 / 1", PAGE_WIDTH / 2, PAGE_HEIGHT - 11, { align: "center" });
}

export const PDF_PAGE = {
  width: PAGE_WIDTH,
  height: PAGE_HEIGHT,
  margin: MARGIN,
  bodyTop: 58,
  bodyBottom: PAGE_HEIGHT - 24,
};
