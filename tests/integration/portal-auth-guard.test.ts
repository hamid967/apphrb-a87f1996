/**
 * Unit tests for the shared portal auth-guard helpers.
 *
 * `usePortalAuthGuard` decides "session expired → sign out + redirect to
 * /auth" from the error surface of React Query. This suite locks in the
 * two invariants that decide whether the redirect fires correctly and
 * without wasted retries:
 *
 *   1. `isAuthError` recognises every shape that `requireSupabaseAuth`
 *      can surface (401, "Unauthorized", JWT-expired, invalid_token,
 *      "no authorization header"), and rejects unrelated errors so we
 *      never sign a user out for a plain business failure.
 *
 *   2. A React Query configured with `retry: authAwareRetry` performs
 *      EXACTLY ONE fetch when the server fn throws 401 — no exponential
 *      backoff loop that would delay the redirect and hammer the cleared
 *      session with additional 401s.
 */
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  isAuthError,
  authAwareRetry,
  installAuthErrorCanceller,
} from "@/hooks/use-portal-auth-guard";

describe("isAuthError", () => {
  it.each([
    "Unauthorized",
    "unauthorized",
    "Request failed with status code 401",
    "JWT expired",
    "invalid_token: bad signature",
    "No authorization header provided",
  ])("recognises %j as an auth error", (msg) => {
    expect(isAuthError(new Error(msg))).toBe(true);
  });

  it("recognises raw strings and Response-like errors", () => {
    expect(isAuthError("401 Unauthorized")).toBe(true);
    expect(isAuthError({ toString: () => "JWT expired" })).toBe(true);
  });

  it("does NOT flag unrelated errors", () => {
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
    expect(isAuthError(new Error("Network error"))).toBe(false);
    expect(isAuthError(new Error("Row not found"))).toBe(false);
    expect(isAuthError(new Error("500 Internal Server Error"))).toBe(false);
  });
});

describe("authAwareRetry", () => {
  it("returns false immediately for auth errors, regardless of count", () => {
    const err = new Error("JWT expired");
    expect(authAwareRetry(0, err)).toBe(false);
    expect(authAwareRetry(1, err)).toBe(false);
    expect(authAwareRetry(5, err)).toBe(false);
  });

  it("retries non-auth errors up to 2 attempts, then stops", () => {
    const err = new Error("Network error");
    expect(authAwareRetry(0, err)).toBe(true);
    expect(authAwareRetry(1, err)).toBe(true);
    expect(authAwareRetry(2, err)).toBe(false);
  });
});

describe("React Query with authAwareRetry on a JWT-expired 401", () => {
  it("calls the query fn exactly once and surfaces the error without retrying", async () => {
    const queryFn = vi.fn(async () => {
      throw new Error("Unauthorized: JWT expired (401)");
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: authAwareRetry, retryDelay: 0 } },
    });

    const observer = new QueryObserver(qc, {
      queryKey: ["portal-auth-guard-test"],
      queryFn,
      retry: authAwareRetry,
      retryDelay: 0,
    });

    const errored = await new Promise<Error>((resolve) => {
      const unsub = observer.subscribe((res) => {
        if (res.status === "error") {
          unsub();
          resolve(res.error as Error);
        }
      });
    });

    expect(errored.message).toMatch(/401|unauthorized|jwt expired/i);
    // The critical invariant: no retry storm on a 401. Exactly one call
    // means `usePortalAuthGuard` sees the auth error immediately and can
    // redirect to /auth without waiting for retry backoff to elapse.
    expect(queryFn).toHaveBeenCalledTimes(1);

    qc.clear();
  });

  it("still retries a transient non-auth error (baseline sanity)", async () => {
    let calls = 0;
    const queryFn = vi.fn(async () => {
      calls += 1;
      throw new Error("Network error");
    });

    const qc = new QueryClient();
    const observer = new QueryObserver(qc, {
      queryKey: ["portal-auth-guard-test-network"],
      queryFn,
      retry: authAwareRetry,
      retryDelay: 0,
    });

    await new Promise<void>((resolve) => {
      const unsub = observer.subscribe((res) => {
        if (res.status === "error") {
          unsub();
          resolve();
        }
      });
    });

    // authAwareRetry returns true for count<2 → initial + 2 retries = 3.
    expect(calls).toBe(3);
    qc.clear();
  });
});

