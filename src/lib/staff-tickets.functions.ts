import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Staff-facing support tickets API — org-scoped queries and mutations for
 * employees (RLS scopes reads to organization_members rows).
 */

async function currentOrgId(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        limit: (n: number) => { maybeSingle: () => Promise<{ data: { org_id: string } | null }> };
      };
    };
  };
}, userId: string): Promise<string> {
  const { data: mem } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const orgId = mem?.org_id ?? null;
  if (!orgId) throw new Error("لا توجد شركة مرتبطة بالحساب.");
  return orgId;
}

const listInput = z.object({
  status: z.enum(["open", "pending", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedToMe: z.boolean().optional(),
  overdueOnly: z.boolean().optional(),
  search: z.string().max(120).optional(),
}).partial();

export type StaffTicketRow = {
  id: string;
  ticket_number: string | null;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  channel: string;
  requester_id: string | null;
  assignee_id: string | null;
  sla_due_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export const listStaffTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => listInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const orgId = await currentOrgId(
      context.supabase as unknown as Parameters<typeof currentOrgId>[0],
      context.userId,
    );

    let q = context.supabase
      .from("tickets")
      .select(
        "id, ticket_number, subject, status, priority, category, channel, requester_id, assignee_id, sla_due_at, first_response_at, resolved_at, tags, created_at, updated_at",
      )
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.status) q = q.eq("status", data.status);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.assignedToMe) q = q.eq("assignee_id", context.userId);
    if (data.overdueOnly) {
      q = q.is("resolved_at", null).lt("sla_due_at", new Date().toISOString());
    }
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(`subject.ilike.%${s}%,ticket_number.ilike.%${s}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as StaffTicketRow[];
  });

const idInput = z.object({ id: z.string().uuid() });

export type StaffTicketDetail = StaffTicketRow & {
  description: string | null;
  org_id: string;
  closed_at: string | null;
  watcher_ids: string[];
};

export type StaffTicketAttachment = { name: string; url: string; size?: number };

export type StaffTicketComment = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  body: string;
  is_internal: boolean;
  attachments: StaffTicketAttachment[];
  created_at: string;
};

export const getStaffTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => idInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: ticket, error: tErr } = await context.supabase
      .from("tickets")
      .select(
        "id, org_id, ticket_number, subject, description, status, priority, category, channel, requester_id, assignee_id, sla_due_at, first_response_at, resolved_at, closed_at, tags, watcher_ids, created_at, updated_at",
      )
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!ticket) throw new Error("Ticket not found");

    const { data: comments, error: cErr } = await context.supabase
      .from("ticket_comments")
      .select("id, ticket_id, author_id, body, is_internal, attachments, created_at")
      .eq("ticket_id", data.id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (cErr) throw new Error(cErr.message);

    return {
      ticket: ticket as unknown as StaffTicketDetail,
      comments: (comments ?? []) as unknown as StaffTicketComment[],
    };
  });

const createInput = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  category: z.string().max(60).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  channel: z.enum(["portal", "email", "phone", "whatsapp", "internal"]).default("internal"),
  assigneeId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const createStaffTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => createInput.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await currentOrgId(
      context.supabase as unknown as Parameters<typeof currentOrgId>[0],
      context.userId,
    );
    const { data: row, error } = await context.supabase
      .from("tickets")
      .insert({
        org_id: orgId,
        subject: data.subject,
        description: data.description ?? null,
        category: data.category ?? null,
        priority: data.priority,
        channel: data.channel,
        assignee_id: data.assigneeId ?? null,
        tags: data.tags,
        requester_id: context.userId,
        status: "open",
      })
      .select("id, ticket_number")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const updateInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "pending", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z.string().max(60).nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const updateStaffTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => updateInput.parse(i))
  .handler(async ({ data, context }) => {
    type TicketPatch = {
      status?: string;
      priority?: string;
      category?: string | null;
      assignee_id?: string | null;
      tags?: string[];
      resolved_at?: string | null;
      closed_at?: string | null;
    };
    const patch: TicketPatch = {};
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "resolved") patch.resolved_at = new Date().toISOString();
      if (data.status === "closed") patch.closed_at = new Date().toISOString();
      if (data.status === "open" || data.status === "in_progress" || data.status === "pending") {
        patch.resolved_at = null;
        patch.closed_at = null;
      }
    }
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.category !== undefined) patch.category = data.category;
    if (data.assigneeId !== undefined) patch.assignee_id = data.assigneeId;
    if (data.tags !== undefined) patch.tags = data.tags;

    const { data: row, error } = await context.supabase
      .from("tickets")
      .update(patch)
      .eq("id", data.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const commentInput = z.object({
  ticketId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  isInternal: z.boolean().default(false),
});

export const addStaffTicketComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => commentInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: t, error: tErr } = await context.supabase
      .from("tickets")
      .select("id, org_id, first_response_at, requester_id, status")
      .eq("id", data.ticketId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!t) throw new Error("Ticket not found");

    const { data: comment, error } = await context.supabase
      .from("ticket_comments")
      .insert({
        ticket_id: t.id,
        org_id: t.org_id,
        author_id: context.userId,
        body: data.body,
        is_internal: data.isInternal,
      })
      .select("id, ticket_id, author_id, body, is_internal, attachments, created_at")
      .single();
    if (error) throw new Error(error.message);

    // First staff response (non-internal from someone other than requester)
    if (
      !t.first_response_at &&
      !data.isInternal &&
      t.requester_id !== context.userId
    ) {
      await context.supabase
        .from("tickets")
        .update({
          first_response_at: new Date().toISOString(),
          status: t.status === "open" ? "in_progress" : t.status,
        })
        .eq("id", t.id);
    }

    return comment;
  });

export const listAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await currentOrgId(
      context.supabase as unknown as Parameters<typeof currentOrgId>[0],
      context.userId,
    );
    const { data: members, error: mErr } = await context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("org_id", orgId)
      .limit(200);
    if (mErr) throw new Error(mErr.message);
    const ids = (members ?? []).map((m) => (m as { user_id: string }).user_id);
    if (ids.length === 0) return [];
    const { data: profiles, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    if (pErr) throw new Error(pErr.message);
    return (profiles ?? []) as unknown as Array<{ id: string; full_name: string | null; email: string | null }>;
  });
