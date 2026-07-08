import { redirect, type NavigateOptions } from "@tanstack/react-router";
import { getMyAccessContext } from "@/lib/company.functions";

export type AccessContext = Awaited<ReturnType<typeof getMyAccessContext>>;
export type AccessRole =
  | "super_admin"
  | "company_owner"
  | "company_staff"
  | "tenant"
  | "owner_investor"
  | "none";

/**
 * Central routing decision: returns the route the given user should land on,
 * or null when they're already allowed on the current path.
 *
 * Priority: super_admin → /admin · tenant → /portal/tenant · owner → /portal/owner ·
 * no company → /register-company · expired trial/subscription → /portal/billing.
 */
export function resolveHomeRoute(ctx: AccessContext): NavigateOptions | null {
  const role = (ctx.role as AccessRole) ?? "none";
  if (role === "super_admin") return { to: "/admin", replace: true };
  if (role === "tenant") return { to: "/portal/tenant" as never, replace: true };
  if (role === "owner_investor") return { to: "/portal/owner" as never, replace: true };
  if (!ctx.company_id) return { to: "/register-company", replace: true };
  if (ctx.access?.state === "expired") return { to: "/portal/billing" as never, replace: true };
  if (ctx.access?.state === "pending") return { to: "/access-denied" as never, replace: true };
  if (ctx.access?.state === "rejected") return { to: "/access-denied" as never, replace: true };
  return { to: "/dashboard", replace: true };
}

/**
 * Route-level guard for `beforeLoad`. Pass the roles allowed on this route.
 * Throws a `redirect(...)` when the user doesn't belong here, sending them
 * to their proper landing page.
 */
export async function requireAccess(allowed: AccessRole[]): Promise<AccessContext> {
  const ctx = await getMyAccessContext();
  const role = (ctx.role as AccessRole) ?? "none";

  // Trial / subscription checks apply to company users only.
  const isCompanyUser = role === "company_owner" || role === "company_staff";
  if (isCompanyUser && ctx.access?.state === "expired" && !allowed.includes("none")) {
    throw redirect({ to: "/portal/billing" as never, replace: true });
  }

  if (!allowed.includes(role)) {
    const target = resolveHomeRoute(ctx);
    if (target) throw redirect(target);
  }
  return ctx;
}
