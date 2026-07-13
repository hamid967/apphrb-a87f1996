import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SubscriptionAuditEntry = {
  id: string;
  action: string;
  created_at: string;
  diff: JsonValue;
};

export const getMySubscriptionAuditTrail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc(
      "get_my_subscription_audit_trail",
    );
    if (error) throw new Error(error.message);
    return ((data ?? []) as SubscriptionAuditEntry[]).map((r) => ({
      id: r.id,
      action: r.action,
      created_at: r.created_at,
      diff: (r.diff ?? null) as JsonValue,
    }));
  });
