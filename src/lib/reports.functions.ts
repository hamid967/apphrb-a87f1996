import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeSchema = z.object({
  orgId: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const getReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => rangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const from = data.from ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString();
    const to = data.to ?? new Date().toISOString();

    const [dealsRes, commRes] = await Promise.all([
      context.supabase
        .from("deals")
        .select(
          "id, status, offer_amount, agreed_amount, currency, offer_date, close_date, created_at",
        )
        .eq("org_id", data.orgId)
        .gte("created_at", from)
        .lte("created_at", to),
      context.supabase
        .from("commissions")
        .select("id, amount, currency, status, paid_at, created_at, deal_id")
        .eq("org_id", data.orgId)
        .gte("created_at", from)
        .lte("created_at", to),
    ]);
    if (dealsRes.error) throw dealsRes.error;
    if (commRes.error) throw commRes.error;

    return {
      from,
      to,
      deals: dealsRes.data ?? [],
      commissions: commRes.data ?? [],
    };
  });
