import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-verified admin check used by route beforeLoad guards.
 * Returns { isAdmin: boolean } without throwing so route guards can redirect gracefully.
 */
export const checkAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // The app_role enum was migrated: legacy 'admin' → 'super_admin'.
    // The admin surfaces (/admin/*) are gated on super_admin.
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as never,
    });
    if (error) return { isAdmin: false };
    return { isAdmin: Boolean(data) };
  });
