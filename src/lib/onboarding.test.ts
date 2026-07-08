import { describe, it, expect } from "vitest";
import { computeNextOnboarding } from "./onboarding.functions";

const NOW = new Date("2026-07-06T00:00:00.000Z");

describe("computeNextOnboarding (backfill for pre-existing users)", () => {
  it("marks first_receipt AND backfills profile+company when the user has a full_name and org membership → onboarding completes", () => {
    const { next, completed } = computeNextOnboarding({
      current: {},
      step: "first_receipt",
      done: true,
      fullName: "Ahmed",
      hasCompany: true,
      now: NOW,
    });
    expect(next.profile?.done).toBe(true);
    expect(next.company?.done).toBe(true);
    expect(next.first_receipt?.done).toBe(true);
    expect(completed).toBe(true);
  });

  it("does NOT complete when the user has no org membership — company step stays missing", () => {
    const { next, completed } = computeNextOnboarding({
      current: {},
      step: "first_receipt",
      done: true,
      fullName: "Ahmed",
      hasCompany: false,
      now: NOW,
    });
    expect(next.company?.done).toBeUndefined();
    expect(completed).toBe(false);
  });

  it("does NOT complete when the user has no full_name — profile step stays missing", () => {
    const { next, completed } = computeNextOnboarding({
      current: {},
      step: "first_receipt",
      done: true,
      fullName: null,
      hasCompany: true,
      now: NOW,
    });
    expect(next.profile?.done).toBeUndefined();
    expect(completed).toBe(false);
  });

  it("preserves existing progress entries and does not overwrite their timestamps", () => {
    const existing = { profile: { done: true, at: "2020-01-01T00:00:00.000Z" } };
    const { next } = computeNextOnboarding({
      current: existing,
      step: "first_receipt",
      done: true,
      fullName: "Ahmed",
      hasCompany: true,
      now: NOW,
    });
    expect(next.profile?.at).toBe("2020-01-01T00:00:00.000Z");
  });

  it("supports undoing a step (done=false removes it)", () => {
    const { next, completed } = computeNextOnboarding({
      current: { first_receipt: { done: true, at: "x" } },
      step: "first_receipt",
      done: false,
      fullName: "Ahmed",
      hasCompany: true,
      now: NOW,
    });
    expect(next.first_receipt).toBeUndefined();
    expect(completed).toBe(false);
  });
});
