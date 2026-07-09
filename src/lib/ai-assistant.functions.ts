import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

// ============= TOOL IMPLEMENTATIONS =============
// All tools scoped to org_id via RLS (uses requireSupabaseAuth context)

type Ctx = { supabase: SupabaseClient; orgId: string };

async function revenueSummary({ supabase, orgId }: Ctx, args: { months?: number }) {
  const months = args.months ?? 6;
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const { data } = await supabase
    .from("payments")
    .select("amount, currency_code, paid_at, status")
    .eq("org_id", orgId)
    .gte("paid_at", since.toISOString())
    .eq("status", "paid")
    .is("deleted_at", null);
  const byMonth: Record<string, number> = {};
  let total = 0;
  for (const p of data ?? []) {
    const k = String(p.paid_at).slice(0, 7);
    byMonth[k] = (byMonth[k] ?? 0) + Number(p.amount);
    total += Number(p.amount);
  }
  return {
    total_paid: total,
    currency: data?.[0]?.currency_code ?? "SAR",
    by_month: byMonth,
    count: data?.length ?? 0,
  };
}

async function overduePayments({ supabase, orgId }: Ctx) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("rent_charges")
    .select("id, tenant_id, amount, currency, due_date, status")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .lt("due_date", today)
    .order("due_date")
    .limit(50);
  const total = (data ?? []).reduce((s, r: any) => s + Number(r.amount), 0);
  return { count: data?.length ?? 0, total_overdue: total, sample: (data ?? []).slice(0, 10) };
}

async function expiringContracts({ supabase, orgId }: Ctx, args: { days?: number }) {
  const days = args.days ?? 60;
  const end = new Date();
  end.setDate(end.getDate() + days);
  const { data } = await supabase
    .from("contracts")
    .select("id, contract_number, tenant_id, unit_id, end_date, amount, currency_code, status")
    .eq("org_id", orgId)
    .eq("status", "active")
    .lte("end_date", end.toISOString().slice(0, 10))
    .is("deleted_at", null)
    .order("end_date")
    .limit(50);
  return { count: data?.length ?? 0, contracts: data ?? [] };
}

async function expenseSummary({ supabase, orgId }: Ctx, args: { months?: number }) {
  const months = args.months ?? 6;
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const { data } = await supabase
    .from("expenses")
    .select("amount, currency, category, spent_at")
    .eq("org_id", orgId)
    .gte("spent_at", since.toISOString().slice(0, 10));
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of data ?? []) {
    const k = String(e.category ?? "other");
    byCategory[k] = (byCategory[k] ?? 0) + Number(e.amount);
    total += Number(e.amount);
  }
  return { total, by_category: byCategory, count: data?.length ?? 0 };
}

async function occupancySnapshot({ supabase, orgId }: Ctx) {
  const { data: units } = await supabase
    .from("units")
    .select("id, status")
    .eq("org_id", orgId)
    .is("deleted_at", null);
  const total = units?.length ?? 0;
  const occupied = (units ?? []).filter(
    (u: any) => u.status === "occupied" || u.status === "rented",
  ).length;
  return {
    total_units: total,
    occupied,
    vacant: total - occupied,
    occupancy_pct: total ? +((occupied * 100) / total).toFixed(1) : 0,
  };
}

