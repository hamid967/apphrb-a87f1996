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

type TicketType = "support" | "maintenance" | "expense_claim";

const OPEN_STATUSES: Record<TicketType, string[]> = {
  support: ["new", "open", "pending", "in_progress", "waiting"],
  maintenance: ["new", "open", "assigned", "in_progress", "scheduled", "pending"],
  expense_claim: ["submitted", "under_review", "pending", "pending_approval"],
};

// ---------- Per-type row shapes (mirror the columns we SELECT) ----------

type SupportRow = {
  id: string;
  ticket_number: string | null;
  subject: string | null;
  status: string | null;
  priority: string | null;
  category: string | null;
  channel: string | null;
  requester_id: string | null;
  assignee_id: string | null;
  sla_due_at: string | null;
  created_at: string | null;
};

type MaintenanceRow = {
  id: string;
  ticket_no: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  property_id: string | null;
  technician_id: string | null;
  scheduled_at: string | null;
  cost: number | null;
  currency: string | null;
  created_at: string | null;
};

type ExpenseClaimRow = {
  id: string;
  claim_number: string | null;
  title: string | null;
  status: string | null;
  category: string | null;
  amount: number | null;
  currency: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

type UnifiedEssentials = {
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  date: string | null;
  meta: Record<string, unknown>;
};

// ---------- Unified mappers: one per type ----------

const mapSupport = (row: SupportRow): UnifiedEssentials => ({
  id: String(row.id),
  title: row.subject ?? row.ticket_number ?? String(row.id),
  subtitle: [row.ticket_number, row.category].filter(Boolean).join(" · ") || null,
  status: row.status,
  date: row.created_at,
  meta: {
    priority: row.priority,
    sla_due_at: row.sla_due_at,
    channel: row.channel,
    assignee_id: row.assignee_id,
    requester_id: row.requester_id,
  },
});

const mapMaintenance = (row: MaintenanceRow): UnifiedEssentials => ({
  id: String(row.id),
  title: row.title ?? row.ticket_no ?? String(row.id),
  subtitle: [row.ticket_no, row.priority].filter(Boolean).join(" · ") || null,
  status: row.status,
  date: row.created_at,
  meta: {
    priority: row.priority,
    scheduled_at: row.scheduled_at,
    property_id: row.property_id,
    technician_id: row.technician_id,
    cost: row.cost,
    currency: row.currency,
  },
});

const mapExpenseClaim = (row: ExpenseClaimRow): UnifiedEssentials => ({
  id: String(row.id),
  title: row.title ?? row.claim_number ?? String(row.id),
  subtitle: [row.claim_number, row.category].filter(Boolean).join(" · ") || null,
  status: row.status,
  date: row.submitted_at ?? row.created_at,
  meta: {
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    submitted_by: row.submitted_by,
    submitted_at: row.submitted_at,
  },
});

export default defineTool({
  name: "list_pending_tickets",
  title: "List pending tickets & claims",
  description:
    "List pending items for the signed-in user's company: support tickets, maintenance tickets, or expense claims. Supports text search, pagination, status filter, submission-date window, and `mine_only`. Returns a unified {id, title, subtitle, status, date, meta} shape.",
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
      .describe(
        "Restrict to items owned by the signed-in user. Shortcut for setting requester_id=me OR assignee_id=me.",
      ),
    requester_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Filter by the requester/submitter/creator (support: requester_id, maintenance: created_by, expense_claim: submitted_by).",
      ),
    assignee_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Filter by the assignee/reviewer (support: assignee_id, maintenance: technician_id, expense_claim: reviewed_by).",
      ),
    sort: z
      .enum(["created_at", "status"])
      .default("created_at")
      .describe("Column to sort by. Combined with the shared `order` (asc/desc)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    {
      q,
      page,
      page_size,
      type,
      status,
      since,
      until,
      mine_only,
      requester_id,
      assignee_id,
      sort,
      order,
    },
    ctx,
  ) => {
    if (!ctx.isAuthenticated()) return errorContent("Not authenticated");
    const { orgId, error } = await getUserOrgId(ctx);
    if (error) return errorContent(error);
    if (!orgId) return errorContent("No active company for this user");

    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const from = (page - 1) * page_size;
    const to = from + page_size - 1;
    const t = type as TicketType;
    const statuses = status ? [status] : OPEN_STATUSES[t];
    const s = q ? escapeIlike(q) : null;
    const ascending = order === "asc";

    // Per-type column mapping for the unified requester/assignee filters.
    const cols: Record<TicketType, { requester: string; assignee: string }> = {
      support: { requester: "requester_id", assignee: "assignee_id" },
      maintenance: { requester: "created_by", assignee: "technician_id" },
      expense_claim: { requester: "submitted_by", assignee: "reviewed_by" },
    };
    const { requester: requesterCol, assignee: assigneeCol } = cols[t];

    if (t === "support") {
      let qb = sb
        .from("tickets")
        .select(
          "id, ticket_number, subject, status, priority, category, channel, requester_id, assignee_id, sla_due_at, created_at",
          { count: "exact" },
        )
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .in("status", statuses);
      if (mine_only && userId)
        qb = qb.or(`${requesterCol}.eq.${userId},${assigneeCol}.eq.${userId}`);
      if (requester_id) qb = qb.eq(requesterCol, requester_id);
      if (assignee_id) qb = qb.eq(assigneeCol, assignee_id);
      if (s) qb = qb.or(`subject.ilike.%${s}%,ticket_number.ilike.%${s}%`);
      if (since) qb = qb.gte("created_at", since);
      if (until) qb = qb.lt("created_at", until);
      const { data, error: qErr, count } = await qb
        .order(sort, { ascending })
        .range(from, to);
      if (qErr) return errorContent(qErr.message);
      return buildListResponse<SupportRow>(
        "support tickets",
        (data ?? []) as SupportRow[],
        { q, page, page_size },
        count ?? null,
        mapSupport,
      );
    }

    if (t === "maintenance") {
      let qb = sb
        .from("maintenance_tickets")
        .select(
          "id, ticket_no, title, status, priority, property_id, technician_id, scheduled_at, cost, currency, created_at",
          { count: "exact" },
        )
        .eq("org_id", orgId)
        .in("status", statuses);
      if (mine_only && userId)
        qb = qb.or(`${requesterCol}.eq.${userId},${assigneeCol}.eq.${userId}`);
      if (requester_id) qb = qb.eq(requesterCol, requester_id);
      if (assignee_id) qb = qb.eq(assigneeCol, assignee_id);
      if (s) qb = qb.or(`title.ilike.%${s}%,ticket_no.ilike.%${s}%`);
      if (since) qb = qb.gte("created_at", since);
      if (until) qb = qb.lt("created_at", until);
      const { data, error: qErr, count } = await qb
        .order(sort, { ascending })
        .range(from, to);
      if (qErr) return errorContent(qErr.message);
      return buildListResponse<MaintenanceRow>(
        "maintenance tickets",
        (data ?? []) as MaintenanceRow[],
        { q, page, page_size },
        count ?? null,
        mapMaintenance,
      );
    }

    // expense_claim
    let qb = sb
      .from("expense_claims")
      .select(
        "id, claim_number, title, status, category, amount, currency, submitted_by, submitted_at, created_at",
        { count: "exact" },
      )
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .in("status", statuses);
    if (mine_only && userId)
      qb = qb.or(`${requesterCol}.eq.${userId},${assigneeCol}.eq.${userId}`);
    if (requester_id) qb = qb.eq(requesterCol, requester_id);
    if (assignee_id) qb = qb.eq(assigneeCol, assignee_id);
    if (s) qb = qb.or(`title.ilike.%${s}%,claim_number.ilike.%${s}%`);
    if (since) qb = qb.gte("created_at", since);
    if (until) qb = qb.lt("created_at", until);
    const { data, error: qErr, count } = await qb
      .order(sort, { ascending })
      .range(from, to);
    if (qErr) return errorContent(qErr.message);
    return buildListResponse<ExpenseClaimRow>(
      "expense claims",
      (data ?? []) as ExpenseClaimRow[],
      { q, page, page_size },
      count ?? null,
      mapExpenseClaim,
    );
  },
});
