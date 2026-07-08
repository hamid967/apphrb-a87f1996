import { describe, expect, it } from "vitest";
import {
  HOUR_WINDOW_OPTIONS,
  windowInput,
  topFiltersInput,
  topPathsInput,
  getFilterAnalyticsOverview,
  getFilterAnalyticsHourly,
  getFilterAnalyticsTopFilters,
  getFilterAnalyticsTopPaths,
  getFilterAnalyticsHealth,
} from "./admin-filter-analytics.functions";

/**
 * Unit coverage for the admin filter-analytics server-fn module.
 *
 * The RPC round-trip and 403-without-AAL2 behaviour are validated by
 * `tests/e2e/admin-fn-requires-aal2.spec.py` (auth middleware) and
 * `tests/e2e/admin-filter-analytics.spec.py` (page + KPI render).
 * Here we lock in what vitest can prove without a live worker: the
 * Zod input contract, the enumerated windows, and the public shape.
 */

describe("admin-filter-analytics input contracts", () => {
  it("accepts every documented window (1/24/72/168h) and produces the same number", () => {
    for (const h of HOUR_WINDOW_OPTIONS) {
      expect(windowInput.parse({ hours: h }).hours).toBe(h);
    }
  });

  it.each([0, 2, 6, 12, 48, 169, 336, -1, 1.5, Number.NaN])(
    "rejects non-enumerated window: %s",
    (h) => {
      expect(() => windowInput.parse({ hours: h })).toThrow();
    },
  );

  it("rejects non-numeric hours", () => {
    expect(() => windowInput.parse({ hours: "24" as unknown as number })).toThrow();
    expect(() => windowInput.parse({})).toThrow();
  });

  it("top-filters limit defaults to 20 and is clamped to [1, 50]", () => {
    expect(topFiltersInput.parse({ hours: 24 }).limit).toBe(20);
    expect(topFiltersInput.parse({ hours: 24, limit: 1 }).limit).toBe(1);
    expect(topFiltersInput.parse({ hours: 24, limit: 50 }).limit).toBe(50);
    expect(() => topFiltersInput.parse({ hours: 24, limit: 0 })).toThrow();
    expect(() => topFiltersInput.parse({ hours: 24, limit: 51 })).toThrow();
    expect(() => topFiltersInput.parse({ hours: 24, limit: 1.5 })).toThrow();
  });

  it("top-paths limit defaults to 10 and is clamped to [1, 50]", () => {
    expect(topPathsInput.parse({ hours: 168 }).limit).toBe(10);
    expect(topPathsInput.parse({ hours: 168, limit: 25 }).limit).toBe(25);
    expect(() => topPathsInput.parse({ hours: 168, limit: 0 })).toThrow();
    expect(() => topPathsInput.parse({ hours: 168, limit: 51 })).toThrow();
  });

  it("top-*/window-input reject an invalid hours value even when the limit is fine", () => {
    expect(() => topFiltersInput.parse({ hours: 10, limit: 5 })).toThrow();
    expect(() => topPathsInput.parse({ hours: 10, limit: 5 })).toThrow();
  });
});

describe("admin-filter-analytics exports", () => {
  it("exposes all five server functions as callables", () => {
    // Server fns are opaque callables in the client bundle; assert only the
    // public contract the page depends on: they exist and can be invoked.
    for (const fn of [
      getFilterAnalyticsOverview,
      getFilterAnalyticsHourly,
      getFilterAnalyticsTopFilters,
      getFilterAnalyticsTopPaths,
      getFilterAnalyticsHealth,
    ]) {
      expect(typeof fn).toBe("function");
    }
  });
});