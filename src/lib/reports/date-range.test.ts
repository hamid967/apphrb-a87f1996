import { describe, it, expect } from "vitest";
import { validateDateRange } from "./date-range";

const MIN = "2026-01-01";
const MAX = "2026-12-31";

describe("validateDateRange", () => {
  it("accepts a valid range within bounds", () => {
    const v = validateDateRange("2026-03-01", "2026-03-31", MIN, MAX);
    expect(v).toEqual({ fromError: "", toError: "", ok: true });
  });

  it("rejects empty from", () => {
    const v = validateDateRange("", "2026-03-01", MIN, MAX);
    expect(v.ok).toBe(false);
    expect(v.fromError).toBe("حدد تاريخ البداية");
  });

  it("rejects empty to", () => {
    const v = validateDateRange("2026-03-01", "", MIN, MAX);
    expect(v.ok).toBe(false);
    expect(v.toError).toBe("حدد تاريخ النهاية");
  });

  it("rejects from > to with a specific message", () => {
    const v = validateDateRange("2026-06-01", "2026-03-01", MIN, MAX);
    expect(v.ok).toBe(false);
    expect(v.fromError).toBe("تاريخ البداية يجب ألا يكون بعد تاريخ النهاية");
    expect(v.toError).toBe("");
  });

  it("rejects from earlier than minISO", () => {
    const v = validateDateRange("2025-12-01", "2026-03-01", MIN, MAX);
    expect(v.ok).toBe(false);
    expect(v.fromError).toContain("يسبق أقدم بيانات متاحة");
    expect(v.fromError).toContain(MIN);
  });

  it("rejects to later than maxISO (no future dates)", () => {
    const v = validateDateRange("2026-06-01", "2027-01-15", MIN, MAX);
    expect(v.ok).toBe(false);
    expect(v.toError).toContain("لا يمكن أن يكون في المستقبل");
    expect(v.toError).toContain(MAX);
  });

  it("allows equal from and to (single day)", () => {
    const v = validateDateRange("2026-05-05", "2026-05-05", MIN, MAX);
    expect(v.ok).toBe(true);
  });

  it("allows boundary values (from=min, to=max)", () => {
    const v = validateDateRange(MIN, MAX, MIN, MAX);
    expect(v.ok).toBe(true);
  });
});
