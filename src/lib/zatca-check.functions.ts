import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * ZATCA Phase-2 Self-Check
 *
 * Runs a set of read-only checks against the org's billing configuration
 * and a sample of recent invoices to surface compliance gaps before the
 * user submits invoices to ZATCA. This is diagnostic only — no data is
 * mutated. The full phase-2 requirements (QR code, UBL XML, hash chain)
 * are checked as "pending implementation" when the underlying columns are
 * not yet present on the invoices table.
 */

export type ZatcaCheckStatus = "pass" | "warn" | "fail" | "pending";

export interface ZatcaCheckItem {
  id: string;
  status: ZatcaCheckStatus;
  /** Bilingual short titles */
  title_ar: string;
  title_en: string;
  /** Bilingual detail / remediation */
  detail_ar: string;
  detail_en: string;
  /** True if the app can auto-fix this (UI shows "Fix" button) */
  auto_fixable?: boolean;
}

export interface ZatcaCheckReport {
  ran_at: string;
  org_id: string;
  score: number; // 0-100
  summary: { pass: number; warn: number; fail: number; pending: number };
  items: ZatcaCheckItem[];
  sampled_invoices: number;
}

// Saudi VAT number format: 15 digits, starts with 3, 4th-from-end is fixed.
// Common validation: 15 digits total, starts with "3", 14th char is "3".
const VAT_PATTERN = /^3\d{13}3$/;

