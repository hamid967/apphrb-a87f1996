import {
  createFileRoute,
  Outlet,
  redirect,
  isRedirect,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { checkAdminAccess } from "@/lib/admin-guard.functions";
import { supabase } from "@/integrations/supabase/client";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { logAdminEvent } from "@/lib/admin-telemetry.functions";

/**
 * Pathless-ish layout for /admin/* — enforces admin role via server-verified has_role check.
 * Non-admins are redirected to /dashboard.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    const { isAdmin } = await checkAdminAccess();
    if (!isAdmin) {
      throw redirect({ to: "/dashboard" });
    }
    // Super-admin MUST reach AAL2 (TOTP) before touching /admin/*.
    // Fail-closed: any non-redirect error (network glitch, API failure,
    // missing session, unexpected response) must block access and send
    // the user through the MFA flow — never silently allow entry.
    try {
      // E2E AAL2 bypass — safe for DEV / Staging / CI, INERT in production.
      //
      // Enabling requires ALL of these at BUILD time:
      //   1) import.meta.env.DEV === true, OR
      //      import.meta.env.VITE_E2E_BYPASS_AAL2 === "true" (staging/CI build)
      //   2) import.meta.env.VITE_E2E_BYPASS_TOKEN is a non-empty shared secret
      //
      // Plus at RUNTIME:
      //   3) sessionStorage["__admin_e2e_skip_aal2"] === VITE_E2E_BYPASS_TOKEN
      //
      // Production builds omit both VITE_E2E_* vars, so Vite inlines the
      // guard to `false` and the whole branch is dead-code-eliminated —
      // even an attacker with sessionStorage access cannot activate it.
      const bypassToken = import.meta.env.VITE_E2E_BYPASS_TOKEN as string | undefined;
      const bypassAllowedByBuild =
        import.meta.env.DEV || import.meta.env.VITE_E2E_BYPASS_AAL2 === "true";
      if (
        bypassAllowedByBuild &&
        typeof bypassToken === "string" &&
        bypassToken.length >= 16 &&
        typeof window !== "undefined" &&
        window.sessionStorage.getItem("__admin_e2e_skip_aal2") === bypassToken
      ) {
        // Audit the bypass so unexpected staging/CI usage is visible.
        void logAdminEvent({
          data: {
            kind: "aal2_bypass",
            path: location.pathname,
            message: `AAL2 bypass activated (mode=${import.meta.env.DEV ? "dev" : "ci"})`,
          },
        }).catch(() => {});
        return { isAdmin };
      }
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (!data || data.currentLevel !== "aal2") {
        throw redirect({
          to: "/security/mfa",
          search: { redirect: location.href, reason: "admin_mfa_required" },
        });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      throw redirect({
        to: "/security/mfa",
        search: { redirect: location.href, reason: "admin_mfa_check_failed" },
      });
    }
    return { isAdmin };
  },
  component: AdminLayout,
  errorComponent: ({ error }) => {
    if (typeof window !== "undefined") {
      void logAdminEvent({
        data: {
          kind: "route_error",
          path: window.location.pathname,
          message: error?.message ?? String(error),
          stack: error?.stack ?? null,
        },
      }).catch(() => {});
    }
    return <div className="p-6 text-sm text-destructive">{error.message}</div>;
  },
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const enteredAtRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );
  const prevPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname]);
  // Nav telemetry: record enter (with duration on previous page).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const now = performance.now();
    const prev = prevPathRef.current;
    const durationMs = prev ? now - enteredAtRef.current : null;
    void logAdminEvent({
      data: {
        kind: "nav",
        path: pathname,
        durationMs,
        extra: prev ? { from: prev } : null,
      },
    }).catch(() => {});
    prevPathRef.current = pathname;
    enteredAtRef.current = now;
  }, [pathname]);
  // Global JS/promise error capture while on /admin/*.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onError = (e: ErrorEvent) => {
      void logAdminEvent({
        data: {
          kind: "window_error",
          path: window.location.pathname,
          message: e.message,
          stack: e.error?.stack ?? null,
          extra: { filename: e.filename, lineno: e.lineno, colno: e.colno },
        },
      }).catch(() => {});
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      void logAdminEvent({
        data: {
          kind: "unhandled_rejection",
          path: window.location.pathname,
          message: reason?.message ?? String(reason),
          stack: reason?.stack ?? null,
        },
      }).catch(() => {});
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full">
        <AdminSidebar />
        <SidebarInset className="flex flex-col min-w-0">
          <AdminHeader />
          <div className="flex-1 min-w-0">
            <AdminErrorBoundary pathname={pathname}>
              <Outlet />
            </AdminErrorBoundary>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