describe("installAuthErrorCanceller", () => {
  /**
   * The sweeper subscribes to the QueryCache. The instant any query state
   * transitions to an auth-error, it must cancel every OTHER in-flight
   * query — even ones the page component never passed to the guard hook.
   * This is what prevents a late-arriving 401 fetch from hitting the
   * cleared session and causing follow-up cache writes / error toasts.
   */
  it("cancels a slow in-flight query the moment a peer query 401s", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: authAwareRetry, retryDelay: 0 },
      },
    });
    const unsub = installAuthErrorCanceller(qc);

    // Slow query — resolves via signal.abort() when cancelled.
    let slowResolved = false;
    const slowFn = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>((resolve, reject) => {
          const t = setTimeout(() => {
            slowResolved = true;
            resolve("ok");
          }, 500);
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        }),
    );

    // Fast query — 401s immediately.
    const fastFn = vi.fn(async () => {
      throw new Error("401 Unauthorized: JWT expired");
    });

    const slowObs = new QueryObserver(qc, {
      queryKey: ["sweeper-slow"],
      queryFn: slowFn,
      retry: authAwareRetry,
      retryDelay: 0,
    });
    const fastObs = new QueryObserver(qc, {
      queryKey: ["sweeper-fast"],
      queryFn: fastFn,
      retry: authAwareRetry,
      retryDelay: 0,
    });

    // Kick both queries off.
    const slowUnsub = slowObs.subscribe(() => {});
    const fastUnsub = fastObs.subscribe(() => {});

    // Wait long enough for the 401 to land and the sweeper to fire.
    await new Promise((r) => setTimeout(r, 50));

    slowUnsub();
    fastUnsub();
    unsub();

    // The sweeper marked itself as triggered.
    expect(unsub.triggered).toBe(true);
    // The slow queryFn was started but its promise never got to resolve
    // — the cancel signal fired before the 500ms timer.
    expect(slowFn).toHaveBeenCalledTimes(1);
    expect(slowResolved).toBe(false);
    expect(fastFn).toHaveBeenCalledTimes(1);

    qc.clear();
  });

  it("is idempotent: only sweeps once even when many queries 401 in a burst", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: authAwareRetry, retryDelay: 0 },
      },
    });
    const cancelSpy = vi.spyOn(qc, "cancelQueries");
    const clearSpy = vi.spyOn(qc, "clear");
    const unsub = installAuthErrorCanceller(qc);

    const observers = Array.from({ length: 5 }, (_, i) => {
      const fn = vi.fn(async () => {
        throw new Error(`Unauthorized #${i} (401)`);
      });
      const obs = new QueryObserver(qc, {
        queryKey: ["sweeper-burst", i],
        queryFn: fn,
        retry: authAwareRetry,
        retryDelay: 0,
      });
      const off = obs.subscribe(() => {});
      return { fn, off };
    });

    await new Promise((r) => setTimeout(r, 40));
    observers.forEach((o) => o.off());
    unsub();

    // Every queryFn ran exactly once (no retry storm).
    for (const o of observers) expect(o.fn).toHaveBeenCalledTimes(1);
    // But the sweeper only performed its cleanup one time despite five
    // separate auth-error notifications.
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    cancelSpy.mockRestore();
    clearSpy.mockRestore();
    qc.clear();
  });

  it("ignores non-auth query errors", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: authAwareRetry, retryDelay: 0 },
      },
    });
    const unsub = installAuthErrorCanceller(qc);

    const fn = vi.fn(async () => {
      throw new Error("Row not found");
    });
    const obs = new QueryObserver(qc, {
      queryKey: ["sweeper-non-auth"],
      queryFn: fn,
      retry: false,
    });
    const off = obs.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 20));
    off();
    unsub();

    expect(unsub.triggered).toBe(false);
    qc.clear();
  });
});

