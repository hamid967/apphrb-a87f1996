import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- Chainable Supabase mock ----------

type FakeResult = { data: unknown; error: unknown; count?: number | null };
type BuilderCall = {
  table: string;
  filters: Array<[string, string, unknown]>;
  or: string[];
  order?: [string, unknown];
  range?: [number, number];
  limit?: number;
  select?: string;
  selectOpts?: unknown;
};

const listResults = new Map<string, FakeResult>();
const singleResults = new Map<string, FakeResult>();
const calls: BuilderCall[] = [];

function reset() {
  listResults.clear();
  singleResults.clear();
  calls.length = 0;
}

function makeBuilder(table: string) {
  const call: BuilderCall = { table, filters: [], or: [] };
  calls.push(call);
  const listKey = () => `${table}`;
  const single = () =>
    Promise.resolve(singleResults.get(table) ?? { data: null, error: null });
  const list = () =>
    Promise.resolve(
      listResults.get(listKey()) ?? { data: [], error: null, count: 0 },
    );

  const b: Record<string, unknown> = {
    select: (cols: string, opts?: unknown) => {
      call.select = cols;
      call.selectOpts = opts;
      return b;
    },
    eq: (c: string, v: unknown) => {
      call.filters.push(["eq", c, v]);
      return b;
    },
    is: (c: string, v: unknown) => {
      call.filters.push(["is", c, v]);
      return b;
    },
    in: (c: string, v: unknown) => {
      call.filters.push(["in", c, v]);
      return b;
    },
    gte: (c: string, v: unknown) => {
      call.filters.push(["gte", c, v]);
      return b;
    },
    lt: (c: string, v: unknown) => {
      call.filters.push(["lt", c, v]);
      return b;
    },
    or: (expr: string) => {
      call.or.push(expr);
      return b;
    },
    order: (c: string, opts?: unknown) => {
      call.order = [c, opts];
      return b;
    },
    range: (from: number, to: number) => {
      call.range = [from, to];
      return b;
    },
    limit: (n: number) => {
      call.limit = n;
      return b;
    },
    maybeSingle: () => single(),
    then: (onF: (v: FakeResult) => unknown, onR?: (e: unknown) => unknown) =>
      list().then(onF, onR),
  };
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (t: string) => makeBuilder(t) }),
}));

// Env required by supabaseForUser()
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-anon-key";

// ---------- Imports after mock ----------
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "11111111-1111-1111-1111-111111111111";

import listProperties from "./list-properties";
import listBranches from "./list-branches";
import listPendingTickets from "./list-pending-tickets";

type Ctx = {
  isAuthenticated: () => boolean;
  getToken: () => string | undefined;
  getUserId: () => string | undefined;
};

function ctx(): Ctx {
  return {
    isAuthenticated: () => true,
    getToken: () => "tkn",
    getUserId: () => USER_ID,
  };
}

function seedOrg() {
  singleResults.set("organization_members", {
    data: { org_id: ORG_ID },
    error: null,
  });
}

// Narrow types for assertions on the structured payload.
type UnifiedItem = {
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  date: string | null;
  meta: Record<string, unknown>;
  raw: Record<string, unknown>;
};
type ListPayload = {
  structuredContent: {
    entity: string;
    page: number;
    page_size: number;
    total: number | null;
    has_more: boolean;
    count: number;
    items: UnifiedItem[];
  };
};

beforeEach(() => {
  reset();
  seedOrg();
});

