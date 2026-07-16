import { jsPDF } from "jspdf";
import { ARABIC_FONT, registerArabicFont, shapeArabic } from "@/lib/pdf-arabic";
import type { DocumentEngineInput, DocumentEngineResult, PdfLineItem } from "./document-types";
import { drawUnifiedFooter, drawUnifiedHeader, PDF_PAGE } from "./header-footer";
import { getPdfTemplate } from "./templates";

async function rtl(text: string): Promise<string> {
  return shapeArabic(String(text));
}

function safeFileName(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

export async function renderDocumentPdf<TPayload extends { summary?: PdfLineItem[] }>(
  input: DocumentEngineInput<TPayload>,
): Promise<DocumentEngineResult> {
  const issuedAt = input.issuedAt ?? new Date();
  const template = getPdfTemplate(input.templateKey);
  const title = input.title ?? "مستند PDF";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await registerArabicFont(doc);
  doc.setFont(ARABIC_FONT, "normal");

  await drawUnifiedHeader(doc, {
    account: input.account,
    template,
    title,
    issuedAt,
  });

  doc.setTextColor(template.text);
  doc.setDrawColor(template.border);
  doc.setFont(ARABIC_FONT, "bold");
  doc.setFontSize(13);
  doc.text(await rtl("ملخص المستند"), PDF_PAGE.width - PDF_PAGE.margin, PDF_PAGE.bodyTop, {
    align: "right",
  });

  const rows = input.payload.summary ?? [
    { label: "نوع المستند", value: input.documentType },
    { label: "القالب", value: template.labelAr },
    { label: "الحالة", value: "جاهز للتوليد" },
  ];

  let y = PDF_PAGE.bodyTop + 10;
  for (const row of rows) {
    doc.setFont(ARABIC_FONT, "bold");
    doc.setFontSize(9);
    doc.text(await rtl(row.label), PDF_PAGE.width - PDF_PAGE.margin, y, { align: "right" });
    doc.setFont(ARABIC_FONT, "normal");
    doc.text(await rtl(String(row.value)), PDF_PAGE.width - 72, y, { align: "right" });
    y += 8;
  }

  await drawUnifiedFooter(doc, {
    account: input.account,
    template,
    title,
    issuedAt,
  });

  return makeResult(
    doc,
    safeFileName(
      `${input.documentType}-${input.templateKey}-${issuedAt.toISOString().slice(0, 10)}.pdf`,
    ),
  );
}

export async function renderArabicFontSmokeTestPdf(): Promise<DocumentEngineResult> {
  return renderDocumentPdf({
    documentType: "simplified_tax_invoice",
    templateKey: "official",
    title: "اختبار الخط العربي",
    account: {
      orgId: "font-smoke-test",
      accountType: "business",
      name: "منصة إدارة أملاك",
      taxNumber: "300000000000003",
      commercialRegistration: "1010000000",
      nationalAddress: "جدة، المملكة العربية السعودية",
    },
    payload: {
      summary: [
        { label: "النص", value: "فاتورة ضريبية مبسطة" },
        { label: "الأرقام", value: "1,150.75 ريال سعودي" },
        { label: "النتيجة المطلوبة", value: "حروف عربية متصلة واتجاه صحيح" },
      ],
    },
  });
}