describe("Parallel 401 fan-out", () => {
  /**
   * A portal page typically fires several queries in parallel (context +
   * list + related lookups). If the session expires, every one of them
   * will 401 at roughly the same moment.
   *
   * The invariants under test:
   *   1. Each queryFn runs EXACTLY ONCE — `authAwareRetry` blocks the
   *      retry storm that would otherwise fire (N queries × 3 attempts)
   *      after the cleared session.
   *   2. Even though N observers surface an auth error, the redirect
   *      side effect (modelled as `usePortalAuthGuard`'s effect) fires
   *      EXACTLY ONCE — the guard depends on a single `authFailed`
   *      boolean derived from `errors.some(isAuthError)`, so any later
   *      error transitions don't re-trigger it.
   */
  it("runs each 401 queryFn once and triggers a single redirect", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: authAwareRetry, retryDelay: 0 } },
    });

    // Four independent queries — matches the shape of tenant.portal.index
    // (ctx + charges + methods) or owner.portal.index (ctx + statements)
    // when a mutation error is also in play.
    const keys = ["ctx", "charges", "methods", "tickets"] as const;
    const fns = Object.fromEntries(
      keys.map((k) => [
        k,
        vi.fn(async () => {
          throw new Error(`Unauthorized: JWT expired on ${k} (401)`);
        }),
      ]),
    ) as Record<(typeof keys)[number], ReturnType<typeof vi.fn>>;

    // Track how many times the derived `authFailed` boolean flips
    // false → true. That flip is what `usePortalAuthGuard`'s useEffect
    // observes; a second flip would mean a second redirect.
    const errors: Array<unknown> = keys.map(() => undefined);
    let authFailed = false;
    let redirectFires = 0;
    const recomputeGuard = () => {
      const next = errors.some(isAuthError);
      if (next && !authFailed) redirectFires += 1;
      authFailed = next;
    };

    const settled: Array<Promise<void>> = [];
    keys.forEach((k, idx) => {
      const observer = new QueryObserver(qc, {
        queryKey: ["parallel-401", k],
        queryFn: fns[k],
        retry: authAwareRetry,
        retryDelay: 0,
      });
      settled.push(
        new Promise<void>((resolve) => {
          const unsub = observer.subscribe((res) => {
            errors[idx] = res.error;
            recomputeGuard();
            if (res.status === "error") {
              unsub();
              resolve();
            }
          });
        }),
      );
    });

    await Promise.all(settled);
    // Give the microtask queue a tick in case any late notifications land.
    await new Promise((r) => setTimeout(r, 20));

    // 1. No retry storm — one call per query, four queries, four calls.
    for (const k of keys) {
      expect(fns[k], `${k} should be called exactly once`).toHaveBeenCalledTimes(1);
    }

    // 2. Every query surfaced the auth error to the guard's `errors` array.
    expect(errors.every(isAuthError)).toBe(true);

    // 3. The redirect effect fires exactly once, no matter how many
    //    observers subsequently transition into the error state.
    expect(redirectFires).toBe(1);

    qc.clear();
  });

  it("still fires the guard once when only one of many queries 401s", async () => {
    // Realistic mixed failure: ctx succeeds, one dependent query 401s,
    // the others are still loading. `errors.some(isAuthError)` must flip
    // true and stay true; the redirect must not depend on all queries
    // failing.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: authAwareRetry, retryDelay: 0 } },
    });

    const okFn = vi.fn(async () => ({ ok: true }));
    const authFn = vi.fn(async () => {
      throw new Error("401 Unauthorized");
    });

    let authFailed = false;
    let redirectFires = 0;
    const errors: Array<unknown> = [undefined, undefined];
    const recompute = () => {
      const next = errors.some(isAuthError);
      if (next && !authFailed) redirectFires += 1;
      authFailed = next;
    };

    const okObs = new QueryObserver(qc, {
      queryKey: ["mixed-ok"],
      queryFn: okFn,
      retry: authAwareRetry,
      retryDelay: 0,
    });
    const authObs = new QueryObserver(qc, {
      queryKey: ["mixed-401"],
      queryFn: authFn,
      retry: authAwareRetry,
      retryDelay: 0,
    });

    const okDone = new Promise<void>((resolve) => {
      const unsub = okObs.subscribe((res) => {
        errors[0] = res.error;
        recompute();
        if (res.status === "success") { unsub(); resolve(); }
      });
    });
    const authDone = new Promise<void>((resolve) => {
      const unsub = authObs.subscribe((res) => {
        errors[1] = res.error;
        recompute();
        if (res.status === "error") { unsub(); resolve(); }
      });
    });

    await Promise.all([okDone, authDone]);
    await new Promise((r) => setTimeout(r, 20));

    expect(okFn).toHaveBeenCalledTimes(1);
    expect(authFn).toHaveBeenCalledTimes(1);
    expect(redirectFires).toBe(1);

    qc.clear();
  });
});