/**
 * Wave 3 — Fatoora-like invoice PDF generator (client-side).
 *
 * Produces an A4 PDF with:
 *   - Arabic + English seller/buyer info
 *   - Line items + VAT breakdown
 *   - ZATCA Phase-2 QR (from TLV base64)
 *   - Embedded UBL XML attachment (PDF/A-3-style AFRelationship = Source)
 *   - XMP metadata block
 *
 * Runs in the browser — no Worker font-loading gymnastics.
 * pdf-lib does not do Arabic shaping, so we run `arabic-reshaper` +
 * per-run reversal for RTL. Good enough for headers, labels, and short
 * business names. For long free-text notes prefer English.
 */

import {
  PDFDocument,
  PDFName,
  PDFHexString,
  PDFString,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import reshaper from "arabic-reshaper";

import notoRegularUrl from "@/assets/fonts/NotoNaskhArabic-Regular.ttf?url";
import notoBoldUrl from "@/assets/fonts/NotoNaskhArabic-Bold.ttf?url";

// ---------- text helpers ------------------------------------------------

const AR_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

function shape(text: string | null | undefined): string {
  if (!text) return "";
  if (!AR_RE.test(text)) return text;
  // Reshape Arabic contextual forms then reverse code-points so pdf-lib's
  // LTR draw order renders RTL correctly.
  return reshaper.convertArabic(text).split("").reverse().join("");
}

// ---------- types -------------------------------------------------------

export type InvoicePdfLine = {
  description: string;
  qty: number;
  unit_price: number;
  vat_rate: number;
  amount: number; // qty * unit_price (pre-VAT)
};

export type InvoicePdfInput = {
  invoice: {
    number: string;
    issue_date: string;
    due_date?: string | null;
    zatca_uuid?: string | null;
    zatca_counter?: number | null;
    subtotal: number;
    vat_amount: number;
    total: number;
    currency: string; // "SAR"
    qr_tlv?: string | null;
    xml_ubl?: string | null;
    notes?: string | null;
  };
  docKind?: "invoice" | "credit_note" | "debit_note";
  reference?: { number: string; issue_date?: string | null; reason?: string | null } | null;
  seller: {
    name_ar: string;
    name_en?: string;
    vat_number?: string;
    cr_number?: string;
    address?: string;
    logo_data_url?: string | null;
  };
  buyer: {
    name: string;
    vat_number?: string;
    address?: string;
    email?: string;
    phone?: string;
  };
  lines: InvoicePdfLine[];
};

// ---------- PDF builder -------------------------------------------------

const A4 = { w: 595.28, h: 841.89 };
const M = 40;

async function loadFont(doc: PDFDocument, url: string): Promise<PDFFont> {
  const bytes = await fetch(url).then((r) => r.arrayBuffer());
  return doc.embedFont(bytes, { subset: true });
}

function fmt(n: number, currency = "SAR"): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0) + " " + currency;
}

function drawRightText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb> },
) {
  const w = opts.font.widthOfTextAtSize(text, opts.size);
  page.drawText(text, {
    x: x - w,
    y,
    font: opts.font,
    size: opts.size,
    color: opts.color ?? rgb(0.1, 0.12, 0.15),
  });
}

function drawLeftText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: { font: PDFFont; size: number; color?: ReturnType<typeof rgb> },
) {
  page.drawText(text, {
    x,
    y,
    font: opts.font,
    size: opts.size,
    color: opts.color ?? rgb(0.1, 0.12, 0.15),
  });
}

/** Attach a file (UBL XML) as PDF/A-3 style associated file. */
function attachXml(doc: PDFDocument, filename: string, xml: string) {
  const bytes = new TextEncoder().encode(xml);
  doc.attach(bytes, filename, {
    mimeType: "application/xml",
    description: "ZATCA UBL 2.1 e-invoice XML",
    creationDate: new Date(),
    modificationDate: new Date(),
    afRelationship: "Source" as unknown as never, // pdf-lib types are permissive
  });
}

