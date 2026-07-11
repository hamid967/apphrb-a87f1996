import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminAccessReason =
  | "ok"
  | "not_signed_in"
  | "missing_super_admin"
  | "aal2_required"
  | "role_check_failed";

export type AdminAccessResult = {
  isAdmin: boolean;
  reason: AdminAccessReason;
  detail?: string;
  userId?: string;
  email?: string | null;
  aal?: string | null;
  hasSuperAdmin?: boolean;
};

/**
 * Server-verified admin gate for /admin.
 * Never throws — returns a structured reason so the route can render an
 * actionable verification screen instead of a silent redirect.
 */
export const checkAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminAccessResult> => {
    const claims = context.claims as Record<string, unknown> | undefined;
    const aal = (claims?.aal as string | undefined) ?? null;
    const email = (claims?.email as string | undefined) ?? null;

    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as never,
    });
    if (error) {
      return {
        isAdmin: false,
        reason: "role_check_failed",
        detail: error.message,
        userId: context.userId,
        email,
        aal,
      };
    }
    const hasSuperAdmin = Boolean(data);
    if (!hasSuperAdmin) {
      return {
        isAdmin: false,
        reason: "missing_super_admin",
        userId: context.userId,
        email,
        aal,
        hasSuperAdmin: false,
      };
    }
    if (aal && aal !== "aal2") {
      return {
        isAdmin: false,
        reason: "aal2_required",
        userId: context.userId,
        email,
        aal,
        hasSuperAdmin: true,
      };
    }
    return {
      isAdmin: true,
      reason: "ok",
      userId: context.userId,
      email,
      aal,
      hasSuperAdmin: true,
    };
  });
