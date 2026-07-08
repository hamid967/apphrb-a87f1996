/**
 * Integration tests for the 7 automation scripts on Hamid assistant:
 * add_expense, schedule_meeting, create_lead, assign_task,
 * record_payment, search_units, search_contacts.
 *
 * Covers: happy path, permission denial (audit log DENIED),
 * DB error handling, and audit trail assertions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildAssistantTools } from "@/lib/assistant-tools.server";

// ------- Mock Supabase client -------
type Row = Record<string, unknown>;
type TableBehavior = {
  insertResult?: { data?: Row | null; error?: { message: string } | null };
  updateResult?: { data?: Row | null; error?: { message: string } | null };
  selectResult?: { data?: Row[] | null; error?: { message: string } | null };
};

type AuditEntry = { action: string; diff: Record<string, unknown> };

function createMockSupabase(tables: Record<string, TableBehavior> = {}) {
  const audits: AuditEntry[] = [];
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};

  function chain(table: string, mode: "select" | "insert" | "update") {
    const behavior = tables[table] ?? {};
    const api: any = {
      _mode: mode,
      select: () => api,
      eq: () => api,
      is: () => api,
      lt: () => api,
      lte: () => api,
      gte: () => api,
      ilike: () => api,
      or: () => api,
      order: () => api,
      limit: () => api,
      single: async () => {
        if (mode === "insert") return behavior.insertResult ?? { data: { id: "new-id" }, error: null };
        if (mode === "update") return behavior.updateResult ?? { data: { id: "u-id" }, error: null };
        return { data: null, error: null };
      },
      then: (resolve: (v: unknown) => void) => {
        if (mode === "select") resolve(behavior.selectResult ?? { data: [], error: null });
        else if (mode === "insert") resolve(behavior.insertResult ?? { data: null, error: null });
        else resolve(behavior.updateResult ?? { data: null, error: null });
      },
    };
    return api;
  }

  return {
    audits,
    inserts,
    updates,
    from(table: string) {
      return {
        select: () => chain(table, "select"),
        insert: (row: Row) => {
          (inserts[table] ||= []).push(row);
          return chain(table, "insert");
        },
        update: (row: Row) => {
          (updates[table] ||= []).push(row);
          return chain(table, "update");
        },
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "log_assistant_access") {
        audits.push({ action: String(args._action), diff: (args._diff as any) ?? {} });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  } as any;
}

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

function ctx(role: string, supabase: ReturnType<typeof createMockSupabase>) {
  return { supabase, orgId: "org-1", orgRole: role, userId: "user-1" };
}

function auditActions(supabase: ReturnType<typeof createMockSupabase>) {
  return supabase.audits.map((a: AuditEntry) => a.action);
}

// ---------- add_expense ----------
describe("add_expense", () => {
  it("inserts expense and writes ASSISTANT_ACTION audit for elevated role", async () => {
    const sb = createMockSupabase({
      expenses: { insertResult: { data: { id: "e-1", amount: 500, category: "utilities", spent_at: "2026-01-01" }, error: null } },
    });
    const tools = buildAssistantTools(ctx("finance", sb));
    const res: any = await tools.add_expense.execute({ amount: 500, category: "utilities" }, {} as any);
    expect(res.ok).toBe(true);
    expect(res.expense.id).toBe("e-1");
    expect(sb.inserts.expenses[0]).toMatchObject({ org_id: "org-1", amount: 500, currency: "SAR", created_by: "user-1" });
    expect(auditActions(sb)).toContain("ASSISTANT_ACTION");
  });

  it("denies non-elevated role and logs ASSISTANT_TOOL_DENIED", async () => {
    const sb = createMockSupabase();
    const tools = buildAssistantTools(ctx("agent", sb));
    const res: any = await tools.add_expense.execute({ amount: 100, category: "utilities" }, {} as any);
    expect(res.code).toBe("forbidden_role");
    expect(auditActions(sb)).toContain("ASSISTANT_TOOL_DENIED");
    expect(sb.inserts.expenses).toBeUndefined();
  });

  it("returns db error message on insert failure", async () => {
    const sb = createMockSupabase({
      expenses: { insertResult: { data: null, error: { message: "constraint violated" } } },
    });
    const tools = buildAssistantTools(ctx("admin", sb));
    const res: any = await tools.add_expense.execute({ amount: 10, category: "x" }, {} as any);
    expect(res.error).toBe("constraint violated");
  });
});

// ---------- schedule_meeting ----------
describe("schedule_meeting", () => {
  it("schedules meeting for staff role", async () => {
    const sb = createMockSupabase({
      meetings: { insertResult: { data: { id: "m-1", title: "Sync" }, error: null } },
    });
    const tools = buildAssistantTools(ctx("agent", sb));
    const res: any = await tools.schedule_meeting.execute(
      { title: "Sync", starts_at: "2026-02-01T10:00:00Z" }, {} as any,
    );
    expect(res.ok).toBe(true);
    expect(sb.inserts.meetings[0]).toMatchObject({ organizer_id: "user-1", title: "Sync" });
    expect(auditActions(sb)).toContain("ASSISTANT_ACTION");
  });

  it("rejects invalid starts_at", async () => {
    const sb = createMockSupabase();
    const tools = buildAssistantTools(ctx("admin", sb));
    const res: any = await tools.schedule_meeting.execute(
      { title: "Bad", starts_at: "not-a-date" }, {} as any,
    );
    expect(res.error).toMatch(/starts_at/);
  });

  it("denies tenant role", async () => {
    const sb = createMockSupabase();
    const tools = buildAssistantTools(ctx("tenant", sb));
    const res: any = await tools.schedule_meeting.execute(
      { title: "X", starts_at: "2026-02-01T10:00:00Z" }, {} as any,
    );
    expect(res.code).toBe("forbidden_role");
    expect(auditActions(sb)).toContain("ASSISTANT_TOOL_DENIED");
  });
});

// ---------- create_lead ----------
describe("create_lead", () => {
  it("creates lead with default stage", async () => {
    const sb = createMockSupabase({
      leads: { insertResult: { data: { id: "l-1", stage: "new" }, error: null } },
    });
    const tools = buildAssistantTools(ctx("agent", sb));
    const res: any = await tools.create_lead.execute({ contact_id: UUID }, {} as any);
    expect(res.ok).toBe(true);
    expect(sb.inserts.leads[0]).toMatchObject({ contact_id: UUID, stage: "new", created_by: "user-1" });
    expect(auditActions(sb)).toContain("ASSISTANT_ACTION");
  });

  it("bubbles up DB error", async () => {
    const sb = createMockSupabase({
      leads: { insertResult: { data: null, error: { message: "fk missing" } } },
    });
    const tools = buildAssistantTools(ctx("admin", sb));
    const res: any = await tools.create_lead.execute({ contact_id: UUID }, {} as any);
    expect(res.error).toBe("fk missing");
  });
});

// ---------- assign_task ----------
describe("assign_task", () => {
  it("assigns task for manager", async () => {
    const sb = createMockSupabase({
      tasks: { updateResult: { data: { id: UUID, title: "T", assignee_id: UUID2 }, error: null } },
    });
    const tools = buildAssistantTools(ctx("manager", sb));
    const res: any = await tools.assign_task.execute({ task_id: UUID, assignee_id: UUID2 }, {} as any);
    expect(res.ok).toBe(true);
    expect(sb.updates.tasks[0]).toEqual({ assignee_id: UUID2 });
    expect(auditActions(sb)).toContain("ASSISTANT_ACTION");
  });

  it("denies finance role (not owner/admin/manager)", async () => {
    const sb = createMockSupabase();
    const tools = buildAssistantTools(ctx("finance", sb));
    const res: any = await tools.assign_task.execute({ task_id: UUID, assignee_id: UUID2 }, {} as any);
    expect(res.code).toBe("forbidden_role");
    expect(auditActions(sb)).toContain("ASSISTANT_TOOL_DENIED");
  });
});

// ---------- record_payment ----------
describe("record_payment", () => {
  it("records payment for finance role", async () => {
    const sb = createMockSupabase({
      payments: { insertResult: { data: { id: "p-1", amount: 1000, status: "paid", paid_at: new Date().toISOString() }, error: null } },
    });
    const tools = buildAssistantTools(ctx("finance", sb));
    const res: any = await tools.record_payment.execute({ amount: 1000 }, {} as any);
    expect(res.ok).toBe(true);
    expect(sb.inserts.payments[0]).toMatchObject({ amount: 1000, status: "paid", currency_code: "SAR" });
    expect(auditActions(sb)).toContain("ASSISTANT_ACTION");
  });

  it("denies manager role (not owner/admin/finance)", async () => {
    const sb = createMockSupabase();
    const tools = buildAssistantTools(ctx("manager", sb));
    const res: any = await tools.record_payment.execute({ amount: 100 }, {} as any);
    expect(res.code).toBe("forbidden_role");
    expect(auditActions(sb)).toContain("ASSISTANT_TOOL_DENIED");
  });

  it("returns error on DB failure", async () => {
    const sb = createMockSupabase({
      payments: { insertResult: { data: null, error: { message: "invalid tenant" } } },
    });
    const tools = buildAssistantTools(ctx("owner", sb));
    const res: any = await tools.record_payment.execute({ amount: 1 }, {} as any);
    expect(res.error).toBe("invalid tenant");
  });
});

// ---------- search_units ----------
describe("search_units", () => {
  it("returns units and audits ASSISTANT_TOOL_CALL", async () => {
    const sb = createMockSupabase({
      units: { selectResult: { data: [{ id: "u-1", code: "A101", status: "vacant" }], error: null } },
    });
    const tools = buildAssistantTools(ctx("agent", sb));
    const res: any = await tools.search_units.execute({ status: "vacant" }, {} as any);
    expect(res.count).toBe(1);
    expect(res.units[0].code).toBe("A101");
    expect(auditActions(sb)).toContain("ASSISTANT_TOOL_CALL");
  });

  it("returns error on DB failure", async () => {
    const sb = createMockSupabase({
      units: { selectResult: { data: null, error: { message: "query failed" } } },
    });
    const tools = buildAssistantTools(ctx("agent", sb));
    const res: any = await tools.search_units.execute({}, {} as any);
    expect(res.error).toBe("query failed");
  });
});

// ---------- search_contacts ----------
describe("search_contacts", () => {
  it("returns contacts and audits ASSISTANT_TOOL_CALL", async () => {
    const sb = createMockSupabase({
      contacts: { selectResult: { data: [{ id: "c-1", full_name: "Ali" }], error: null } },
    });
    const tools = buildAssistantTools(ctx("agent", sb));
    const res: any = await tools.search_contacts.execute({ q: "Ali" }, {} as any);
    expect(res.count).toBe(1);
    expect(auditActions(sb)).toContain("ASSISTANT_TOOL_CALL");
  });

  it("returns error on DB failure", async () => {
    const sb = createMockSupabase({
      contacts: { selectResult: { data: null, error: { message: "boom" } } },
    });
    const tools = buildAssistantTools(ctx("agent", sb));
    const res: any = await tools.search_contacts.execute({ q: "xx" }, {} as any);
    expect(res.error).toBe("boom");
  });
});