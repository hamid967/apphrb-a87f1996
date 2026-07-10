import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorContent, getUserOrgId, supabaseForUser } from "../supabase";

// Open/pending statuses per table
const OPEN_STATUSES: Record<string, string[]> = {
  support: ["new", "open", "pending", "in_progress", "waiting"],
  maintenance: ["new", "open", "assigned", "in_progress", "scheduled", "pending"],
  expense_claim: ["submitted", "under_review", "pending", "pending_approval"],
};

export default defineTool({
  name: "list_pending_tickets",
  title: "List pending tickets & claims",
  description:
    "List pending items for the signed-in user's company: support tickets, maintenance tickets, or expense claims. Filter by explicit status or by submission date (since ISO date). Defaults to open statuses. Optional `mine_only` limits to items submitted by or assigned to the signed-in user.",
  inputSchema: {
    type: z
      .enum(["support", "maintenance", "expense_claim"])
      .default("support")
      .describe("Which list to query."),
    status: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .optional()
      .describe("Filter by a single status value. Omit to include all open statuses."),
    since: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Only include items created at or after this ISO-8601 timestamp."),
    until: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Only include items created before this ISO-8601 timestamp."),
    mine_only: z
      .boolean()
      .default(false)
      .describe("Restrict to items owned by the signed-in user (requester/submitter/assignee)."),
    limit: z.number().int().min(1).max(100).default(20).describe("Max rows to return (1-100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ type, status, since, until, mine_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);
    if (!orgId) return errorContent("No active company for this user");

    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    let q;
    if (type === "support") {
      q = sb
        .from("tickets")
        .select(
          "id, ticket_number, subject, status, priority, category, channel, requester_id, assignee_id, sla_due_at, created_at",
        )
        .eq("org_id", orgId)
        .is("deleted_at", null);
      if (mine_only && userId) q = q.or(`requester_id.eq.${userId},assignee_id.eq.${userId}`);
    } else if (type === "maintenance") {
      q = sb
        .from("maintenance_tickets")
        .select(
          "id, ticket_no, title, status, priority, property_id, technician_id, scheduled_at, cost, currency, created_at",
        )
        .eq("org_id", orgId);
      if (mine_only && userId) q = q.eq("created_by", userId);
    } else {
      q = sb
        .from("expense_claims")
        .select(
          "id, claim_number, title, status, category, amount, currency, submitted_by, submitted_at, created_at",
        )
        .eq("org_id", orgId)
        .is("deleted_at", null);
      if (mine_only && userId) q = q.eq("submitted_by", userId);
    }

    if (status) q = q.eq("status", status);
    else q = q.in("status", OPEN_STATUSES[type]);
    if (since) q = q.gte("created_at", since);
    if (until) q = q.lt("created_at", until);

    q = q.order("created_at", { ascending: false }).limit(limit);

    const { data, error: qErr } = await q;
    if (qErr) return errorContent(qErr.message);

    const rows = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: `Found ${rows.length} ${type} item(s).\n${JSON.stringify(rows, null, 2)}`,
        },
      ],
      structuredContent: { type, count: rows.length, items: rows },
    };
  },
});
