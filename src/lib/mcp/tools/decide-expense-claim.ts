import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorContent, supabaseForUser } from "../supabase";

export default defineTool({
  name: "decide_expense_claim",
  title: "Approve or reject an expense claim",
  description:
    "Approve or reject a single expense claim as the signed-in reviewer. Records the decision, decision note, reviewer id, and decision timestamp. Only users authorized by RLS (org owner/admin or app admin/super_admin) can decide; other callers get a permission error. Rejection requires a reason.",
  inputSchema: {
    claim_id: z.string().uuid().describe("The expense claim id to decide."),
    decision: z.enum(["approve", "reject"]).describe("Decision to record."),
    note: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .optional()
      .describe("Decision note. Required when rejecting; recommended when approving."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: async ({ claim_id, decision, note }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    if (decision === "reject" && !note) {
      return errorContent("A rejection reason is required when rejecting a claim.");
    }
    const userId = ctx.getUserId();
    if (!userId) return errorContent("Missing user id in token");

    const sb = supabaseForUser(ctx);

    const { data: existing, error: readErr } = await sb
      .from("expense_claims")
      .select("id, org_id, status")
      .eq("id", claim_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (readErr) return errorContent(readErr.message);
    if (!existing) return errorContent("Claim not found or not accessible");
    if (existing.status !== "submitted" && existing.status !== "in_review") {
      return errorContent(
        `Claim is in status '${existing.status}' and cannot be decided. Only 'submitted' or 'in_review' claims can be approved or rejected.`,
      );
    }

    const now = new Date().toISOString();
    const patch =
      decision === "approve"
        ? {
            status: "approved" as const,
            reviewed_by: userId,
            reviewed_at: now,
            approved_at: now,
            rejection_reason: note ?? null,
          }
        : {
            status: "rejected" as const,
            reviewed_by: userId,
            reviewed_at: now,
            rejection_reason: note!,
          };

    const { data: updated, error: upErr } = await sb
      .from("expense_claims")
      .update(patch)
      .eq("id", claim_id)
      .select(
        "id, claim_number, status, amount, currency, reviewed_by, reviewed_at, approved_at, rejection_reason",
      )
      .maybeSingle();
    if (upErr) return errorContent(upErr.message);
    if (!updated) {
      return errorContent("You are not authorized to decide this claim (RLS denied the update).");
    }

    return {
      content: [
        {
          type: "text",
          text: `Claim ${updated.claim_number ?? updated.id} ${decision === "approve" ? "approved" : "rejected"}.\n${JSON.stringify(updated, null, 2)}`,
        },
      ],
      structuredContent: { decision, claim: updated },
    };
  },
});
