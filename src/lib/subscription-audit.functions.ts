import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SubscriptionAuditEntry = {
  id: string;
  action: string;
  created_at: string;
  diff: Record<string, unknown> | null;
};

export const getMySubscriptionAuditTrail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionAuditEntry[]> => {
    const { data, error } = await context.supabase.rpc(
      "get_my_subscription_audit_trail",
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as SubscriptionAuditEntry[];
  });
