import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorContent, getUserOrgId, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_expense_claim",
  title: "Create expense claim",
  description:
    "Create a new expense claim (submitted) for the signed-in user's company. Captures amount, currency, expense date, merchant, category, notes, and an optional uploaded receipt URL. The claim number is generated automatically. Enters status 'submitted' immediately unless `as_draft` is true.",
  inputSchema: {
    amount: z.number().positive().max(10_000_000).describe("Amount in the given currency."),
    currency: z
      .string()
      .trim()
      .length(3)
      .toUpperCase()
      .default("SAR")
      .describe("ISO 4217 currency code, e.g. SAR."),
    expense_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .describe("Date the expense was incurred (YYYY-MM-DD)."),
    merchant: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .describe("Merchant / vendor name."),
    category: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .describe("Expense category (e.g. travel, fuel, maintenance, office)."),
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Free-form notes describing the expense."),
    receipt_url: z
      .string()
      .url()
      .max(2000)
      .optional()
      .describe(
        "URL of the uploaded receipt file. Use the app's receipt upload flow to get a signed or public URL first.",
      ),
    as_draft: z
      .boolean()
      .default(false)
      .describe("Save as draft instead of submitting for approval."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async (
    { amount, currency, expense_date, merchant, category, notes, receipt_url, as_draft },
    ctx,
  ) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const userId = ctx.getUserId();
    if (!userId) return errorContent("Missing user id in token");
    const { orgId, error: orgErr } = await getUserOrgId(ctx);
    if (orgErr) return errorContent(orgErr);
    if (!orgId) return errorContent("No active company for this user");

    const title = `${merchant} — ${expense_date}`.slice(0, 200);
    const descriptionParts = [
      `Merchant: ${merchant}`,
      `Expense date: ${expense_date}`,
    ];
    if (notes) descriptionParts.push(`Notes: ${notes}`);
    const description = descriptionParts.join("\n");

    const nowIso = new Date().toISOString();
    const sb = supabaseForUser(ctx);
    const { data: row, error } = await sb
      .from("expense_claims")
      .insert({
        org_id: orgId,
        title,
        amount,
        currency,
        category: category ?? null,
        description,
        receipt_url: receipt_url ?? null,
        submitted_by: userId,
        submitted_at: as_draft ? null : nowIso,
        status: as_draft ? "draft" : "submitted",
        // claim_number is filled by the DB trigger.
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
          text: `Created expense claim ${row.claim_number ?? row.id} (${row.status}).\n${JSON.stringify(row, null, 2)}`,
        },
      ],
      structuredContent: { claim: row },
    };
  },
});
