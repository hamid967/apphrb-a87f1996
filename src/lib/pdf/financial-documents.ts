import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { ARABIC_FONT, registerArabicFont, shapeArabic } from "@/lib/pdf-arabic";
import { amountToArabicWords } from "./arabic-amount";
import type { AccountPdfProfile, DocumentEngineResult, PdfTemplateKey } from "./document-types";
import { drawUnifiedFooter, drawUnifiedHeader, PDF_PAGE } from "./header-footer";
import { getPdfTemplate } from "./templates";
import { buildSimplifiedInvoiceQrBase64 } from "./zatca-qr";

interface PdfDocumentBase {
  account: AccountPdfProfile;
  templateKey: PdfTemplateKey;
  issuedAt?: Date;
}

export interface SimplifiedTaxInvoicePdfInput extends PdfDocumentBase {
  invoiceNumber: string;
  sellerName?: string;
  sellerVatNumber?: string | null;
  buyerName?: string | null;
  description: string;
  subtotal: number;
  vatAmount: number;
  totalWithVat: number;
  currency?: string;
}

export interface VoucherPdfInput extends PdfDocumentBase {
  voucherType: "receipt" | "payment";
  voucherNumber: string;
  amount: number;
  currencyLabel?: string;
  partyName: string;
  statement: string;
  paymentMethod: string;
}

async function rtl(text: string): Promise<string> {
  return shapeArabic(String(text));
}