async function rentForecast(ctx: Ctx, args: { months?: number }) {
  // Simple: sum of active contracts monthly amounts × months
  const months = args.months ?? 3;
  const { data } = await ctx.supabase
    .from("contracts")
    .select("amount, currency_code, end_date")
    .eq("org_id", ctx.orgId)
    .eq("status", "active")
    .is("deleted_at", null);
  let monthly = 0;
  const today = new Date();
  for (const c of data ?? []) {
    const endsInMonths = c.end_date
      ? Math.max(
          0,
          Math.ceil(
            (new Date(c.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30),
          ),
        )
      : months;
    if (endsInMonths >= 1) monthly += Number(c.amount);
  }
  return {
    monthly_projected: monthly,
    horizon_months: months,
    total_projected: monthly * months,
    currency: data?.[0]?.currency_code ?? "SAR",
  };
}

async function riskAnalysis(ctx: Ctx) {
  const [overdue, expiring, occ] = await Promise.all([
    overduePayments(ctx),
    expiringContracts(ctx, { days: 60 }),
    occupancySnapshot(ctx),
  ]);
  const risks: { level: string; area: string; detail: string }[] = [];
  if (overdue.total_overdue > 0)
    risks.push({
      level: overdue.count > 10 ? "high" : "medium",
      area: "cashflow",
      detail: `${overdue.count} overdue charges, ${overdue.total_overdue} due`,
    });
  if (expiring.count > 0)
    risks.push({
      level: expiring.count > 5 ? "high" : "medium",
      area: "retention",
      detail: `${expiring.count} contracts expiring in 60 days`,
    });
  if (occ.occupancy_pct < 80)
    risks.push({ level: "medium", area: "occupancy", detail: `${occ.occupancy_pct}% occupancy` });
  return { risks, summary: { ...overdue, ...expiring, ...occ } };
}

async function suggestRentPrice(
  { supabase, orgId }: Ctx,
  args: { unit_id?: string; city?: string },
) {
  let q = supabase
    .from("units")
    .select("id, monthly_rent, bedrooms, bathrooms, area, status, property_id")
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (args.city) q = q.eq("city", args.city);
  const { data: units } = await q.limit(500);
  const rents = (units ?? [])
    .map((u: any) => Number(u.monthly_rent))
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  if (!rents.length) return { suggestion: null, reason: "no comparable units" };
  const median = rents[Math.floor(rents.length / 2)];
  const p75 = rents[Math.floor(rents.length * 0.75)];
  return {
    suggestion_range: [Math.round(median * 0.95), Math.round(p75)],
    median,
    sample_size: rents.length,
  };
}

async function employeePerformance({ supabase, orgId }: Ctx) {
  const { data: deals } = await supabase
    .from("deals")
    .select("assigned_to, status, amount")
    .eq("org_id", orgId);
  const perAgent: Record<string, { deals: number; won: number; value: number }> = {};
  for (const d of deals ?? []) {
    const k = String(d.assigned_to ?? "unassigned");
    perAgent[k] ??= { deals: 0, won: 0, value: 0 };
    perAgent[k].deals++;
    if (d.status === "won" || d.status === "closed_won") {
      perAgent[k].won++;
      perAgent[k].value += Number(d.amount ?? 0);
    }
  }
  return { agents: perAgent };
}

async function summarizeSystem(ctx: Ctx) {
  const [rev, exp, occ, over] = await Promise.all([
    revenueSummary(ctx, { months: 1 }),
    expenseSummary(ctx, { months: 1 }),
    occupancySnapshot(ctx),
    overduePayments(ctx),
  ]);
  return {
    revenue_last_month: rev.total_paid,
    expenses_last_month: exp.total,
    occupancy_pct: occ.occupancy_pct,
    overdue_total: over.total_overdue,
    overdue_count: over.count,
  };
}

async function cashFlowSummary(ctx: Ctx, args: { months?: number }) {

  const months = args.months ?? 6;
  const [rev, exp] = await Promise.all([
    revenueSummary(ctx, { months }),
    expenseSummary(ctx, { months }),
  ]);
  const revByMonth = rev.by_month ?? {};
  const expByCat = exp.by_category ?? {};
  const net = (rev.total_paid ?? 0) - (exp.total ?? 0);
  return {
    months,
    revenue_total: rev.total_paid ?? 0,
    expense_total: exp.total ?? 0,
    net_cash_flow: net,
    margin_pct: rev.total_paid ? +((net * 100) / rev.total_paid).toFixed(1) : 0,
    revenue_by_month: revByMonth,
    expense_by_category: expByCat,
    currency: rev.currency ?? "SAR",
  };
}

async function maintenanceBacklog({ supabase, orgId }: Ctx) {
  const { data } = await supabase
    .from("maintenance_tickets")
    .select("id, status, priority, created_at")
    .eq("org_id", orgId)
    .not("status", "in", "(closed,resolved,cancelled)")
    .order("created_at", { ascending: true })
    .limit(500);
  const now = Date.now();
  const rows = data ?? [];
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let overdue7 = 0;
  let overdue30 = 0;
  for (const r of rows as any[]) {
    byStatus[r.status ?? "unknown"] = (byStatus[r.status ?? "unknown"] ?? 0) + 1;
    byPriority[r.priority ?? "normal"] = (byPriority[r.priority ?? "normal"] ?? 0) + 1;
    const ageDays = r.created_at
      ? (now - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    if (ageDays > 30) overdue30++;
    else if (ageDays > 7) overdue7++;
  }
  return {
    open_count: rows.length,
    by_status: byStatus,
    by_priority: byPriority,
    aging_gt_7_days: overdue7,
    aging_gt_30_days: overdue30,
  };
}

async function vacantUnitsList({ supabase, orgId }: Ctx, args: { limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
  const { data } = await supabase
    .from("units")
    .select("id, unit_number, monthly_rent, status, property_id, updated_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .in("status", ["vacant", "available"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  const rows = (data ?? []) as any[];
  const potential = rows.reduce((s, u) => s + Number(u.monthly_rent ?? 0), 0);
  const now = Date.now();
  const enriched = rows.map((u) => ({
    ...u,
    days_vacant: u.updated_at
      ? Math.floor((now - new Date(u.updated_at).getTime()) / (1000 * 60 * 60 * 24))
      : null,
  }));
  return {
    vacant_count: rows.length,
    potential_monthly_revenue: potential,
    units: enriched,
  };
}

const TOOLS: Record<string, (ctx: Ctx, args: any) => Promise<any>> = {
  revenue_summary: revenueSummary,
  overdue_payments: overduePayments,
  expiring_contracts: expiringContracts,
  expense_summary: expenseSummary,
  occupancy_snapshot: occupancySnapshot,
  rent_forecast: rentForecast,
  risk_analysis: riskAnalysis,
  suggest_rent_price: suggestRentPrice,
  employee_performance: employeePerformance,
  summarize_system: summarizeSystem,
  cash_flow_summary: cashFlowSummary,
  maintenance_backlog: maintenanceBacklog,
  vacant_units_list: vacantUnitsList,
};


// Role-based access: sensitive financial/HR tools require elevated org role.
// RLS still enforces data scoping; this adds an explicit deny + audit for
// forbidden tool attempts before any query is issued.
const SENSITIVE_TOOLS = new Set([
  "revenue_summary",
  "expense_summary",
  "overdue_payments",
  "rent_forecast",
  "risk_analysis",
  "employee_performance",
  "summarize_system",
  "cash_flow_summary",

]);
const ELEVATED_ROLES = new Set(["owner", "admin", "manager", "finance"]);

const TOOL_SCHEMAS = [
  {
    name: "revenue_summary",
    description: "Sum of paid revenue grouped by month.",
    params: {
      type: "object",
      properties: { months: { type: "number", description: "Lookback months, default 6" } },
    },
  },
  {
    name: "overdue_payments",
    description: "List and total of overdue rent charges.",
    params: { type: "object", properties: {} },
  },
  {
    name: "expiring_contracts",
    description: "Active contracts ending within N days (default 60).",
    params: { type: "object", properties: { days: { type: "number" } } },
  },
  {
    name: "expense_summary",
    description: "Total expenses grouped by category over N months.",
    params: { type: "object", properties: { months: { type: "number" } } },
  },
  {
    name: "occupancy_snapshot",
    description: "Current unit occupancy stats.",
    params: { type: "object", properties: {} },
  },
  {
    name: "rent_forecast",
    description: "Forecast rental revenue for the next N months.",
    params: { type: "object", properties: { months: { type: "number" } } },
  },
  {
    name: "risk_analysis",
    description: "Aggregate risks across cashflow, retention, and occupancy.",
    params: { type: "object", properties: {} },
  },
  {
    name: "suggest_rent_price",
    description: "Suggest a rent price range for a unit or city based on comparables.",
    params: {
      type: "object",
      properties: { unit_id: { type: "string" }, city: { type: "string" } },
    },
  },
  {
    name: "employee_performance",
    description: "Deal counts and won value per assigned agent.",
    params: { type: "object", properties: {} },
  },
  {
    name: "summarize_system",
    description: "High-level KPIs for a dashboard: revenue, expenses, occupancy, overdue.",
    params: { type: "object", properties: {} },
  },
];

// ============= SERVER FUNCTION =============

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
  threadId: z.string().uuid().optional(),
});

// ------- Shared helpers reused by the auto dashboard -------

async function resolveOrgCtx(supabase: SupabaseClient, userId: string) {
  const { data: mem } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  const orgId = mem?.org_id as string | undefined;
  const orgRole = String(mem?.role ?? "");
  if (!orgId) throw new Error("No organization for user");
  return { orgId, orgRole };
}

async function auditRpc(
  supabase: SupabaseClient,
  orgId: string,
  action: string,
  diff: Record<string, unknown>,
) {
  try {
    await supabase.rpc("log_assistant_access", {
      _org: orgId,
      _action: action,
      _diff: diff as any,
    });
  } catch {
    /* audit never breaks the caller */
  }
}

const ALLOWED_TOOL_NAMES = TOOL_SCHEMAS.map((t) => t.name) as [string, ...string[]];

// ------- Recommend an editable dashboard layout from KPIs -------

export const recommendDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const { orgId, orgRole } = await resolveOrgCtx(context.supabase, context.userId);

    const allowed = TOOL_SCHEMAS.filter(
      (t) => !SENSITIVE_TOOLS.has(t.name) || ELEVATED_ROLES.has(orgRole),
    );

    const sys =
      "أنت مساعد يقترح لوحة KPIs. أعد JSON فقط بالشكل " +
      `{"widgets":[{"id":"w1","title":"...","tool":"<one_of_tools>","args":{},"displayField":"<key_from_result_or_empty>","size":"sm|md|lg"}]}` +
      ` استخدم فقط أدوات من: ${allowed.map((t) => t.name).join(", ")}. اقترح 4 إلى 8 widgets متنوعة (إيرادات، إشغال، مخاطر، مصروفات...).`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: "اقترح لوحة KPIs أولية لهذه المؤسسة." },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 402) throw new Error("نفدت الأرصدة، يرجى الشحن.");
    if (res.status === 429) throw new Error("تم تجاوز حد الطلبات، حاول لاحقاً.");
    if (!res.ok) throw new Error(`AI request failed: ${res.status}`);
    const json = await res.json();
    let parsed: any = {};
    try {
      parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? "{}");
    } catch {}
    const widgets = Array.isArray(parsed?.widgets) ? parsed.widgets : [];
    const cleaned = widgets
      .filter((w: any) => allowed.some((t) => t.name === w?.tool))
      .slice(0, 12)
      .map((w: any, i: number) => ({
        id: String(w.id || `w${i + 1}`),
        title: String(w.title || w.tool),
        tool: String(w.tool),
        args: w.args && typeof w.args === "object" ? w.args : {},
        displayField: typeof w.displayField === "string" ? w.displayField : "",
        size: ["sm", "md", "lg"].includes(w.size) ? w.size : "md",
        visible: true,
      }));

    await auditRpc(context.supabase, orgId, "DASHBOARD_RECOMMEND", {
      widget_count: cleaned.length,
      role: orgRole,
    });
    return { widgets: cleaned };
  });