/** Minimal XMP metadata block (not full PDF/A-3 conformance, but useful). */
function setXmpMetadata(doc: PDFDocument, title: string) {
  doc.setTitle(title);
  doc.setSubject("ZATCA e-invoice (Phase 2)");
  doc.setKeywords(["zatca", "fatoora", "e-invoice", "ubl", "sar"]);
  doc.setProducer("Aqari by HRHBS — Fatoora-like invoicing");
  doc.setCreator("Aqari Invoice Engine");
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());
}

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const [ar, arBold] = await Promise.all([
    loadFont(doc, notoRegularUrl),
    loadFont(doc, notoBoldUrl),
  ]);

  const page = doc.addPage([A4.w, A4.h]);
  const { w, h } = { w: A4.w, h: A4.h };

  // -------------------- Header band --------------------
  // header rectangle drawn below with docKind-aware color

  const kind = input.docKind ?? "invoice";
  const titles = {
    invoice: { en: "TAX INVOICE", ar: "فاتورة ضريبية", sub_en: "Fatoora — ZATCA Phase 2", sub_ar: "متوافقة مع هيئة الزكاة والضريبة والجمارك" },
    credit_note: { en: "CREDIT NOTE", ar: "إشعار دائن", sub_en: "Linked to original tax invoice", sub_ar: "مرتبط بفاتورة ضريبية أصلية" },
    debit_note: { en: "DEBIT NOTE", ar: "إشعار مدين", sub_en: "Linked to original tax invoice", sub_ar: "مرتبط بفاتورة ضريبية أصلية" },
  }[kind];
  const bandColor = kind === "credit_note"
    ? rgb(0.55, 0.15, 0.15)
    : kind === "debit_note"
      ? rgb(0.15, 0.35, 0.55)
      : rgb(0.06, 0.09, 0.13);
  page.drawRectangle({ x: 0, y: h - 90, width: w, height: 90, color: bandColor });
  drawLeftText(page, titles.en, M, h - 45, { font: arBold, size: 22, color: rgb(1, 1, 1) });
  drawLeftText(page, titles.sub_en, M, h - 65, { font: ar, size: 10, color: rgb(0.85, 0.88, 0.94) });
  drawRightText(page, shape(titles.ar), w - M, h - 45, { font: arBold, size: 22, color: rgb(1, 1, 1) });
  drawRightText(page, shape(titles.sub_ar), w - M, h - 65, { font: ar, size: 10, color: rgb(0.85, 0.88, 0.94) });

  // -------------------- Seller / Buyer blocks --------------------
  let y = h - 120;
  drawLeftText(page, "SELLER", M, y, { font: arBold, size: 9, color: rgb(0.35, 0.4, 0.5) });
  drawRightText(page, shape("البائع"), w - M, y, { font: arBold, size: 9, color: rgb(0.35, 0.4, 0.5) });
  y -= 14;
  drawLeftText(page, input.seller.name_en ?? "", M, y, { font: arBold, size: 12 });
  drawRightText(page, shape(input.seller.name_ar), w - M, y, { font: arBold, size: 12 });
  y -= 13;
  if (input.seller.vat_number) {
    drawLeftText(page, `VAT: ${input.seller.vat_number}`, M, y, { font: ar, size: 10 });
    drawRightText(page, shape(`الرقم الضريبي: ${input.seller.vat_number}`), w - M, y, { font: ar, size: 10 });
    y -= 12;
  }
  if (input.seller.cr_number) {
    drawLeftText(page, `CR: ${input.seller.cr_number}`, M, y, { font: ar, size: 10 });
    drawRightText(page, shape(`السجل التجاري: ${input.seller.cr_number}`), w - M, y, { font: ar, size: 10 });
    y -= 12;
  }
  if (input.seller.address) {
    drawLeftText(page, input.seller.address, M, y, { font: ar, size: 9, color: rgb(0.3, 0.34, 0.4) });
    y -= 12;
  }

  // Separator
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: w - M, y }, thickness: 0.5, color: rgb(0.8, 0.83, 0.88) });
  y -= 16;

  drawLeftText(page, "BILL TO", M, y, { font: arBold, size: 9, color: rgb(0.35, 0.4, 0.5) });
  drawRightText(page, shape("العميل"), w - M, y, { font: arBold, size: 9, color: rgb(0.35, 0.4, 0.5) });
  y -= 14;
  const buyerName = input.buyer.name || "—";
  if (AR_RE.test(buyerName)) {
    drawRightText(page, shape(buyerName), w - M, y, { font: arBold, size: 12 });
  } else {
    drawLeftText(page, buyerName, M, y, { font: arBold, size: 12 });
  }
  y -= 13;
  if (input.buyer.vat_number) {
    drawLeftText(page, `VAT: ${input.buyer.vat_number}`, M, y, { font: ar, size: 10 });
    y -= 12;
  }
  if (input.buyer.address) {
    drawLeftText(page, input.buyer.address, M, y, { font: ar, size: 9, color: rgb(0.3, 0.34, 0.4) });
    y -= 12;
  }

  // -------------------- Invoice meta box --------------------
  const metaX = w - M - 200;
  let metaY = h - 200;
  page.drawRectangle({
    x: metaX, y: metaY - 60, width: 200, height: 70,
    borderColor: rgb(0.86, 0.88, 0.92), borderWidth: 0.75, color: rgb(0.97, 0.98, 0.99),
  });
  const metaLine = (label: string, value: string, dy: number) => {
    drawLeftText(page, label, metaX + 8, metaY - dy, { font: ar, size: 9, color: rgb(0.4, 0.44, 0.5) });
    drawRightText(page, value, metaX + 200 - 8, metaY - dy, { font: arBold, size: 10 });
  };
  metaLine("Invoice #", input.invoice.number, 12);
  metaLine("Issue date", input.invoice.issue_date, 28);
  if (input.invoice.due_date) metaLine("Due date", input.invoice.due_date, 44);
  if (input.invoice.zatca_counter) metaLine("ICV", `#${input.invoice.zatca_counter}`, 58);

  // -------------------- Line items table --------------------
  y = Math.min(y, metaY - 80) - 10;

  const cols = { desc: M, qty: w - M - 220, price: w - M - 140, vat: w - M - 70, total: w - M };
  page.drawRectangle({
    x: M - 4, y: y - 4, width: w - 2 * M + 8, height: 22,
    color: rgb(0.94, 0.96, 0.98),
  });
  drawLeftText(page, "Description / الوصف", cols.desc, y + 4, { font: arBold, size: 9 });
  drawRightText(page, "Qty", cols.qty, y + 4, { font: arBold, size: 9 });
  drawRightText(page, "Unit price", cols.price, y + 4, { font: arBold, size: 9 });
  drawRightText(page, "VAT %", cols.vat, y + 4, { font: arBold, size: 9 });
  drawRightText(page, "Total", cols.total, y + 4, { font: arBold, size: 9 });
  y -= 22;

  for (const line of input.lines) {
    if (y < 200) break; // stop if we run out of room (single-page for now)
    const desc = line.description || "";
    if (AR_RE.test(desc)) {
      drawRightText(page, shape(desc), cols.qty - 8, y + 4, { font: ar, size: 10 });
    } else {
      drawLeftText(page, desc.slice(0, 60), cols.desc, y + 4, { font: ar, size: 10 });
    }
    drawRightText(page, String(line.qty), cols.qty, y + 4, { font: ar, size: 10 });
    drawRightText(page, fmt(line.unit_price, ""), cols.price, y + 4, { font: ar, size: 10 });
    drawRightText(page, `${line.vat_rate}%`, cols.vat, y + 4, { font: ar, size: 10 });
    drawRightText(page, fmt(line.amount, ""), cols.total, y + 4, { font: arBold, size: 10 });
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: w - M, y: y - 4 }, thickness: 0.25, color: rgb(0.9, 0.92, 0.94) });
    y -= 20;
  }

  // -------------------- Totals --------------------
  y -= 10;
  const tX = w - M;
  const tLabelX = w - M - 200;
  const totRow = (label: string, labelAr: string, value: string, bold = false) => {
    drawLeftText(page, label, tLabelX, y, { font: bold ? arBold : ar, size: 10 });
    drawRightText(page, shape(labelAr), tLabelX + 90, y, { font: bold ? arBold : ar, size: 10 });
    drawRightText(page, value, tX, y, { font: bold ? arBold : ar, size: 11 });
    y -= 16;
  };
  const cur = input.invoice.currency || "SAR";
  totRow("Subtotal", "المجموع", fmt(input.invoice.subtotal, cur));
  totRow("VAT (15%)", "الضريبة", fmt(input.invoice.vat_amount, cur));
  y -= 4;
  page.drawLine({ start: { x: tLabelX, y: y + 12 }, end: { x: tX, y: y + 12 }, thickness: 0.75, color: rgb(0.6, 0.66, 0.74) });
  totRow("TOTAL", "الإجمالي", fmt(input.invoice.total, cur), true);

  // -------------------- QR + footer --------------------
  if (input.invoice.qr_tlv) {
    const qrDataUrl = await QRCode.toDataURL(input.invoice.qr_tlv, {
      errorCorrectionLevel: "M", margin: 1, scale: 6, type: "image/png",
    });
    const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    const qrImg = await doc.embedPng(qrBytes);
    const qrSize = 110;
    page.drawImage(qrImg, { x: M, y: 90, width: qrSize, height: qrSize });
    drawLeftText(page, "ZATCA QR (TLV)", M, 82, { font: ar, size: 8, color: rgb(0.4, 0.44, 0.5) });
    drawLeftText(page, shape("رمز الاستجابة السريعة"), M, 72, { font: ar, size: 8, color: rgb(0.4, 0.44, 0.5) });
  }

  if (input.invoice.zatca_uuid) {
    drawLeftText(page, `UUID: ${input.invoice.zatca_uuid}`, M + 130, 190, { font: ar, size: 8, color: rgb(0.35, 0.4, 0.5) });
  }
  if (input.invoice.notes) {
    drawLeftText(page, input.invoice.notes.slice(0, 200), M + 130, 170, { font: ar, size: 9, color: rgb(0.25, 0.3, 0.36) });
  }

  drawLeftText(page, "Generated by Aqari — Fatoora e-invoicing engine", M, 30, { font: ar, size: 8, color: rgb(0.5, 0.55, 0.62) });
  drawRightText(page, shape("مولّدة عبر عقاري — نظام الفوترة الإلكترونية"), w - M, 30, { font: ar, size: 8, color: rgb(0.5, 0.55, 0.62) });

  // -------------------- Embed XML + metadata --------------------
  if (input.invoice.xml_ubl) {
    attachXml(doc, `invoice-${input.invoice.number}.xml`, input.invoice.xml_ubl);
  }
  setXmpMetadata(doc, `Invoice ${input.invoice.number}`);

  return doc.save();
}

export function downloadPdfBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
