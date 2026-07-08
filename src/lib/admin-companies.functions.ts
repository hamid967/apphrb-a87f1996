import { createServerFn } from "@tanstack/react-start";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";
import { z } from "zod";

export const listCompaniesWithEstablishmentNo = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select(
        "id, name, legal_name, establishment_no, org_id, created_at, deleted_at, organizations(name)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      legal_name: c.legal_name,
      establishment_no: c.establishment_no,
      org_id: c.org_id,
      org_name: c.organizations?.name ?? null,
      created_at: c.created_at,
    }));
  });

export const regenerateEstablishmentNo = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: newNo, error } = await context.supabase.rpc(
      "admin_regenerate_establishment_no" as any,
      { _company_id: data.companyId } as any,
    );
    if (error) throw error;
    return { establishment_no: newNo as unknown as string };
  });
