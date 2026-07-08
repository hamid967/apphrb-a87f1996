import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SOFT_DELETE_ENTITIES = ["contracts", "payments", "tenants", "units", "owners"] as const;

const listInput = z.object({
  entity: z.string().min(1).max(64).optional(),
  entities: z.array(z.string().min(1).max(64)).max(20).optional(),
  action: z.string().min(1).max(32).optional(),
  actions: z.array(z.string().min(1).max(32)).max(10).optional(),
  actor: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

export type AuditLogRow = {
  id: string;
  entity: string;
  entity_id: string;
  actor: string | null;
  action: string;
  created_at: string;
  diff: JsonValue | null;
};

export type ListAuditLogResult = {
  rows: AuditLogRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

/**
 * List audit_log rows with pagination + filters.
 * Access is enforced by RLS on `audit_log` (staff/admin roles).
 */
export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }): Promise<ListAuditLogResult> => {
    const { supabase } = context;
    const page = data.page;
    const pageSize = data.pageSize;
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;

    let q = supabase
      .from("audit_log")
      .select("id, entity, entity_id, actor, action, created_at, diff", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(fromIdx, toIdx);

    if (data.entity) q = q.eq("entity", data.entity);
    else if (data.entities?.length) q = q.in("entity", data.entities);

    if (data.action) q = q.eq("action", data.action);
    else if (data.actions?.length) q = q.in("action", data.actions);

    if (data.actor) q = q.eq("actor", data.actor);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    if (data.search) {
      const s = data.search.replace(/[%,()]/g, " ");
      // search across entity_id, reason inside diff, and raw diff text
      q = q.or(`entity_id.ilike.%${s}%,diff->>reason.ilike.%${s}%,diff::text.ilike.%${s}%`);
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    return {
      rows: (rows ?? []) as AuditLogRow[],
      page,
      pageSize,
      total: count ?? 0,
      hasMore: (count ?? 0) > page * pageSize,
    };
  });

/**
 * Fetch a single audit_log row by id (RLS-scoped).
 */
export const getAuditLogById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<AuditLogRow | null> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("audit_log")
      .select("id, entity, entity_id, actor, action, created_at, diff")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as AuditLogRow | null;
  });

/**
 * Convenience wrapper for the soft-delete audit trail (archive/restore only).
 */
export const listSoftDeleteAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    listInput
      .omit({ action: true, actions: true, entity: true, entities: true })
      .extend({
        entity: z.enum(SOFT_DELETE_ENTITIES).optional(),
        action: z.enum(["archive", "restore"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ListAuditLogResult> => {
    const { supabase } = context;
    const page = data.page;
    const pageSize = data.pageSize;
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;

    let q = supabase
      .from("audit_log")
      .select("id, entity, entity_id, actor, action, created_at, diff", { count: "exact" })
      .in("action", data.action ? [data.action] : ["archive", "restore"])
      .in("entity", data.entity ? [data.entity] : (SOFT_DELETE_ENTITIES as unknown as string[]))
      .order("created_at", { ascending: false })
      .range(fromIdx, toIdx);

    if (data.actor) q = q.eq("actor", data.actor);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.search) {
      const s = data.search.replace(/[%,()]/g, " ");
      q = q.or(`entity_id.ilike.%${s}%,diff->>reason.ilike.%${s}%`);
    }

    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    return {
      rows: (rows ?? []) as AuditLogRow[],
      page,
      pageSize,
      total: count ?? 0,
      hasMore: (count ?? 0) > page * pageSize,
    };
  });
