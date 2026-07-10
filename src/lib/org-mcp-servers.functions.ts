import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orgIdSchema = z.string().uuid();

const urlSchema = z
  .string()
  .trim()
  .min(8)
  .max(2000)
  .refine((v) => /^https?:\/\//i.test(v), "URL must start with http:// or https://");

export type OrgMcpServer = {
  id: string;
  org_id: string;
  name: string;
  url: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export const listOrgMcpServers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) =>
    z.object({ orgId: orgIdSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OrgMcpServer[]> => {
    const { data: rows, error } = await context.supabase
      .from("org_mcp_servers")
      .select("id,org_id,name,url,created_at,updated_at,created_by")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as OrgMcpServer[];
  });

export const createOrgMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; name: string; url: string }) =>
    z
      .object({
        orgId: orgIdSchema,
        name: z.string().trim().min(1).max(80),
        url: urlSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OrgMcpServer> => {
    const { data: row, error } = await context.supabase
      .from("org_mcp_servers")
      .insert({
        org_id: data.orgId,
        name: data.name,
        url: data.url,
        created_by: context.userId,
      })
      .select("id,org_id,name,url,created_at,updated_at,created_by")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A server with this URL already exists.");
      throw new Error(error.message);
    }
    return row as OrgMcpServer;
  });

export const deleteOrgMcpServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("org_mcp_servers")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
