/**
 * Guards the post-login redirect logic used by /auth. `safeRedirect` is
 * the only thing that decides whether an arbitrary `?redirect=…` value is
 * followed after a successful sign-in, so bugs here either open the app
 * up to open-redirect abuse or trap the user in the auth screen.
 */
import { describe, expect, it, vi } from "vitest";

// The route file imports browser-only modules at top level; stub them so the
// module can load in a pure-node test environment.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: {} } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, ready: false }) }));
vi.mock("@/lib/company.functions", () => ({ getMyAccessContext: async () => ({}) }));
vi.mock("@/lib/access-guard", () => ({ resolveHomeRoute: () => null }));
vi.mock("@/lib/sessions.functions", () => ({
  checkLoginRateLimit: async () => ({ blocked: false }),
  recordLoginEvent: async () => {},
}));
vi.mock("@/lib/auth-attempts", () => ({
  getFailedAttempts: () => 0,
  incFailedAttempts: () => 0,
  resetFailedAttempts: () => {},
}));
vi.mock("@/lib/device-fingerprint", () => ({ getDeviceFingerprint: () => "test" }));
vi.mock("@/components/SignupAssistant", () => ({ SignupAssistant: () => null }));
vi.mock("@/components/hbspro/login/LoginStage", () => ({ LoginStage: () => null }));
vi.mock("@/components/hbspro/tokens", () => ({ HBS: {} }));
vi.mock("@/components/LanguageSwitcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("@/lib/i18n", () => ({}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: {} }) }));
vi.mock("motion/react", () => ({ motion: {} }));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: () => null,
  useNavigate: () => () => {},
  useSearch: () => ({}),
}));

const { safeRedirect, routeAfterLogin } = await import("./auth");
const { getAppOrigin } = await import("@/lib/app-url");

describe("safeRedirect (post-login destination)", () => {
  it("returns valid same-origin paths", () => {
    expect(safeRedirect("/dashboard")).toBe("/dashboard");
    expect(safeRedirect("/onboarding/wizard")).toBe("/onboarding/wizard");
    expect(safeRedirect("/dashboard/expenses")).toBe("/dashboard/expenses");
    expect(safeRedirect("/reset-password?token=abc")).toBe("/reset-password?token=abc");
  });

  it("rejects protocol-relative and absolute URLs to prevent open redirects", () => {
    expect(safeRedirect("//evil.com/steal")).toBeNull();
    expect(safeRedirect("http://evil.com")).toBeNull();
    expect(safeRedirect("https://evil.com/x")).toBeNull();
    expect(safeRedirect("javascript:alert(1)")).toBeNull();
  });

  it("rejects relative and empty paths", () => {
    expect(safeRedirect("")).toBeNull();
    expect(safeRedirect(undefined)).toBeNull();
    expect(safeRedirect("dashboard")).toBeNull();
    expect(safeRedirect("../admin")).toBeNull();
  });

  it("never bounces back to the auth screen (avoids redirect loops)", () => {
    expect(safeRedirect("/auth")).toBeNull();
    expect(safeRedirect("/auth?redirect=/dashboard")).toBeNull();
    expect(safeRedirect("/auth/callback")).toBeNull();
  });
});
