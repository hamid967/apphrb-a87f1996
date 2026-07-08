import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueNotification } from "@/lib/notifications.functions";

/**
 * Server-side OCR: given a receipt already uploaded to the `receipts`
 * bucket under the caller's own folder, download it, send it to the
 * Lovable AI Gateway (Gemini multimodal), and return best-guess
 * {amount, currency, merchant, date}. Any field the model cannot read
 * confidently is returned as null so the UI can leave it blank.
 */
const ocrInputSchema = z.object({
  path: z.string().trim().min(1).max(500),
});

export type ReceiptExtraction = {
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  date: string | null; // ISO YYYY-MM-DD
};

export const extractReceiptDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof ocrInputSchema>) => ocrInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<ReceiptExtraction> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { supabase } = context;
    const { data: blob, error } = await supabase.storage.from("receipts").download(data.path);
    if (error || !blob) throw error ?? new Error("receipt_not_found");

    // Send images and PDFs alike. PDFs are handled by Gemini as documents.
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = blob.type || "image/jpeg";

    // Dynamic imports keep the .server helper and the AI SDK out of
    // client-reachable bundles when this module is statically imported.
    const [{ createLovableAiGatewayProvider }, { generateText, Output }] = await Promise.all([
      import("@/lib/ai-gateway.server"),
      import("ai"),
    ]);

    const gateway = createLovableAiGatewayProvider(key);

    // Keep the schema minimal — no bounds, no enums — so Gemini accepts it
    // and post-hoc validation cannot crash on optional fields.
    const schema = z.object({
      amount: z.number().nullable(),
      currency: z.string().nullable(),
      merchant: z.string().nullable(),
      date: z.string().nullable(),
    });

    try {
      const { output: extracted } = await generateText({
        model: gateway("google/gemini-2.5-flash"),
        output: Output.object({ schema }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Extract the following from this receipt: " +
                  "amount (grand total as a plain number, no currency), " +
                  "currency (ISO code such as SAR, USD, EUR), " +
                  "merchant (short business name), " +
                  "date (issue date as YYYY-MM-DD). " +
                  "Use null for any field you cannot read confidently. " +
                  "Return JSON only.",
              },
              { type: "image", image: bytes, mediaType: mime },
            ],
          },
        ],
      });

      // Normalize/guard: clamp numbers, tidy strings, validate date.
      const amount =
        typeof extracted?.amount === "number" &&
        Number.isFinite(extracted.amount) &&
        extracted.amount > 0
          ? Math.round(extracted.amount * 100) / 100
          : null;
      const currency =
        typeof extracted?.currency === "string" && /^[A-Za-z]{3}$/.test(extracted.currency.trim())
          ? extracted.currency.trim().toUpperCase()
          : null;
      const merchant =
        typeof extracted?.merchant === "string" && extracted.merchant.trim().length > 0
          ? extracted.merchant.trim().slice(0, 120)
          : null;
      const date =
        typeof extracted?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(extracted.date.trim())
          ? extracted.date.trim()
          : null;

      return { amount, currency, merchant, date };
    } catch (err) {
      // OCR is best-effort — never block the form. Return an empty
      // extraction so the UI just skips prefill.
      console.error("[extractReceiptDetails] gateway error", err);
      return { amount: null, currency: null, merchant: null, date: null };
    }
  });

const submitSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  amount: z.number().positive().max(10_000_000),
  category: z.string().trim().min(1).max(40),
  description: z.string().trim().max(2000).optional().nullable(),
  receipt_url: z.string().trim().max(500).optional().nullable(),
  currency: z.string().trim().length(3).default("SAR"),
  batch_id: z.string().uuid().optional().nullable(),
});

export const submitExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof submitSchema>) => submitSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // When a claim is attached to a draft batch, keep it as a draft line item
    // so the batch — not this individual claim — owns the approval workflow.
    let claimStatus: "submitted" | "draft" = "submitted";
    let submittedAt: string | null = new Date().toISOString();
    if (data.batch_id) {
      const { data: batch, error: bErr } = await supabase
        .from("expense_batches")
        .select("id, status, submitted_by")
        .eq("id", data.batch_id)
        .maybeSingle();
      if (bErr) throw bErr;
      if (!batch) throw new Error("batch_not_found");
      if (batch.submitted_by !== userId) throw new Error("not_batch_owner");
      if (batch.status === "draft" || batch.status === "rejected") {
        claimStatus = "draft";
        submittedAt = null;
      }
    }
    const { data: row, error } = await supabase
      .from("expense_claims")
      .insert({
        org_id: data.org_id,
        title: data.title,
        amount: data.amount,
        currency: data.currency,
        category: data.category,
        description: data.description ?? null,
        receipt_url: data.receipt_url ?? null,
        submitted_by: userId,
        submitted_at: submittedAt,
        status: claimStatus,
        batch_id: data.batch_id ?? null,
        // claim_number is filled by the DB trigger.
        claim_number: "",
      })
      .select("id, claim_number, status, submitted_at")
      .single();
    if (error) throw error;

    // Confirm submission to the owner only when the claim actually leaves draft.
    if (row && claimStatus === "submitted") {
      try {
        await enqueueNotification({
          data: {
            org_id: data.org_id,
            channel: "email",
            template: "expense_claim_submitted",
            event_key: "expense_claim_submitted",
            recipient_user_id: userId,
            idempotency_key: `expense_claim_submitted:${row.id}`,
            variables: {
              claim_number: row.claim_number ?? "",
              title: data.title,
              amount: data.amount,
              currency: data.currency,
              status: row.status ?? "submitted",
              reference_type: "expense_claim",
              reference_id: row.id,
            },
            dispatch_now: false,
          },
        });
      } catch {
        /* notification failures must not block submission */
      }
    }
    return row;
  });

const uploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  content_type: z.string().trim().min(1).max(120),
});

/**
 * Returns a signed upload URL under the caller's own folder so the storage
 * RLS policy `receipts user upload` (auth.uid()/...) accepts it.
 */
export const createReceiptUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof uploadUrlSchema>) => uploadUrlSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const safe = data.filename.replace(/[^\w.\-]/g, "_").slice(-120);
    const path = `${userId}/${Date.now()}-${safe}`;
    const { data: signed, error } = await supabase.storage
      .from("receipts")
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

const listMineSchema = z.object({
  org_id: z.string().uuid(),
  limit: z.number().int().min(1).max(50).optional().default(25),
});

/**
 * Returns the caller's own recent claims within an org so they can pick the
 * original claim to correct. RLS scopes reads to the current user/org.
 */
export const listMyRecentClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof listMineSchema>) => listMineSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("expense_claims")
      .select(
        "id, claim_number, title, amount, currency, category, status, receipt_url, description, submitted_at, created_at, original_claim_id, correction_reason",
      )
      .eq("org_id", data.org_id)
      .eq("submitted_by", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

const correctSchema = z.object({
  org_id: z.string().uuid(),
  original_claim_id: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  amount: z.number().positive().max(10_000_000),
  category: z.string().trim().min(1).max(40),
  correction_reason: z.string().trim().min(4).max(1000),
  description: z.string().trim().max(2000).optional().nullable(),
  receipt_url: z.string().trim().max(500).optional().nullable(),
  currency: z.string().trim().length(3).default("SAR"),
});

/**
 * Pure implementation used by both the server-fn handler and tests.
 * Kept side-effect-free (aside from the injected `supabase` client) so it
 * can be exercised without the TanStack Start runtime.
 */
// deno-lint-ignore no-explicit-any
export type CorrectionInput = z.infer<typeof correctSchema>;

export async function submitCorrectedExpenseClaimImpl(
  supabase: any,
  userId: string,
  data: CorrectionInput,
) {
  const { data: orig, error: origErr } = await supabase
    .from("expense_claims")
    .select("id, org_id, submitted_by")
    .eq("id", data.original_claim_id)
    .maybeSingle();
  if (origErr) throw origErr;
  if (!orig) throw new Error("original_not_found");
  if (orig.org_id !== data.org_id) throw new Error("org_mismatch");
  if (orig.submitted_by && orig.submitted_by !== userId) throw new Error("not_owner");

  const { data: row, error } = await supabase
    .from("expense_claims")
    .insert({
      org_id: data.org_id,
      title: data.title,
      amount: data.amount,
      currency: data.currency,
      category: data.category,
      description: data.description ?? null,
      receipt_url: data.receipt_url ?? null,
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
      status: "corrected",
      original_claim_id: data.original_claim_id,
      correction_reason: data.correction_reason,
      claim_number: "",
    })
    .select("id, claim_number, status, submitted_at, original_claim_id")
    .single();
  if (error) throw error;
  return row;
}

export const correctionSchema = correctSchema;

/**
 * Files a correction against a previously-submitted claim. The new record is
 * stored with status = 'corrected' and links back to the original claim.
 */
export const submitCorrectedExpenseClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof correctSchema>) => correctSchema.parse(data))
  .handler(async ({ data, context }) => {
    const row = await submitCorrectedExpenseClaimImpl(context.supabase, context.userId, data);
    if (row) {
      try {
        await enqueueNotification({
          data: {
            org_id: data.org_id,
            channel: "email",
            template: "expense_claim_corrected",
            event_key: "expense_claim_corrected",
            recipient_user_id: context.userId,
            idempotency_key: `expense_claim_corrected:${row.id}`,
            variables: {
              claim_number: row.claim_number ?? "",
              title: data.title,
              amount: data.amount,
              currency: data.currency,
              correction_reason: data.correction_reason,
              reference_type: "expense_claim_correction",
              reference_id: row.id,
              original_claim_id: row.original_claim_id ?? "",
            },
            dispatch_now: false,
          },
        });
      } catch {
        /* notification failures must not block correction */
      }
    }
    return row;
  });
