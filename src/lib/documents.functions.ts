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

const BUCKET = "documents";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

const categoryEnum = z.enum(["contract", "invoice", "id", "report", "other"]);
const statusEnum = z.enum(["active", "archived"]);

const createDocSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  category: categoryEnum.default("contract"),
  property_id: z.string().uuid().optional().nullable(),
  deal_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).default([]),
  notes: z.string().max(4000).optional().nullable(),
});

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; status?: "active" | "archived" }) =>
    z.object({ orgId: z.string().uuid(), status: statusEnum.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("documents")
      .select(
        "*, current_version:document_versions!documents_current_version_fk(id,version_no,file_path,file_size,mime_type,created_at)",
      )
      .eq("org_id", data.orgId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: versions, error: e2 } = await context.supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", data.id)
      .order("version_no", { ascending: false });
    if (e2) throw e2;
    return { doc, versions: versions ?? [] };
  });

export const createDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createDocSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("documents")
      .insert({ ...data, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const addDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      document_id: string;
      file_path: string;
      file_size: number;
      mime_type?: string | null;
      notes?: string | null;
    }) =>
      z
        .object({
          document_id: z.string().uuid(),
          file_path: z.string().min(1),
          file_size: z.number().nonnegative(),
          mime_type: z.string().optional().nullable(),
          notes: z.string().max(1000).optional().nullable(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: doc, error: e1 } = await context.supabase
      .from("documents")
      .select("org_id")
      .eq("id", data.document_id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, doc.org_id, EDITOR_ROLES);

    const { data: last } = await context.supabase
      .from("document_versions")
      .select("version_no")
      .eq("document_id", data.document_id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNo = (last?.version_no ?? 0) + 1;

    const { data: ver, error: e2 } = await context.supabase
      .from("document_versions")
      .insert({
        document_id: data.document_id,
        org_id: doc.org_id,
        version_no: nextNo,
        file_path: data.file_path,
        file_size: data.file_size,
        mime_type: data.mime_type ?? null,
        notes: data.notes ?? null,
        uploaded_by: context.userId,
      })
      .select("*")
      .single();
    if (e2) throw e2;

    await context.supabase
      .from("documents")
      .update({ current_version_id: ver.id })
      .eq("id", data.document_id);

    return ver;
  });

export const setDocumentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "active" | "archived" }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: doc, error: e1 } = await context.supabase
      .from("documents")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, doc.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("documents")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const signDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; signer_name: string; signature_data?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        signer_name: z.string().trim().min(1).max(160),
        signature_data: z.string().max(200_000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: doc, error: e1 } = await context.supabase
      .from("documents")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, doc.org_id, EDITOR_ROLES);
    const { data: row, error } = await context.supabase
      .from("documents")
      .update({
        signature_status: "signed",
        signed_at: new Date().toISOString(),
        signed_by_name: data.signer_name,
        signature_data: data.signature_data ?? null,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: doc, error: e1 } = await context.supabase
      .from("documents")
      .select("org_id")
      .eq("id", data.id)
      .single();
    if (e1) throw e1;
    await assertOrgRole(context.supabase, context.userId, doc.org_id, ADMIN_ROLES);
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { file_path: string }) =>
    z.object({ file_path: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const orgId = data.file_path.split("/")[0];
    const { data: ok } = await context.supabase.rpc("is_org_member", {
      _org: orgId,
      _user: context.userId,
    });
    if (!ok) throw new Error("Forbidden");
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUrl(data.file_path, SIGNED_URL_TTL);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

export const DOCUMENTS_BUCKET = BUCKET;
