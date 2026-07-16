import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Phase1RegisterRpc = {
  rpc(
    fn: "register_hbspro_account",
    args: {
      _account_type: "individual" | "business";
      _name: string;
      _phone?: string;
      _tax_number?: string;
      _commercial_registration?: string;
      _national_address?: string;
      _authorized_person_name?: string;
      _authorized_person_phone?: string;
    },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

const RegisterSchema = z.object({
  accountType: z.enum(["individual", "business"]).default("business"),
  name: z.string().trim().min(2, "الاسم قصير").max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  taxNumber: z.string().trim().max(15).optional().nullable(),
  commercialRegistration: z.string().trim().max(40).optional().nullable(),
  nationalAddress: z.string().trim().max(240).optional().nullable(),
  authorizedPersonName: z.string().trim().max(120).optional().nullable(),
  authorizedPersonPhone: z.string().trim().max(30).optional().nullable(),
});

export const registerCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterSchema.parse(d))
  .handler(async ({ data, context }) => {
    const rpcClient = context.supabase as unknown as Phase1RegisterRpc;
    const { data: res, error } = await rpcClient.rpc("register_hbspro_account", {
      _account_type: data.accountType,
      _name: data.name,
      _phone: data.phone ?? undefined,
      _tax_number: data.taxNumber ?? undefined,
      _commercial_registration: data.commercialRegistration ?? undefined,
      _national_address: data.nationalAddress ?? undefined,
      _authorized_person_name: data.authorizedPersonName ?? undefined,
      _authorized_person_phone: data.authorizedPersonPhone ?? undefined,
    });
    if (error) throw new Error(error.message);
    return res as { org_id: string; trial_days: number; account_type: "individual" | "business" };
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