// ------- Execute a single dashboard widget's tool (RBAC + audit) -------

const RunToolSchema = z.object({
  name: z.enum(ALLOWED_TOOL_NAMES),
  args: z.record(z.any()).optional(),
});

export const runDashboardTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RunToolSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { orgId, orgRole } = await resolveOrgCtx(context.supabase, context.userId);
    const impl = TOOLS[data.name];
    if (!impl) throw new Error("Unknown tool");
    if (SENSITIVE_TOOLS.has(data.name) && !ELEVATED_ROLES.has(orgRole)) {
      await auditRpc(context.supabase, orgId, "DASHBOARD_TOOL_DENIED", { tool: data.name });
      throw new Error(`forbidden: your role (${orgRole || "member"}) cannot access ${data.name}`);
    }
    const result = await impl({ supabase: context.supabase, orgId }, data.args ?? {});
    await auditRpc(context.supabase, orgId, "DASHBOARD_TOOL_CALL", { tool: data.name });
    return { result };
  });

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { data: mem } = await context.supabase
      .from("organization_members")
      .select("org_id, role")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    const orgId = mem?.org_id;
    const orgRole = String(mem?.role ?? "");
    if (!orgId) throw new Error("No organization for user");
    const toolCtx: Ctx = { supabase: context.supabase, orgId };

    const auditAccess = async (action: string, diff: Record<string, unknown>) => {
      try {
        await context.supabase.rpc("log_assistant_access", {
          _org: orgId,
          _action: action,
          _diff: diff as any,
        });
      } catch {
        // never let audit failures break the chat
      }
    };

    await auditAccess("ASSISTANT_REQUEST", {
      thread_id: data.threadId ?? null,
      role: orgRole,
      message_preview: (data.messages.at(-1)?.content ?? "").slice(0, 200),
    });

    // Persist the last user message to the thread if provided
    const lastUser = [...data.messages].reverse().find((m) => m.role === "user");
    if (data.threadId && lastUser) {
      await context.supabase.from("assistant_messages").insert({
        thread_id: data.threadId,
        role: "user",
        content: lastUser.content,
      });
      // Auto-title empty threads on first user turn
      const { data: t } = await context.supabase
        .from("assistant_threads")
        .select("title")
        .eq("id", data.threadId)
        .maybeSingle();
      if (t && (t.title === "محادثة جديدة" || !t.title)) {
        await context.supabase
          .from("assistant_threads")
          .update({ title: lastUser.content.slice(0, 60) })
          .eq("id", data.threadId);
      }
    }

    const system =
      "أنت مساعد ذكي داخل نظام Aqari لإدارة العقارات. أجب دائماً باللغة العربية بأسلوب واضح ومختصر. " +
      "استخدم الأدوات المتاحة لقراءة البيانات الفعلية قبل الإجابة على أي سؤال يتطلب أرقاماً أو تحليلاً. " +
      "بعد تنفيذ الأدوات، لخّص النتائج في نقاط، اقترح إجراءات عملية، واحسب النسب عند الحاجة. " +
      "عند طلب رسائل عملاء أو إشعارات، صُغها بلغة رسمية ومناسبة ثقافياً. " +
      "لا تخترع أرقاماً؛ إذا لم تعثر على البيانات صرّح بذلك.";

    const messages: any[] = [{ role: "system", content: system }, ...data.messages];
    const tools = TOOL_SCHEMAS.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.params },
    }));

    // Tool loop (up to 5 iterations)
    for (let iter = 0; iter < 5; iter++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools,
          tool_choice: "auto",
        }),
      });
      if (res.status === 429) throw new Error("تم تجاوز حد الطلبات، حاول لاحقاً.");
      if (res.status === 402) throw new Error("نفدت الأرصدة، يرجى الشحن.");
      if (!res.ok)
        throw new Error(`AI request failed: ${res.status} ${await res.text().catch(() => "")}`);
      const json = await res.json();
      const msg = json?.choices?.[0]?.message;
      if (!msg) throw new Error("AI empty response");

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        const reply = String(msg.content ?? "");
        if (data.threadId && reply) {
          await context.supabase.from("assistant_messages").insert({
            thread_id: data.threadId,
            role: "assistant",
            content: reply,
          });
          await context.supabase
            .from("assistant_threads")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", data.threadId);
        }
        return { reply, iterations: iter + 1 };
      }

      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
      for (const call of toolCalls) {
        const name = call?.function?.name;
        let args: any = {};
        try {
          args = JSON.parse(call?.function?.arguments ?? "{}");
        } catch {}
        const impl = TOOLS[name];
        const allowed = !!impl && (!SENSITIVE_TOOLS.has(name) || ELEVATED_ROLES.has(orgRole));
        let result: any;
        if (!impl) {
          result = { error: `Unknown tool: ${name}` };
        } else if (!allowed) {
          result = { error: `forbidden: your role (${orgRole || "member"}) cannot access ${name}` };
          await auditAccess("ASSISTANT_TOOL_DENIED", { tool: name, args, role: orgRole });
        } else {
          try {
            result = await impl(toolCtx, args);
            await auditAccess("ASSISTANT_TOOL_CALL", { tool: name, args });
          } catch (e: any) {
            result = { error: e.message ?? String(e) };
            await auditAccess("ASSISTANT_TOOL_ERROR", { tool: name, args, error: result.error });
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return { reply: "تعذّر إتمام التحليل ضمن الحد المسموح من الخطوات.", iterations: 5 };
  });
