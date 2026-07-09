import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side enforcement for the /admin surface.
 *
 * Composes {@link requireSupabaseAuth} and adds one extra gate:
 *   - The caller must have the `super_admin` role in `public.user_roles`
 *     (checked via `has_role(auth.uid(), 'super_admin')`).
 *
 * Failures throw `Forbidden` (401/403 semantics for the client) — never
 * `Unauthorized`, which callers may retry as a re-auth trigger.
 */
export const requireAAL2SuperAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data: isSuperAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (error) {
      console.error("[requireAAL2SuperAdmin] has_role failed:", error);
      throw new Error("Forbidden: role check failed");
    }
    if (!isSuperAdmin) {
      throw new Error("Forbidden: super_admin only");
    }

    return next();
  });
