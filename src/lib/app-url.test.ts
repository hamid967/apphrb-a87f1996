import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppOrigin, getAppUrl } from "./app-url";

const PROD = "https://project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app";

function setOrigin(origin: string | undefined) {
  if (origin === undefined) {
    // Simulate SSR: window undefined
    vi.stubGlobal("window", undefined);
    return;
  }
  vi.stubGlobal("window", { location: { origin } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAppOrigin", () => {
  it("returns https origin when inside a normal browser / WebView with https scheme", () => {
    setOrigin("https://app.example.com");
    expect(getAppOrigin()).toBe("https://app.example.com");
  });

  it("returns the published origin when inside a Capacitor WebView with https scheme baked in", () => {
    setOrigin(PROD);
    expect(getAppOrigin()).toBe(PROD);
  });

  it("falls back to the published origin when the WebView uses capacitor:// scheme", () => {
    setOrigin("capacitor://localhost");
    expect(getAppOrigin()).toBe(PROD);
  });

  it("falls back to the published origin during SSR (no window)", () => {
    setOrigin(undefined);
    expect(getAppOrigin()).toBe(PROD);
  });
});

describe("getAppUrl", () => {
  it("joins absolute paths correctly", () => {
    setOrigin("https://app.example.com");
    expect(getAppUrl("/onboarding/wizard")).toBe("https://app.example.com/onboarding/wizard");
    expect(getAppUrl("/reset-password")).toBe("https://app.example.com/reset-password");
    expect(getAppUrl("/dashboard")).toBe("https://app.example.com/dashboard");
  });

  it("adds a leading slash when missing", () => {
    setOrigin("https://app.example.com");
    expect(getAppUrl("reset-password")).toBe("https://app.example.com/reset-password");
  });

  it("returns origin only for empty path", () => {
    setOrigin("https://app.example.com");
    expect(getAppUrl("")).toBe("https://app.example.com");
  });

  it("uses the production origin fallback inside a non-https WebView", () => {
    setOrigin("capacitor://localhost");
    expect(getAppUrl("/onboarding/wizard")).toBe(`${PROD}/onboarding/wizard`);
    expect(getAppUrl("/reset-password")).toBe(`${PROD}/reset-password`);
  });

  it("never produces a capacitor:// URL that Supabase would reject", () => {
    for (const origin of ["capacitor://localhost", "file://", "http://localhost"]) {
      setOrigin(origin);
      const url = getAppUrl("/reset-password");
      // Only http(s) is acceptable; http:// on localhost is fine for dev tests
      // but we specifically guard capacitor:// / file:// which Supabase rejects.
      expect(url.startsWith("capacitor://")).toBe(false);
      expect(url.startsWith("file://")).toBe(false);
    }
  });
});
