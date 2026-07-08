import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertTenant(supabase: ServerSupabase) {
  const { data: role, error } = await supabase.rpc("get_my_role");
  if (error) throw new Error(error.message);
  if (role !== "tenant") throw new Error("Forbidden: tenant only");
}

export const getTenantPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertTenant(context.supabase);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, full_name, phone, tenant_id")
      .eq("id", context.userId)
      .maybeSingle();

    const tenantId = profile?.tenant_id as string | undefined;
    if (!tenantId) {
      return { profile, tenant: null, contracts: [], charges: [] };
    }

    const [{ data: tenant }, { data: contracts }, { data: charges }] = await Promise.all([
      context.supabase
        .from("tenants")
        .select("id, full_name, email, phone, nationality")
        .eq("id", tenantId)
        .maybeSingle(),
      context.supabase
        .from("contracts")
        .select(
          "id, contract_number, status, start_date, end_date, amount, currency_code, payment_frequency, unit_id",
        )
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("start_date", { ascending: false }),
      context.supabase
        .from("rent_charges")
        .select(
          "id, contract_id, period_start, period_end, due_date, amount, currency, status, paid_at",
        )
        .eq("tenant_id", tenantId)
        .order("due_date", { ascending: false })
        .limit(50),
    ]);

    return { profile, tenant, contracts: contracts ?? [], charges: charges ?? [] };
  });