// ============================================================
// list_properties
// ============================================================
describe("list_properties MCP tool", () => {
  const invoke = (args: Record<string, unknown>) =>
    // deno-lint-ignore no-explicit-any
    (listProperties.handler as any)(args, ctx()) as Promise<ListPayload>;

  it("returns the unified item shape for each row", async () => {
    listResults.set("properties", {
      data: [
        {
          id: "p1",
          title_ar: "شقة",
          title_en: "Apt",
          property_type: "apartment",
          listing_type: "rent",
          status: "available",
          city: "Riyadh",
          price: 1000,
          currency: "SAR",
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
      error: null,
      count: 1,
    });
    const res = await invoke({ page: 1, page_size: 20 });
    const item = res.structuredContent.items[0];
    expect(Object.keys(item).sort()).toEqual(
      ["date", "id", "meta", "raw", "status", "subtitle", "title"].sort(),
    );
    expect(item.title).toBe("شقة");
    expect(item.subtitle).toBe("apartment · Riyadh");
    expect(item.status).toBe("available");
    expect(item.meta).toEqual({ listing_type: "rent", price: 1000, currency: "SAR" });
    expect(res.structuredContent.entity).toBe("properties");
    expect(res.structuredContent.total).toBe(1);
    expect(res.structuredContent.has_more).toBe(false);
  });

  it("applies pagination via .range() and forwards page/page_size", async () => {
    listResults.set("properties", { data: [], error: null, count: 0 });
    await invoke({ page: 3, page_size: 10 });
    const call = calls.find((c) => c.table === "properties")!;
    expect(call.range).toEqual([20, 29]); // (3-1)*10 .. from+size-1
    expect(call.selectOpts).toMatchObject({ count: "exact" });
  });

  it("adds an ilike OR clause across title_ar/title_en/city when q is provided", async () => {
    listResults.set("properties", { data: [], error: null, count: 0 });
    await invoke({ page: 1, page_size: 20, q: "Riyadh" });
    const call = calls.find((c) => c.table === "properties")!;
    expect(call.or).toHaveLength(1);
    expect(call.or[0]).toContain("title_ar.ilike.%Riyadh%");
    expect(call.or[0]).toContain("title_en.ilike.%Riyadh%");
    expect(call.or[0]).toContain("city.ilike.%Riyadh%");
  });

  it("computes has_more from total vs page*page_size", async () => {
    listResults.set("properties", {
      data: Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`,
        title_ar: null,
        title_en: null,
        property_type: null,
        listing_type: null,
        status: null,
        city: null,
        price: null,
        currency: null,
        created_at: null,
      })),
      error: null,
      count: 55,
    });
    const res = await invoke({ page: 1, page_size: 20 });
    expect(res.structuredContent.has_more).toBe(true);
    expect(res.structuredContent.count).toBe(20);
  });
});

// ============================================================
// list_branches
// ============================================================
describe("list_branches MCP tool", () => {
  const invoke = (args: Record<string, unknown>) =>
    // deno-lint-ignore no-explicit-any
    (listBranches.handler as any)(args, ctx()) as Promise<ListPayload>;

  it("returns the unified shape and embeds departments in meta", async () => {
    listResults.set("branches", {
      data: [{ id: "b1", name: "Main", phone: "555", address: "Street 1", created_at: "2025-01-01T00:00:00Z" }],
      error: null,
      count: 1,
    });
    listResults.set("departments", {
      data: [
        { id: "d1", name: "Sales", branch_id: "b1" },
        { id: "d2", name: "Ops", branch_id: "b1" },
        { id: "d3", name: "Other", branch_id: "b-other" },
      ],
      error: null,
      count: null,
    });
    const res = await invoke({ page: 1, page_size: 20 });
    const item = res.structuredContent.items[0];
    expect(item.title).toBe("Main");
    expect(item.subtitle).toBe("Street 1");
    expect(item.date).toBe("2025-01-01T00:00:00Z");
    expect(item.meta).toEqual({
      phone: "555",
      departments: [
        { id: "d1", name: "Sales" },
        { id: "d2", name: "Ops" },
      ],
    });
    expect(res.structuredContent.entity).toBe("branches");
  });

  it("passes q through an ilike OR over name/address and paginates", async () => {
    listResults.set("branches", { data: [], error: null, count: 0 });
    await invoke({ page: 2, page_size: 5, q: "main" });
    const branchCall = calls.find((c) => c.table === "branches")!;
    expect(branchCall.range).toEqual([5, 9]);
    expect(branchCall.or[0]).toBe("name.ilike.%main%,address.ilike.%main%");
  });

  it("skips the departments query when no branches match", async () => {
    listResults.set("branches", { data: [], error: null, count: 0 });
    const res = await invoke({ page: 1, page_size: 20 });
    expect(res.structuredContent.items).toEqual([]);
    expect(calls.some((c) => c.table === "departments")).toBe(false);
  });
});

// ============================================================
// list_pending_tickets
// ============================================================
describe("list_pending_tickets MCP tool", () => {
  const invoke = (args: Record<string, unknown>) =>
    // deno-lint-ignore no-explicit-any
    (listPendingTickets.handler as any)(args, ctx()) as Promise<ListPayload>;

  it("maps support rows to the unified shape", async () => {
    listResults.set("tickets", {
      data: [
        {
          id: "t1",
          ticket_number: "T-100",
          subject: "Cannot log in",
          status: "open",
          priority: "high",
          category: "auth",
          channel: "web",
          requester_id: "u1",
          assignee_id: "u2",
          sla_due_at: "2025-02-01T00:00:00Z",
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
      error: null,
      count: 1,
    });
    const res = await invoke({ type: "support", page: 1, page_size: 20 });
    const item = res.structuredContent.items[0];
    expect(item.title).toBe("Cannot log in");
    expect(item.subtitle).toBe("T-100 · auth");
    expect(item.status).toBe("open");
    expect(item.meta).toMatchObject({
      priority: "high",
      sla_due_at: "2025-02-01T00:00:00Z",
      channel: "web",
    });
    expect(res.structuredContent.entity).toBe("support tickets");
  });

  it("maps maintenance rows and filters mine_only via created_by", async () => {
    listResults.set("maintenance_tickets", {
      data: [
        {
          id: "m1",
          ticket_no: "M-1",
          title: "Fix AC",
          status: "in_progress",
          priority: "medium",
          property_id: "prop1",
          technician_id: "tech1",
          scheduled_at: "2025-03-01T00:00:00Z",
          cost: 200,
          currency: "SAR",
          created_at: "2025-02-01T00:00:00Z",
        },
      ],
      error: null,
      count: 1,
    });
    const res = await invoke({
      type: "maintenance",
      page: 1,
      page_size: 20,
      mine_only: true,
    });
    const item = res.structuredContent.items[0];
    expect(item.title).toBe("Fix AC");
    expect(item.subtitle).toBe("M-1 · medium");
    expect(item.meta).toMatchObject({
      priority: "medium",
      scheduled_at: "2025-03-01T00:00:00Z",
      property_id: "prop1",
    });

    const call = calls.find((c) => c.table === "maintenance_tickets")!;
    expect(call.filters).toContainEqual(["eq", "created_by", USER_ID]);
  });

  it("maps expense claims, prefers submitted_at for date, and applies date window", async () => {
    listResults.set("expense_claims", {
      data: [
        {
          id: "c1",
          claim_number: "C-1",
          title: "Taxi",
          status: "submitted",
          category: "travel",
          amount: 42,
          currency: "SAR",
          submitted_by: USER_ID,
          submitted_at: "2025-04-10T00:00:00Z",
          created_at: "2025-04-09T00:00:00Z",
        },
      ],
      error: null,
      count: 1,
    });
    const res = await invoke({
      type: "expense_claim",
      page: 1,
      page_size: 20,
      since: "2025-04-01T00:00:00Z",
      until: "2025-05-01T00:00:00Z",
      q: "Tax",
    });
    const item = res.structuredContent.items[0];
    expect(item.title).toBe("Taxi");
    expect(item.subtitle).toBe("C-1 · travel");
    expect(item.date).toBe("2025-04-10T00:00:00Z");
    expect(item.meta).toMatchObject({ amount: 42, currency: "SAR" });

    const call = calls.find((c) => c.table === "expense_claims")!;
    expect(call.filters).toContainEqual(["gte", "created_at", "2025-04-01T00:00:00Z"]);
    expect(call.filters).toContainEqual(["lt", "created_at", "2025-05-01T00:00:00Z"]);
    expect(call.or[0]).toBe("title.ilike.%Tax%,claim_number.ilike.%Tax%");
  });

  it("uses the default open-status set when status is omitted", async () => {
    listResults.set("tickets", { data: [], error: null, count: 0 });
    await invoke({ type: "support", page: 1, page_size: 20 });
    const call = calls.find((c) => c.table === "tickets")!;
    const inFilter = call.filters.find(([op, col]) => op === "in" && col === "status");
    expect(inFilter?.[2]).toEqual([
      "new",
      "open",
      "pending",
      "in_progress",
      "waiting",
    ]);
  });

  it("paginates with .range() using (page-1)*size .. from+size-1", async () => {
    listResults.set("expense_claims", { data: [], error: null, count: 0 });
    await invoke({ type: "expense_claim", page: 4, page_size: 15 });
    const call = calls.find((c) => c.table === "expense_claims")!;
    expect(call.range).toEqual([45, 59]);
  });
});
