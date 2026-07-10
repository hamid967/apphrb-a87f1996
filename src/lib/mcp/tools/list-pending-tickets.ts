import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  buildListResponse,
  errorContent,
  escapeIlike,
  getUserOrgId,
  listInputShape,
  supabaseForUser,
} from "../supabase";

const OPEN_STATUSES: Record<string, string[]> = {
  support: ["new", "open", "pending", "in_progress", "waiting"],
  maintenance: ["new", "open", "assigned", "in_progress", "scheduled", "pending"],
  expense_claim: ["submitted", "under_review", "pending", "pending_approval"],
};

export default defineTool({
  name: "list_pending_tickets",
  title: "List pending tickets & claims",
  description:
    "List pending items for the signed-in user's company: support tickets, maintenance tickets, or expense claims. Supports text search over title/subject/number, pagination, filter by status or submission-date window, and `mine_only`. Returns a unified {id, title, subtitle, status, date} shape.",
  inputSchema: {
    ...listInputShape,
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
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ q, page, page_size, type, status, since, until, mine_only }, ctx) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);
    if (!orgId) return errorContent("No active company for this user");

    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    let qb;
    if (type === "support") {
      qb = sb
        .from("tickets")
        .select(
          "id, ticket_number, subject, status, priority, category, channel, requester_id, assignee_id, sla_due_at, created_at",
          { count: "exact" },
        )
        .eq("org_id", orgId)
        .is("deleted_at", null);
      if (mine_only && userId) qb = qb.or(`requester_id.eq.${userId},assignee_id.eq.${userId}`);
      if (q) {
        const s = escapeIlike(q);
        qb = qb.or(`subject.ilike.%${s}%,ticket_number.ilike.%${s}%`);
      }
    } else if (type === "maintenance") {
      qb = sb
        .from("maintenance_tickets")
        .select(
          "id, ticket_no, title, status, priority, property_id, technician_id, scheduled_at, cost, currency, created_at",
          { count: "exact" },
        )
        .eq("org_id", orgId);
      if (mine_only && userId) qb = qb.eq("created_by", userId);
      if (q) {
        const s = escapeIlike(q);
        qb = qb.or(`title.ilike.%${s}%,ticket_no.ilike.%${s}%`);
      }
    } else {
      qb = sb
        .from("expense_claims")
        .select(
          "id, claim_number, title, status, category, amount, currency, submitted_by, submitted_at, created_at",
          { count: "exact" },
        )
        .eq("org_id", orgId)
        .is("deleted_at", null);
      if (mine_only && userId) qb = qb.eq("submitted_by", userId);
      if (q) {
        const s = escapeIlike(q);
        qb = qb.or(`title.ilike.%${s}%,claim_number.ilike.%${s}%`);
      }
    }

    if (status) qb = qb.eq("status", status);
    else qb = qb.in("status", OPEN_STATUSES[type]);
    if (since) qb = qb.gte("created_at", since);
    if (until) qb = qb.lt("created_at", until);
    qb = qb.order("created_at", { ascending: false }).range(from, to);

    const { data, error: qErr, count } = await qb;
    if (qErr) return errorContent(qErr.message);

    return buildListResponse(
      `${type} items`,
      (data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>,
      { q, page, page_size },
      count ?? null,
      (row) => {
        if (type === "support") {
          return {
            id: String(row.id),
            title: (row.subject as string) ?? (row.ticket_number as string) ?? String(row.id),
            subtitle: [row.ticket_number, row.category].filter(Boolean).join(" · ") || null,
            status: (row.status as string) ?? null,
            date: (row.created_at as string) ?? null,
            meta: { priority: row.priority, sla_due_at: row.sla_due_at, channel: row.channel },
          };
        }
        if (type === "maintenance") {
          return {
            id: String(row.id),
            title: (row.title as string) ?? (row.ticket_no as string) ?? String(row.id),
            subtitle: (row.ticket_no as string) ?? null,
            status: (row.status as string) ?? null,
            date: (row.created_at as string) ?? null,
            meta: {
              priority: row.priority,
              scheduled_at: row.scheduled_at,
              property_id: row.property_id,
            },
          };
        }
        return {
          id: String(row.id),
          title: (row.title as string) ?? (row.claim_number as string) ?? String(row.id),
          subtitle: [row.claim_number, row.category].filter(Boolean).join(" · ") || null,
          status: (row.status as string) ?? null,
          date: (row.submitted_at as string) ?? (row.created_at as string) ?? null,
          meta: { amount: row.amount, currency: row.currency },
        };
      },
    );
  },
});
