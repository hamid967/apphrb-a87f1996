import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorContent, getUserOrgId, supabaseForUser } from "../supabase";

/**
 * Vision-OCR helper: sends the receipt image to the Lovable AI Gateway and
 * asks the model to return a strict JSON object with the fields we need to
 * create an expense claim. Any missing field comes back as null.
 */
async function extractReceiptFields(imageUrl: string): Promise<
  | {
      ok: true;
      data: {
        amount: number | null;
        currency: string | null;
        expense_date: string | null;
        merchant: string | null;
        category: string | null;
        notes: string | null;
      };
    }
  | { ok: false; error: string }
> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "Missing LOVABLE_API_KEY on server" };

  const system =
    "You extract structured fields from a receipt image for an expense claim. " +
    "Return ONLY a compact JSON object with these keys: amount (number, total paid), " +
    "currency (ISO 4217 like SAR, USD, EUR — infer from the receipt; default SAR if unclear), " +
    "expense_date (YYYY-MM-DD), merchant (short vendor name), " +
    "category (one of: travel, fuel, meals, office, maintenance, utilities, software, other), " +
    "notes (one short line summarising items). Use null for any field you cannot read confidently. " +
    "Do not include any text outside the JSON.";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the expense fields from this receipt." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `OCR failed (${res.status}): ${body.slice(0, 300)}` };
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Some models wrap JSON in ```json fences — strip and retry.
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: `Model did not return JSON: ${raw.slice(0, 200)}` };
    }
  }

  const toNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/[^\d.\-]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const toStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;

  return {
    ok: true,
    data: {
      amount: toNum(parsed.amount),
      currency: toStr(parsed.currency)?.toUpperCase().slice(0, 3) ?? null,
      expense_date: toStr(parsed.expense_date),
      merchant: toStr(parsed.merchant),
      category: toStr(parsed.category),
      notes: toStr(parsed.notes),
    },
  };
}

export default defineTool({
  name: "create_expense_claim_from_receipt",
  title: "Create expense claim from receipt (OCR)",
  description:
    "Upload a receipt image (as an https URL or a data:image/...;base64,... URL) and this tool will run OCR via the app's vision model, extract the amount, currency, date, merchant, category, and notes, then create a submitted expense claim for the signed-in user's company. Fields you pass explicitly override anything OCR extracts. If OCR cannot read a required field and no override is given, the tool returns the OCR draft without creating the claim so the caller can confirm the missing values.",
  inputSchema: {
    receipt_url: z
      .string()
      .url()
      .max(4000)
      .describe(
        "URL of the receipt image. Accepts an https URL or a data URL (data:image/png;base64,...).",
      ),
    amount: z
      .number()
      .positive()
      .max(10_000_000)
      .optional()
      .describe("Override the amount OCR extracted."),
    currency: z
      .string()
      .trim()
      .length(3)
      .toUpperCase()
      .optional()
      .describe("Override the currency (ISO 4217, e.g. SAR)."),
    expense_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional()
      .describe("Override the expense date."),
    merchant: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .describe("Override the merchant name."),
    category: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe("Override the expense category."),
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Override the notes / description."),
    as_draft: z
      .boolean()
      .default(false)
      .describe("Save as draft instead of submitting for approval."),
    dry_run: z
      .boolean()
      .default(false)
      .describe("Run OCR only and return the extracted fields without creating a claim."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const userId = ctx.getUserId();
    if (!userId) return errorContent("Missing user id in token");

    const ocr = await extractReceiptFields(input.receipt_url);
    if (!ocr.ok) return errorContent(ocr.error);

    const merged = {
      amount: input.amount ?? ocr.data.amount ?? null,
      currency: (input.currency ?? ocr.data.currency ?? "SAR").toUpperCase(),
      expense_date: input.expense_date ?? ocr.data.expense_date ?? null,
      merchant: input.merchant ?? ocr.data.merchant ?? null,
      category: input.category ?? ocr.data.category ?? null,
      notes: input.notes ?? ocr.data.notes ?? null,
    };

    if (input.dry_run) {
      return {
        content: [
          {
            type: "text",
            text: `OCR draft (no claim created).\n${JSON.stringify({ extracted: ocr.data, merged }, null, 2)}`,
          },
        ],
        structuredContent: { dry_run: true, extracted: ocr.data, merged },
      };
    }

    // Require the fields the DB needs; report back the OCR draft otherwise so
    // the assistant can ask the user to fill in the gaps.
    const missing: string[] = [];
    if (merged.amount == null || merged.amount <= 0) missing.push("amount");
    if (!merged.expense_date) missing.push("expense_date");
    if (!merged.merchant) missing.push("merchant");
    if (missing.length > 0) {
      return {
        content: [
          {
            type: "text",
            text:
              `OCR could not read required field(s): ${missing.join(", ")}. ` +
              `Ask the user to supply them, then call this tool again with the values.\n` +
              JSON.stringify({ extracted: ocr.data, merged, missing }, null, 2),
          },
        ],
        structuredContent: { needs_confirmation: true, extracted: ocr.data, merged, missing },
        isError: true,
      };
    }

    const { orgId, error: orgErr } = await getUserOrgId(ctx);
    if (orgErr) return errorContent(orgErr);
    if (!orgId) return errorContent("No active company for this user");

    const title = `${merged.merchant} — ${merged.expense_date}`.slice(0, 200);
    const descriptionParts = [
      `Merchant: ${merged.merchant}`,
      `Expense date: ${merged.expense_date}`,
      "Source: receipt OCR (create_expense_claim_from_receipt)",
    ];
    if (merged.notes) descriptionParts.push(`Notes: ${merged.notes}`);
    const description = descriptionParts.join("\n");

    const nowIso = new Date().toISOString();
    const sb = supabaseForUser(ctx);
    const { data: row, error } = await sb
      .from("expense_claims")
      .insert({
        org_id: orgId,
        title,
        amount: merged.amount,
        currency: merged.currency,
        category: merged.category ?? null,
        description,
        receipt_url: input.receipt_url,
        submitted_by: userId,
        submitted_at: input.as_draft ? null : nowIso,
        status: input.as_draft ? "draft" : "submitted",
        claim_number: "",
      })
      .select(
        "id, claim_number, status, amount, currency, category, receipt_url, submitted_at, created_at",
      )
      .single();

    if (error) return errorContent(error.message);

    return {
      content: [
        {
          type: "text",
          text: `Created expense claim ${row.claim_number ?? row.id} (${row.status}) from receipt OCR.\n${JSON.stringify({ claim: row, extracted: ocr.data, merged }, null, 2)}`,
        },
      ],
      structuredContent: { claim: row, extracted: ocr.data, merged },
    };
  },
});
