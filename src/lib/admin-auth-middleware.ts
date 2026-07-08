import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side enforcement for the /admin surface.
 *
 * Composes {@link requireSupabaseAuth} and adds two extra gates:
 *   1) The caller must have the `super_admin` role in `public.user_roles`
 *      (checked via `has_role(auth.uid(), 'super_admin')`).
 *   2) The caller's session must be at AAL2 (TOTP verified), matching the
 *      client-side layout gate in `src/routes/_authenticated/admin.tsx`.
 *
 * An E2E bypass mirrors the client-side triple-gate:
 *   - build-time env `E2E_BYPASS_AAL2 === "true"`, AND
 *   - build-time env `E2E_BYPASS_TOKEN` is a non-empty string (>=16 chars), AND
 *   - request header `x-e2e-bypass-token` matches the token exactly.
 * Production servers never set `E2E_BYPASS_AAL2`, so the branch is dead.
 *
 * Failures throw `Forbidden` (401/403 semantics for the client) — never
 * `Unauthorized`, which callers may retry as a re-auth trigger.
 */
export const requireAAL2SuperAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const claims = context.claims as Record<string, unknown> | undefined;
    const aal = typeof claims?.aal === "string" ? (claims.aal as string) : null;

    const bypassAllowed = process.env.E2E_BYPASS_AAL2 === "true";
    const bypassToken = process.env.E2E_BYPASS_TOKEN ?? "";
    let bypassActive = false;
    if (bypassAllowed && bypassToken.length >= 16) {
      const header = getRequestHeader("x-e2e-bypass-token") ?? "";
      if (header && header === bypassToken) bypassActive = true;
    }

    if (!bypassActive && aal !== "aal2") {
      throw new Error("Forbidden: AAL2 required");
    }

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