export const runZatcaSelfCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ZatcaCheckReport> => {
    const items: ZatcaCheckItem[] = [];

    // Fetch the company profile (there is typically one per org).
    const { data: company } = await context.supabase
      .from("companies")
      .select("id, legal_name, name, tax_id, address, email, phone")
      .eq("org_id", data.orgId)
      .is("deleted_at", null)
      .maybeSingle();

    // ------------- Check 1: Company legal name -------------
    items.push(
      company?.legal_name
        ? {
            id: "seller_legal_name",
            status: "pass",
            title_ar: "الاسم النظامي للمنشأة",
            title_en: "Seller legal name",
            detail_ar: `مسجّل: ${company.legal_name}`,
            detail_en: `Registered: ${company.legal_name}`,
          }
        : {
            id: "seller_legal_name",
            status: "fail",
            title_ar: "الاسم النظامي للمنشأة",
            title_en: "Seller legal name",
            detail_ar: "الاسم النظامي للمنشأة مطلوب في فاتورة ZATCA. أضفه من إعدادات الشركة.",
            detail_en: "Legal name is required on ZATCA invoices. Add it in company settings.",
          },
    );

    // ------------- Check 2: VAT number format -------------
    const vat = company?.tax_id?.trim() ?? "";
    if (!vat) {
      items.push({
        id: "vat_number_present",
        status: "fail",
        title_ar: "الرقم الضريبي",
        title_en: "VAT registration number",
        detail_ar: "الرقم الضريبي غير مسجّل. أضفه من إعدادات الشركة.",
        detail_en: "VAT number is missing. Add it in company settings.",
      });
    } else if (!VAT_PATTERN.test(vat)) {
      items.push({
        id: "vat_number_format",
        status: "fail",
        title_ar: "صيغة الرقم الضريبي",
        title_en: "VAT number format",
        detail_ar: `الرقم "${vat}" لا يطابق صيغة السعودية (15 رقمًا، يبدأ بـ3 وينتهي بـ3).`,
        detail_en: `"${vat}" does not match the Saudi VAT format (15 digits, starts and ends with 3).`,
      });
    } else {
      items.push({
        id: "vat_number_format",
        status: "pass",
        title_ar: "صيغة الرقم الضريبي",
        title_en: "VAT number format",
        detail_ar: `الرقم صحيح: ${vat}`,
        detail_en: `Format valid: ${vat}`,
      });
    }

    // ------------- Check 3: Seller address -------------
    items.push(
      company?.address
        ? {
            id: "seller_address",
            status: "pass",
            title_ar: "عنوان المنشأة",
            title_en: "Seller address",
            detail_ar: "العنوان مسجّل.",
            detail_en: "Address is on file.",
          }
        : {
            id: "seller_address",
            status: "warn",
            title_ar: "عنوان المنشأة",
            title_en: "Seller address",
            detail_ar: "عنوان المنشأة مطلوب لفواتير ZATCA phase-2. أضفه من إعدادات الشركة.",
            detail_en:
              "Seller address is required for ZATCA phase-2 invoices. Add it in company settings.",
          },
    );

    // ------------- Sample recent invoices -------------
    const { data: invoices } = await context.supabase
      .from("invoices")
      .select("id, number, subtotal, vat_rate, vat_amount, total, contact_id, status")
      .eq("org_id", data.orgId)
      .order("issue_date", { ascending: false })
      .limit(25);

    const sample = invoices ?? [];

    // ------------- Check 4: VAT rate = 15% -------------
    const wrongRate = sample.filter((i) => Number(i.vat_rate) !== 15);
    items.push(
      sample.length === 0
        ? {
            id: "vat_rate",
            status: "pending",
            title_ar: "نسبة ضريبة القيمة المضافة",
            title_en: "VAT rate on invoices",
            detail_ar: "لا توجد فواتير بعد. سيتم فحص النسبة عند إصدار أول فاتورة.",
            detail_en:
              "No invoices yet. The rate will be checked once the first invoice is issued.",
          }
        : wrongRate.length === 0
          ? {
              id: "vat_rate",
              status: "pass",
              title_ar: "نسبة ضريبة القيمة المضافة",
              title_en: "VAT rate on invoices",
              detail_ar: `جميع الفواتير الأخيرة (${sample.length}) بنسبة 15%.`,
              detail_en: `All recent invoices (${sample.length}) use 15%.`,
            }
          : {
              id: "vat_rate",
              status: "warn",
              title_ar: "نسبة ضريبة القيمة المضافة",
              title_en: "VAT rate on invoices",
              detail_ar: `${wrongRate.length} من ${sample.length} فواتير أخيرة بنسبة غير 15%.`,
              detail_en: `${wrongRate.length} of ${sample.length} recent invoices use a non-15% rate.`,
            },
    );

    // ------------- Check 5: total = subtotal + vat -------------
    const badMath = sample.filter((i) => {
      const expected = Number(i.subtotal) + Number(i.vat_amount);
      return Math.abs(expected - Number(i.total)) > 0.01;
    });
    items.push(
      sample.length === 0
        ? {
            id: "invoice_math",
            status: "pending",
            title_ar: "تدقيق حسابي للفواتير",
            title_en: "Invoice arithmetic",
            detail_ar: "لا توجد فواتير للتدقيق.",
            detail_en: "No invoices to verify yet.",
          }
        : badMath.length === 0
          ? {
              id: "invoice_math",
              status: "pass",
              title_ar: "تدقيق حسابي للفواتير",
              title_en: "Invoice arithmetic",
              detail_ar: `الإجماليات صحيحة في ${sample.length} فاتورة.`,
              detail_en: `Totals balance in all ${sample.length} sampled invoices.`,
            }
          : {
              id: "invoice_math",
              status: "fail",
              title_ar: "تدقيق حسابي للفواتير",
              title_en: "Invoice arithmetic",
              detail_ar: `${badMath.length} فاتورة إجماليها لا يساوي (الصافي + الضريبة). يمكن إصلاحها تلقائيًا.`,
              detail_en: `${badMath.length} invoices where total ≠ subtotal + VAT. Can be auto-fixed.`,
              auto_fixable: true,
            },
    );

    // ------------- Check 6: Buyer info on invoices -------------
    const missingBuyer = sample.filter((i) => !i.contact_id);
    items.push(
      sample.length === 0
        ? {
            id: "buyer_info",
            status: "pending",
            title_ar: "بيانات المشتري",
            title_en: "Buyer information",
            detail_ar: "لا توجد فواتير للتدقيق.",
            detail_en: "No invoices to verify yet.",
          }
        : missingBuyer.length === 0
          ? {
              id: "buyer_info",
              status: "pass",
              title_ar: "بيانات المشتري",
              title_en: "Buyer information",
              detail_ar: "كل الفواتير مرتبطة بجهة اتصال.",
              detail_en: "Every invoice is linked to a contact.",
            }
          : {
              id: "buyer_info",
              status: "warn",
              title_ar: "بيانات المشتري",
              title_en: "Buyer information",
              detail_ar: `${missingBuyer.length} فاتورة بدون جهة اتصال (مشتري) مرتبطة.`,
              detail_en: `${missingBuyer.length} invoices are missing a linked buyer contact.`,
            },
    );

    // ------------- Check 7: QR + UBL XML + hash chain (not yet implemented) -------------
    items.push({
      id: "qr_ubl_hash",
      status: "pending",
      title_ar: "رمز QR + UBL XML + سلسلة الهاش",
      title_en: "QR + UBL XML + hash chain",
      detail_ar:
        "توليد رمز QR (Base64) وملف UBL XML وسلسلة الهاش ليست مفعّلة بعد. مطلوبة قبل الاتصال الرسمي بـZATCA.",
      detail_en:
        "QR (Base64), UBL XML generation, and invoice hash chain are not yet implemented. Required before official ZATCA integration.",
    });

    const summary = { pass: 0, warn: 0, fail: 0, pending: 0 };
    for (const it of items) summary[it.status] += 1;

    // Score: pass = 1, warn = 0.5, fail = 0, pending = excluded from denominator
    const scored = items.filter((i) => i.status !== "pending");
    const raw = scored.reduce(
      (acc, i) => acc + (i.status === "pass" ? 1 : i.status === "warn" ? 0.5 : 0),
      0,
    );
    const score = scored.length === 0 ? 0 : Math.round((raw / scored.length) * 100);

    return {
      ran_at: new Date().toISOString(),
      org_id: data.orgId,
      score,
      summary,
      items,
      sampled_invoices: sample.length,
    };
  });

/**
 * Auto-fix invoice arithmetic: recompute `total = subtotal + vat_amount`.
 * Only touches invoices in draft status to avoid mutating anything already
 * submitted or paid.
 */
export const zatcaAutoFixInvoiceMath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: invoices, error } = await context.supabase
      .from("invoices")
      .select("id, subtotal, vat_amount, total, status")
      .eq("org_id", data.orgId)
      .in("status", ["draft"] as never);
    if (error) throw error;

    let fixed = 0;
    for (const inv of invoices ?? []) {
      const expected = Number(inv.subtotal) + Number(inv.vat_amount);
      if (Math.abs(expected - Number(inv.total)) > 0.01) {
        const { error: upErr } = await context.supabase
          .from("invoices")
          .update({ total: expected })
          .eq("id", inv.id);
        if (!upErr) fixed += 1;
      }
    }
    return { fixed };
  });
