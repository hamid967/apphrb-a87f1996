/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PdfDocumentType, PdfTemplateKey } from "./document-types";

const documentType = z.enum([
  "simplified_tax_invoice",
  "receipt_voucher",
  "payment_voucher",
  "property_performance_report",
  "tenant_statement",
  "personal_expense_statement",
  "maintenance_report",
]);

const templateKey = z.enum(["official", "modern", "luxury", "simple"]);

export const recordPdfExportLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        document_type: documentType,
        template_key: templateKey,
        source_id: z.string().uuid().optional().nullable(),
        settings: z.record(z.string(), z.unknown()).optional().default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      org_id: data.org_id,
      document_type: data.document_type as PdfDocumentType,
      template_key: data.template_key as PdfTemplateKey,
      source_id: data.source_id ?? null,
      settings: data.settings,
      exported_by: context.userId,
      created_by: context.userId,
    };

    const { error } = await (context.supabase as any).from("export_logs").insert(payload);
    if (!error) return { ok: true, skipped: false };

    if (
      String(error.message ?? "")
        .toLowerCase()
        .includes("export_logs")
    ) {
      return { ok: true, skipped: true, reason: "export_logs table is not available" };
    }

    throw error;
  });
