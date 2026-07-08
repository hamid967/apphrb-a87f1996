import { describe, it, expect, beforeEach } from "vitest";
import {
  submitCorrectedExpenseClaimImpl,
  correctionSchema,
} from "@/lib/expense-claims.functions";

// ---------- tiny Supabase mock ----------

type Insert = Record<string, unknown>;

function makeSupabase(originalLookup: { data: Record<string, unknown> | null; error: unknown }) {
  const captured: { lastInsert: Insert | null } = { lastInsert: null };
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          const chain: Record<string, unknown> = {};
          chain.eq = () => chain;
          chain.maybeSingle = async () => originalLookup;
          return chain;
        },
        insert(payload: Insert) {
          captured.lastInsert = payload;
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "new-1",
                  claim_number: "EC-TEST-1",
                  status: payload.status,
                  submitted_at: payload.submitted_at,
                  original_claim_id: payload.original_claim_id ?? null,
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };
  return { client, captured };
}

const ORG = "00000000-0000-0000-0000-000000000001";
const ORIG = "00000000-0000-0000-0000-000000000010";
const USER = "00000000-0000-0000-0000-0000000000aa";

function baseInput(overrides: Partial<Parameters<typeof submitCorrectedExpenseClaimImpl>[2]> = {}) {
  return correctionSchema.parse({
    org_id: ORG,
    original_claim_id: ORIG,
    title: "Client dinner (fixed)",
    amount: 250,
    category: "travel",
    correction_reason: "Wrong category — this was travel.",
    currency: "SAR",
    ...overrides,
  });
}

describe("submitCorrectedExpenseClaimImpl", () => {
  let sb: ReturnType<typeof makeSupabase>;

  beforeEach(() => {
    sb = makeSupabase({
      data: { id: ORIG, org_id: ORG, submitted_by: USER },
      error: null,
    });
  });

  it("inserts with status='corrected' and links original_claim_id", async () => {
    const row = await submitCorrectedExpenseClaimImpl(sb.client, USER, baseInput());
    expect(sb.captured.lastInsert).toBeTruthy();
    expect(sb.captured.lastInsert!.status).toBe("corrected");
    expect(sb.captured.lastInsert!.original_claim_id).toBe(ORIG);
    expect(sb.captured.lastInsert!.submitted_by).toBe(USER);
    expect(sb.captured.lastInsert!.correction_reason).toBe("Wrong category — this was travel.");
    expect(sb.captured.lastInsert!.amount).toBe(250);
    expect(sb.captured.lastInsert!.category).toBe("travel");
    // Return value mirrors the new status + linkage
    expect((row as { status: string }).status).toBe("corrected");
    expect((row as { original_claim_id: string }).original_claim_id).toBe(ORIG);
  });

  it("rejects when the original belongs to a different org", async () => {
    sb = makeSupabase({
      data: { id: ORIG, org_id: "different-org", submitted_by: USER },
      error: null,
    });
    await expect(
      submitCorrectedExpenseClaimImpl(sb.client, USER, baseInput()),
    ).rejects.toThrow(/org_mismatch/);
  });

  it("rejects when the caller does not own the original", async () => {
    sb = makeSupabase({
      data: { id: ORIG, org_id: ORG, submitted_by: "someone-else" },
      error: null,
    });
    await expect(
      submitCorrectedExpenseClaimImpl(sb.client, USER, baseInput()),
    ).rejects.toThrow(/not_owner/);
  });

  it("rejects when the original is missing", async () => {
    sb = makeSupabase({ data: null, error: null });
    await expect(
      submitCorrectedExpenseClaimImpl(sb.client, USER, baseInput()),
    ).rejects.toThrow(/original_not_found/);
  });
});

describe("correctionSchema validation", () => {
  it("requires a reason with at least 4 characters", () => {
    const r = correctionSchema.safeParse({
      org_id: ORG,
      original_claim_id: ORIG,
      title: "x correction",
      amount: 10,
      category: "other",
      correction_reason: "no",
      currency: "SAR",
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-positive amounts", () => {
    const r = correctionSchema.safeParse({
      org_id: ORG,
      original_claim_id: ORIG,
      title: "x correction",
      amount: 0,
      category: "other",
      correction_reason: "valid reason",
      currency: "SAR",
    });
    expect(r.success).toBe(false);
  });

  it("requires a valid uuid for original_claim_id (deep-link ?original=)", () => {
    const r = correctionSchema.safeParse({
      org_id: ORG,
      original_claim_id: "not-a-uuid",
      title: "x correction",
      amount: 10,
      category: "other",
      correction_reason: "valid reason",
      currency: "SAR",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a well-formed correction payload", () => {
    const r = correctionSchema.safeParse({
      org_id: ORG,
      original_claim_id: ORIG,
      title: "Client dinner (fixed)",
      amount: 250,
      category: "travel",
      correction_reason: "Wrong category.",
      currency: "SAR",
    });
    expect(r.success).toBe(true);
  });
});