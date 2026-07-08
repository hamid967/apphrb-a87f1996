import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RegisterSchema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(120),
  phone: z.string().trim().max(30).optional().nullable(),
});

export const registerCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("register_company", {
      _name: data.name,
      _phone: data.phone ?? undefined,
    });
    if (error) throw new Error(error.message);
    return res as { org_id: string; trial_days: number };
  });

export const getMyAccessContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [roleRes, companyRes, accessRes] = await Promise.all([
      context.supabase.rpc("get_my_role"),
      context.supabase.rpc("get_my_company_id"),
      context.supabase.rpc("my_access_status"),
    ]);
    return {
      role: (roleRes.data as string | null) ?? "none",
      company_id: (companyRes.data as string | null) ?? null,
      access: (accessRes.data as { state: string; trial_ends_at?: string } | null) ?? {
        state: "no_profile",
      },
    };
  });