function money(value: number, currency = "SAR"): string {
  return `${Number(value || 0).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function makeResult(doc: jsPDF, fileName: string): DocumentEngineResult {
  const blob = doc.output("blob");
  return {
    fileName,
    blob,
    open: () => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    },
    download: () => doc.save(fileName),
  };
}

async function drawLabeledValue(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  width = 82,
) {
  doc.setFont(ARABIC_FONT, "bold");
  doc.setFontSize(8);
  doc.text(await rtl(label), x, y, { align: "right" });
  doc.setFont(ARABIC_FONT, "normal");
  doc.setFontSize(9);
  doc.text(await rtl(value || "—"), x - width, y, { align: "right" });
}

async function drawAmountRow(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
  template: ReturnType<typeof getPdfTemplate>,
  strong = false,
) {
  const left = PDF_PAGE.margin;
  const right = PDF_PAGE.width - PDF_PAGE.margin;
  doc.setDrawColor(template.border);
  doc.setLineWidth(0.15);
  doc.line(left, y + 2, right, y + 2);
  doc.setFont(ARABIC_FONT, strong ? "bold" : "normal");
  doc.setFontSize(strong ? 12 : 10);
  doc.text(await rtl(label), right, y, { align: "right" });
  doc.text(value, left, y, { align: "left" });
}

export async function renderSimplifiedTaxInvoicePdf(
  input: SimplifiedTaxInvoicePdfInput,
): Promise<DocumentEngineResult> {
  const issuedAt = input.issuedAt ?? new Date();
  const template = getPdfTemplate(input.templateKey);
  const currency = input.currency ?? "SAR";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await registerArabicFont(doc);

  await drawUnifiedHeader(doc, {
    account: input.account,
    template,
    title: "فاتورة ضريبية مبسطة",
    issuedAt,
  });

  const taxable = Boolean(input.sellerVatNumber || input.account.taxNumber);
  const sellerVatNumber = input.sellerVatNumber ?? input.account.taxNumber ?? "";
  const sellerName = input.sellerName ?? input.account.name;

  doc.setTextColor(template.text);
  await drawLabeledValue(doc, "رقم الفاتورة", input.invoiceNumber, PDF_PAGE.width - 14, 62);
  await drawLabeledValue(
    doc,
    "تاريخ ووقت الإصدار",
    issuedAt.toISOString(),
    PDF_PAGE.width - 14,
    70,
  );
  await drawLabeledValue(doc, "اسم البائع", sellerName, PDF_PAGE.width - 14, 78);
  await drawLabeledValue(
    doc,
    "الرقم الضريبي",
    taxable ? sellerVatNumber : "غير خاضع لضريبة القيمة المضافة",
    PDF_PAGE.width - 14,
    86,
  );
  await drawLabeledValue(doc, "العميل", input.buyerName ?? "—", PDF_PAGE.width - 14, 94);

  const boxTop = 108;
  doc.setFillColor(template.tableHeaderFill);
  doc.setDrawColor(template.border);
  doc.roundedRect(PDF_PAGE.margin, boxTop, PDF_PAGE.width - PDF_PAGE.margin * 2, 18, 2, 2, "FD");
  doc.setTextColor(
    input.templateKey === "modern" || input.templateKey === "simple" ? template.text : "#FFFFFF",
  );
  doc.setFont(ARABIC_FONT, "bold");
  doc.setFontSize(10);
  doc.text(await rtl("وصف الخدمة"), PDF_PAGE.width - 18, boxTop + 11, { align: "right" });
  doc.text(await rtl("الإجمالي"), PDF_PAGE.margin + 35, boxTop + 11, { align: "left" });

  doc.setTextColor(template.text);
  doc.setFont(ARABIC_FONT, "normal");
  doc.roundedRect(PDF_PAGE.margin, boxTop + 18, PDF_PAGE.width - PDF_PAGE.margin * 2, 28, 2, 2);
  doc.text(await rtl(input.description), PDF_PAGE.width - 18, boxTop + 34, { align: "right" });
  doc.text(money(input.subtotal, currency), PDF_PAGE.margin + 35, boxTop + 34, { align: "left" });

  const amountTop = 162;
  await drawAmountRow(
    doc,
    "الإجمالي قبل الضريبة",
    money(input.subtotal, currency),
    amountTop,
    template,
  );
  await drawAmountRow(
    doc,
    taxable ? "ضريبة القيمة المضافة 15%" : "الضريبة",
    taxable ? money(input.vatAmount, currency) : "غير خاضع",
    amountTop + 12,
    template,
  );
  await drawAmountRow(
    doc,
    "الإجمالي شامل الضريبة",
    taxable ? money(input.totalWithVat, currency) : money(input.subtotal, currency),
    amountTop + 24,
    template,
    true,
  );

  if (taxable) {
    const qrValue = buildSimplifiedInvoiceQrBase64({
      sellerName,
      vatNumber: sellerVatNumber,
      timestampIso: issuedAt.toISOString(),
      totalWithVat: input.totalWithVat.toFixed(2),
      vatAmount: input.vatAmount.toFixed(2),
    });
    const qrDataUrl = await QRCode.toDataURL(qrValue, { margin: 1, width: 180 });
    doc.addImage(qrDataUrl, "PNG", PDF_PAGE.margin, 72, 34, 34);
  }

  doc.setTextColor(template.muted);
  doc.setFont(ARABIC_FONT, "normal");
  doc.setFontSize(8);
  doc.text(
    await rtl("مستند صادر من نظام إدارة أملاك — ليس بديلاً عن حلول الفوترة الإلكترونية المعتمدة"),
    PDF_PAGE.width - PDF_PAGE.margin,
    220,
    { align: "right" },
  );

  await drawUnifiedFooter(doc, {
    account: input.account,
    template,
    title: "فاتورة ضريبية مبسطة",
    issuedAt,
  });

  return makeResult(doc, `simplified-tax-invoice-${input.invoiceNumber}.pdf`);
}

export async function renderVoucherPdf(input: VoucherPdfInput): Promise<DocumentEngineResult> {
  const issuedAt = input.issuedAt ?? new Date();
  const template = getPdfTemplate(input.templateKey);
  const title = input.voucherType === "receipt" ? "سند قبض" : "سند صرف";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await registerArabicFont(doc);

  await drawUnifiedHeader(doc, {
    account: input.account,
    template,
    title,
    issuedAt,
  });

  const right = PDF_PAGE.width - PDF_PAGE.margin;
  let y = 68;
  await drawLabeledValue(doc, "رقم السند", input.voucherNumber, right, y);
  y += 10;
  await drawLabeledValue(doc, "التاريخ", issuedAt.toISOString().slice(0, 10), right, y);
  y += 10;
  await drawLabeledValue(
    doc,
    input.voucherType === "receipt" ? "استلمنا من" : "دفعنا إلى",
    input.partyName,
    right,
    y,
  );
  y += 10;
  await drawLabeledValue(doc, "طريقة الدفع", input.paymentMethod, right, y);

  doc.setDrawColor(template.border);
  doc.roundedRect(PDF_PAGE.margin, 120, PDF_PAGE.width - PDF_PAGE.margin * 2, 34, 2, 2);
  doc.setFont(ARABIC_FONT, "bold");
  doc.setFontSize(18);
  doc.setTextColor(template.primary);
  doc.text(money(input.amount), PDF_PAGE.width / 2, 134, { align: "center" });
  doc.setTextColor(template.text);
  doc.setFontSize(10);
  doc.text(
    await rtl(amountToArabicWords(input.amount, input.currencyLabel ?? "ريال سعودي")),
    PDF_PAGE.width - 20,
    146,
    { align: "right" },
  );

  doc.setFont(ARABIC_FONT, "bold");
  doc.setFontSize(10);
  doc.text(await rtl("البيان"), right, 172, { align: "right" });
  doc.setFont(ARABIC_FONT, "normal");
  doc.text(await rtl(input.statement), right, 182, { align: "right" });

  doc.setDrawColor(template.border);
  doc.line(PDF_PAGE.margin, 232, 76, 232);
  doc.line(PDF_PAGE.width - 76, 232, PDF_PAGE.width - PDF_PAGE.margin, 232);
  doc.setFontSize(8);
  doc.text(await rtl("توقيع المستلم"), 76, 238, { align: "right" });
  doc.text(await rtl("توقيع المسؤول"), PDF_PAGE.width - PDF_PAGE.margin, 238, { align: "right" });

  await drawUnifiedFooter(doc, {
    account: input.account,
    template,
    title,
    issuedAt,
  });

  return makeResult(
    doc,
    `${input.voucherType === "receipt" ? "receipt" : "payment"}-voucher-${input.voucherNumber}.pdf`,
  );
}
