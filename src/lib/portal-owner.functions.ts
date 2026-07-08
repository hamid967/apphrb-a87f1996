import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOwner(supabase: ServerSupabase) {
  const { data: role, error } = await supabase.rpc("get_my_role");
  if (error) throw new Error(error.message);
  if (role !== "owner_investor") throw new Error("Forbidden: owner only");
}

export const getOwnerPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase);

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, full_name, phone, owner_id")
      .eq("id", context.userId)
      .maybeSingle();

    const ownerId = profile?.owner_id as string | undefined;
    if (!ownerId) return { profile, owner: null, contracts: [], statements: [] };

    const [{ data: owner }, { data: contracts }, { data: statements }] = await Promise.all([
      context.supabase
        .from("owners")
        .select("id, full_name, email, phone, address")
        .eq("id", ownerId)
        .maybeSingle(),
      context.supabase
        .from("contracts")
        .select(
          "id, contract_number, status, start_date, end_date, amount, currency_code, unit_id, tenant_id",
        )
        .eq("owner_id", ownerId)
        .is("deleted_at", null)
        .order("start_date", { ascending: false }),
      context.supabase
        .from("owner_statements")
        .select(
          "id, period_start, period_end, gross_income, expenses_total, management_fee, net_payout, currency, status, pdf_url, issued_at",
        )
        .eq("owner_id", ownerId)
        .order("period_start", { ascending: false })
        .limit(24),
    ]);

    return { profile, owner, contracts: contracts ?? [], statements: statements ?? [] };
  });
