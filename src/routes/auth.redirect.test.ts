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

/**
 * Edge cases: real-world redirect targets carry query strings, fragments,
 * and trailing slashes. Attackers try to smuggle other origins through
 * whitespace, backslashes, and URL-encoded slashes.
 */
describe("safeRedirect edge cases (query params, trailing slash, smuggling)", () => {
  it("preserves query strings on valid paths", () => {
    expect(safeRedirect("/dashboard?tab=expenses")).toBe("/dashboard?tab=expenses");
    expect(safeRedirect("/onboarding/wizard?step=2&lang=ar")).toBe(
      "/onboarding/wizard?step=2&lang=ar",
    );
    expect(safeRedirect("/reset-password?token=abc&type=recovery")).toBe(
      "/reset-password?token=abc&type=recovery",
    );
    expect(safeRedirect("/search?q=hello+world&page=3")).toBe("/search?q=hello+world&page=3");
  });

  it("preserves trailing slashes and fragments", () => {
    expect(safeRedirect("/dashboard/")).toBe("/dashboard/");
    expect(safeRedirect("/dashboard/expenses/")).toBe("/dashboard/expenses/");
    expect(safeRedirect("/dashboard#section-2")).toBe("/dashboard#section-2");
    expect(safeRedirect("/dashboard/?tab=x#anchor")).toBe("/dashboard/?tab=x#anchor");
  });

  it("accepts deep nested paths with mixed casing", () => {
    expect(safeRedirect("/dashboard/expenses/123/edit")).toBe("/dashboard/expenses/123/edit");
    expect(safeRedirect("/tenant/portal/statements/00000000-0000-0000-0000-000000000000")).toBe(
      "/tenant/portal/statements/00000000-0000-0000-0000-000000000000",
    );
    expect(safeRedirect("/Dashboard")).toBe("/Dashboard"); // router owns case; only /auth is loop-guarded
  });

  it("rejects backslash-normalization open-redirect vectors", () => {
    expect(safeRedirect("/\\evil.com")).toBeNull();
    expect(safeRedirect("/\\\\evil.com")).toBeNull();
    expect(safeRedirect("/\\evil.com/dashboard")).toBeNull();
  });

  it("rejects URL-encoded slash smuggling", () => {
    expect(safeRedirect("/%2fevil.com")).toBeNull();
    expect(safeRedirect("/%2F%2Fevil.com")).toBeNull();
    expect(safeRedirect("/%2f%2fevil.com/dashboard")).toBeNull();
    expect(safeRedirect("/%5cevil.com")).toBeNull(); // encoded backslash
  });

  it("rejects leading whitespace / control chars that browsers strip", () => {
    expect(safeRedirect(" /dashboard")).toBeNull();
    expect(safeRedirect("\t/dashboard")).toBeNull();
    expect(safeRedirect("\n//evil.com")).toBeNull();
    expect(safeRedirect(" //evil.com")).toBeNull();
    expect(safeRedirect("\u0000/dashboard")).toBeNull();
  });

  it("rejects non-http schemes even when they look path-like", () => {
    expect(safeRedirect("javascript:alert(1)")).toBeNull();
    expect(safeRedirect("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeRedirect("vbscript:msgbox(1)")).toBeNull();
    expect(safeRedirect("mailto:evil@example.com")).toBeNull();
    // "javascript:" starts with "j", not "/", so the leading-slash guard already blocks it —
    // this test locks that guard in.
  });

  it("case-insensitively refuses to loop back to /auth (with any query/fragment)", () => {
    expect(safeRedirect("/AUTH")).toBeNull();
    expect(safeRedirect("/Auth?next=/dashboard")).toBeNull();
    expect(safeRedirect("/auth#hash")).toBeNull();
    expect(safeRedirect("/auth/reset?token=x")).toBeNull();
    // But paths that merely *start* with "auth" as a different segment are fine.
    expect(safeRedirect("/author/123")).toBe("/author/123");
    expect(safeRedirect("/authorize-device")).toBe("/authorize-device");
  });

  it("rejects empty and whitespace-only inputs", () => {
    expect(safeRedirect("")).toBeNull();
    expect(safeRedirect(" ")).toBeNull();
    expect(safeRedirect("\t\n")).toBeNull();
    expect(safeRedirect(undefined)).toBeNull();
  });
});



/**
 * Simulates the Google OAuth entry point (`lovable.auth.signInWithOAuth`)
 * from a WebView-style origin. The redirect_uri MUST be an http(s) URL —
 * Lovable's OAuth broker and Supabase reject `capacitor://`, so a
 * regression here silently breaks Google sign-in inside the native shell.
 */
describe("Google OAuth redirect_uri contract (WebView)", () => {
  const CASES: Array<[string, string | undefined]> = [
    ["preview host", "https://id-preview--x.lovable.app"],
    ["published host", "https://project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app"],
    ["WebView with https scheme", "https://project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app"],
    ["WebView with capacitor scheme (fallback kicks in)", "capacitor://localhost"],
    ["SSR (no window)", undefined],
  ];

  for (const [name, origin] of CASES) {
    it(`produces an https redirect_uri: ${name}`, () => {
      if (origin === undefined) vi.stubGlobal("window", undefined);
      else vi.stubGlobal("window", { location: { origin } });

      const redirectUri = getAppOrigin();
      // The value passed to lovable.auth.signInWithOAuth("google", { redirect_uri })
      expect(redirectUri.startsWith("http://") || redirectUri.startsWith("https://")).toBe(true);
      expect(redirectUri.startsWith("capacitor://")).toBe(false);
      expect(redirectUri.startsWith("file://")).toBe(false);
      // Must NOT point into a protected route — broker requires a public origin.
      expect(redirectUri.includes("/dashboard")).toBe(false);
      expect(redirectUri.includes("/_authenticated")).toBe(false);
      expect(redirectUri.includes("/onboarding")).toBe(false);

      vi.unstubAllGlobals();
    });
  }
});

/**
 * Verifies the sign-in destination logic — the second half of "OAuth completes
 * into the correct path". After Supabase hydrates the session, `routeAfterLogin`
 * decides where to land the user.
 */
describe("routeAfterLogin (post-sign-in destination)", () => {
  it("honors a safe ?redirect= target (e.g. /onboarding/wizard)", async () => {
    const calls: unknown[] = [];
    const nav = ((arg: unknown) => calls.push(arg)) as never;
    await routeAfterLogin(nav, "/onboarding/wizard");
    expect(calls).toEqual([{ to: "/onboarding/wizard", replace: true }]);
  });

  it("falls back to /dashboard when no redirect is provided", async () => {
    const calls: Array<{ to: string; replace?: boolean }> = [];
    const nav = ((arg: { to: string; replace?: boolean }) => calls.push(arg)) as never;
    await routeAfterLogin(nav, undefined);
    // getMyAccessContext is mocked to return {} → resolveHomeRoute() → null → /dashboard fallback.
    expect(calls[0]).toEqual({ to: "/dashboard", replace: true });
  });

  it("ignores an unsafe ?redirect= (open-redirect attempt) and falls back", async () => {
    const calls: Array<{ to: string; replace?: boolean }> = [];
    const nav = ((arg: { to: string; replace?: boolean }) => calls.push(arg)) as never;
    await routeAfterLogin(nav, "https://evil.com/steal");
    expect(calls[0]).toEqual({ to: "/dashboard", replace: true });
  });

  it("does not loop back to /auth even if redirect asks for it", async () => {
    const calls: Array<{ to: string; replace?: boolean }> = [];
    const nav = ((arg: { to: string; replace?: boolean }) => calls.push(arg)) as never;
    await routeAfterLogin(nav, "/auth?redirect=/dashboard");
    expect(calls[0]).toEqual({ to: "/dashboard", replace: true });
  });
});

});
