// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  savePendingRedirect,
  readPendingRedirect,
  consumePendingRedirect,
  clearPendingRedirect,
} from "./pending-redirect";

const KEY = "hbspro.pending_redirect";

describe("pending-redirect (browser)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("saves a target and reads it back without clearing", () => {
    savePendingRedirect("/onboarding/wizard");
    expect(readPendingRedirect()).toBe("/onboarding/wizard");
    // read is non-destructive
    expect(window.sessionStorage.getItem(KEY)).toBe("/onboarding/wizard");
  });

  it("save is a no-op for null/undefined/empty string (won't wipe a prior value)", () => {
    savePendingRedirect("/dashboard");
    savePendingRedirect(undefined);
    savePendingRedirect(null);
    savePendingRedirect("");
    expect(readPendingRedirect()).toBe("/dashboard");
  });

  it("save overwrites the previously stored target", () => {
    savePendingRedirect("/a");
    savePendingRedirect("/b");
    expect(readPendingRedirect()).toBe("/b");
  });

  it("consume returns the value AND clears it", () => {
    savePendingRedirect("/onboarding/wizard");
    expect(consumePendingRedirect()).toBe("/onboarding/wizard");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    // second consume yields null (proves single-use semantics)
    expect(consumePendingRedirect()).toBeNull();
  });

  it("consume on empty storage returns null and does not throw", () => {
    expect(consumePendingRedirect()).toBeNull();
  });

  it("read on empty storage returns null", () => {
    expect(readPendingRedirect()).toBeNull();
  });

  it("clear removes the entry", () => {
    savePendingRedirect("/x");
    clearPendingRedirect();
    expect(readPendingRedirect()).toBeNull();
  });

  it("clear on empty storage is a no-op", () => {
    expect(() => clearPendingRedirect()).not.toThrow();
    expect(readPendingRedirect()).toBeNull();
  });

  it("preserves the exact string (query + hash) — module does NOT sanitize", () => {
    // Sanitization is safeRedirect()'s job; storage stays faithful so the
    // consumer decides what to accept. This is the contract routeAfterLogin
    // relies on when it pipes the stashed value through safeRedirect().
    const payload = "/onboarding/wizard?step=2#profile";
    savePendingRedirect(payload);
    expect(consumePendingRedirect()).toBe(payload);
  });
});

describe("pending-redirect resilience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("save swallows storage exceptions (private mode / quota)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => savePendingRedirect("/x")).not.toThrow();
  });

  it("read swallows storage exceptions and returns null", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readPendingRedirect()).toBeNull();
  });

  it("consume swallows storage exceptions and returns null", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(consumePendingRedirect()).toBeNull();
  });

  it("clear swallows storage exceptions", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => clearPendingRedirect()).not.toThrow();
  });
});

describe("pending-redirect (non-browser / SSR)", () => {
  // These specs run in a fresh module context with `window` undefined so we
  // exercise the isBrowser() short-circuit. jsdom sets window globally, so
  // we simulate SSR by deleting it around each call.
  const withNoWindow = async (fn: () => void | Promise<void>) => {
    const orig = globalThis.window;
    // @ts-expect-error — deliberately unset for SSR simulation
    delete globalThis.window;
    try {
      await fn();
    } finally {
      globalThis.window = orig;
    }
  };

  it("save/read/consume/clear are safe no-ops without window", async () => {
    await withNoWindow(() => {
      expect(() => savePendingRedirect("/x")).not.toThrow();
      expect(readPendingRedirect()).toBeNull();
      expect(consumePendingRedirect()).toBeNull();
      expect(() => clearPendingRedirect()).not.toThrow();
    });
  });
});
