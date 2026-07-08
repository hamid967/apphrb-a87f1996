import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ROLES, EDITOR_ROLES, type OrgRole } from "@/lib/permissions";

async function assertOrgRole(
  supabase: ServerSupabase,
  userId: string,
  orgId: string,
  allowed: OrgRole[],
) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: allowed,
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: insufficient role");
}

const priority = z.enum(["low", "medium", "high", "urgent"]);
const status = z.enum(["open", "in_progress", "done", "cancelled"]);

const isoOrNull = z
  .union([z.string().datetime(), z.string().length(0), z.null()])
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const uuidOrNull = z
  .union([z.string().uuid(), z.string().length(0), z.null()])
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const createSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(4000).optional().nullable(),
  due_at: isoOrNull,
  remind_at: isoOrNull,
  priority: priority.default("medium"),
  status: status.default("open"),
  assignee_id: uuidOrNull,
  property_id: uuidOrNull,
  contact_id: uuidOrNull,
  lead_id: uuidOrNull,
  deal_id: uuidOrNull,
});

const updateSchema = createSchema
  .omit({ org_id: true })
  .partial()
  .extend({ id: z.string().uuid() });

async function getTaskOrgId(supabase: ServerSupabase, id: string): Promise<string> {
  const { data, error } = await supabase.from("tasks").select("org_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Task not found");
  return data.org_id as string;
}

function normalize<T extends Record<string, any>>(input: T): T {
  const out: Record<string, any> = { ...input };
  for (const k of Object.keys(out)) if (out[k] === "") out[k] = null;
  return out as T;
}

export type TaskRow = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  remind_at: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "done" | "cancelled";
  assignee_id: string | null;
  property_id: string | null;
  contact_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  property: { id: string; title_ar: string | null; title_en: string | null } | null;
  contact: { id: string; full_name: string } | null;
  lead: { id: string; stage: string | null } | null;
  deal: {
    id: string;
    title: string | null;
    status: string | null;
    offer_date: string | null;
  } | null;
};

export type OrgMemberRow = {
  user_id: string;
  role: string;
  profile: { id: string; full_name: string | null } | null;
};

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tasks")
      .select(
        "*, property:properties(id, title_ar, title_en), contact:contacts(id, full_name), lead:leads(id, stage), deal:deals(id, status, notes, offer_date)",
      )
      .eq("org_id", data.org_id)
      .order("status", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((rows ?? []) as any[]).map<TaskRow>((r) => ({
      ...r,
      property: r.property ?? null,
      contact: r.contact ?? null,
      lead: r.lead ?? null,
      deal: r.deal
        ? {
            id: r.deal.id,
            // UI expects `title`; deals has no title column, so surface `notes`.
            title: r.deal.notes ?? null,
            status: r.deal.status ?? null,
            offer_date: r.deal.offer_date ?? null,
          }
        : null,
    }));
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("tasks")
      .insert({ ...normalize(data), created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const orgId = await getTaskOrgId(context.supabase, id);
    // Editors can update any task in their org; assignees can update their own
    // task even without editor role (RLS enforces this too).
    const { data: allowed } = await context.supabase.rpc("has_org_role", {
      _org: orgId,
      _user: context.userId,
      _roles: EDITOR_ROLES,
    });
    if (!allowed) {
      const { data: t } = await context.supabase
        .from("tasks")
        .select("assignee_id")
        .eq("id", id)
        .maybeSingle();
      if (!t || t.assignee_id !== context.userId) {
        throw new Error("Forbidden: insufficient role");
      }
    }
    const p: Record<string, any> = normalize(patch);
    if (p.status === "done" && !p.completed_at) p.completed_at = new Date().toISOString();
    if (p.status && p.status !== "done") p.completed_at = null;
    const { error } = await (context.supabase.from("tasks") as any).update(p).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getTaskOrgId(context.supabase, data.id);
    await assertOrgRole(context.supabase, context.userId, orgId, ADMIN_ROLES);
    const { error } = await context.supabase.from("tasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listOrgMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("organization_members")
      .select("user_id, role")
      .eq("org_id", data.org_id);
    if (error) throw error;
    const members = rows ?? [];
    const ids = members.map((m) => m.user_id).filter(Boolean) as string[];
    if (ids.length === 0) return [];
    const { data: profiles, error: pErr } = await context.supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    if (pErr) throw pErr;
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return members.map<OrgMemberRow>((m) => ({
      user_id: m.user_id as string,
      role: m.role as string,
      profile: (map.get(m.user_id) as OrgMemberRow["profile"]) ?? null,
    }));
  });
