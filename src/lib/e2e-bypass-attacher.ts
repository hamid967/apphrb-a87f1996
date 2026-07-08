import { createMiddleware } from "@tanstack/react-start";

/**
 * Client-side function middleware that mirrors the AAL2 E2E bypass into an
 * HTTP header on every server-function call. When the Playwright suite sets
 * `sessionStorage["__admin_e2e_skip_aal2"]` to the shared secret before
 * navigating to /admin, that value is forwarded as `x-e2e-bypass-token` so
 * `requireAAL2SuperAdmin` on the server can honour the same triple gate
 * without any per-call plumbing.
 *
 * The middleware is inert in production: the client bundle only reads
 * `sessionStorage`, which is empty for real users, and the server ignores
 * the header unless build-time `E2E_BYPASS_AAL2 === "true"`.
 */
export const attachE2EBypassHeader = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | null = null;
    if (typeof window !== "undefined") {
      try {
        token = window.sessionStorage.getItem("__admin_e2e_skip_aal2");
      } catch {
        token = null;
      }
    }
    if (token && token.length >= 16) {
      return next({ headers: { "x-e2e-bypass-token": token } });
    }
    return next();
  },
);