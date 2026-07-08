import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

type Ctx = {
  supabase: SupabaseClient;
  orgId: string;
  orgRole: string;
  userId: string;
  tenantId?: string | null;
};

const ELEVATED = new Set(["owner", "admin", "manager", "finance"]);
const WRITE_BASIC = new Set(["owner", "admin", "manager", "finance", "agent", "staff"]);
const isElevated = (role: string) => ELEVATED.has(role);
const canWriteBasic = (role: string) => WRITE_BASIC.has(role);

type Denial = {
  error: string;
  code: "forbidden_role" | "field_not_allowed" | "value_out_of_range";
  tool: string;
  role: string;
  reason: string;
  allowed_roles?: string[];
  restricted_fields?: string[];
  allowed_fields?: string[];
};

async function audit(ctx: Ctx, action: string, diff: Record<string, unknown>) {
  try {
    await ctx.supabase.rpc("log_assistant_access", {
      _org: ctx.orgId,
      _action: action,
      _diff: diff as any,
    });
  } catch {
    /* audit never breaks the chat */
  }
}

function forbid(ctx: Ctx, name: string, allowedRoles: string[] = [...ELEVATED]): Denial {
  const role = ctx.orgRole || "member";
  const reason = `دورك الحالي (${role}) لا يملك صلاحية استدعاء «${name}». الأدوار المسموح لها: ${allowedRoles.join("، ")}.`;
  audit(ctx, "ASSISTANT_TOOL_DENIED", {
    tool: name,
    role,
    code: "forbidden_role",
    allowed_roles: allowedRoles,
  });
  return {
    error: reason,
    code: "forbidden_role",
    tool: name,
    role,
    reason,
    allowed_roles: allowedRoles,
  };
}

function fieldDenial(
  ctx: Ctx,
  name: string,
  restricted: string[],
  allowed: string[],
  reason: string,
): Denial {
  const role = ctx.orgRole || "member";
  audit(ctx, "ASSISTANT_TOOL_DENIED", {
    tool: name,
    role,
    code: "field_not_allowed",
    restricted_fields: restricted,
  });
  return {
    error: `حقول غير مسموح بها لدورك (${role}): ${restricted.join("، ")}. ${reason}`,
    code: "field_not_allowed",
    tool: name,
    role,
    reason,
    restricted_fields: restricted,
    allowed_fields: allowed,
  };
}

export function buildAssistantTools(ctx: Ctx) {
  const { supabase, orgId } = ctx;
  const isTenant = ctx.orgRole === "tenant" && !!ctx.tenantId;

  const requireSuperAdmin = async (name: string) => {
    const { data } = await supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "super_admin" as any,
    });
    if (data === true) return null;
    return forbid(ctx, name, ["super_admin"]);
  };

  return {
    revenue_summary: tool({
      description: "ملخص الإيرادات المدفوعة مجمّعة حسب الشهر خلال آخر N شهر.",
      inputSchema: z.object({ months: z.number().int().min(1).max(24).optional() }),
      execute: async ({ months }) => {
        if (!isElevated(ctx.orgRole)) return forbid(ctx, "revenue_summary");
        const m = months ?? 6;
        const since = new Date();
        since.setMonth(since.getMonth() - m);
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
        audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "revenue_summary", months: m });
        return {
          total_paid: total,
          currency: data?.[0]?.currency_code ?? "SAR",
          by_month: byMonth,
          count: data?.length ?? 0,
        };
      },
    }),

    overdue_payments: tool({
      description: "قائمة وإجمالي رسوم الإيجار المتأخرة.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!isElevated(ctx.orgRole)) return forbid(ctx, "overdue_payments");
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
        audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "overdue_payments" });
        return {
          count: data?.length ?? 0,
          total_overdue: total,
          sample: (data ?? []).slice(0, 10),
        };
      },
    }),

    expiring_contracts: tool({
      description: "العقود النشطة التي ستنتهي خلال N يوم (الافتراضي 60).",
      inputSchema: z.object({ days: z.number().int().min(1).max(365).optional() }),
      execute: async ({ days }) => {
        const d = days ?? 60;
        const end = new Date();
        end.setDate(end.getDate() + d);
        const { data } = await supabase
          .from("contracts")
          .select(
            "id, contract_number, tenant_id, unit_id, end_date, amount, currency_code, status",
          )
          .eq("org_id", orgId)
          .eq("status", "active")
          .lte("end_date", end.toISOString().slice(0, 10))
          .is("deleted_at", null)
          .order("end_date")
          .limit(50);
        audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "expiring_contracts", days: d });
        return { count: data?.length ?? 0, contracts: data ?? [] };
      },
    }),

    expense_summary: tool({
      description: "إجمالي المصروفات مجمّعة حسب الفئة خلال آخر N شهر.",
      inputSchema: z.object({ months: z.number().int().min(1).max(24).optional() }),
      execute: async ({ months }) => {
        if (!isElevated(ctx.orgRole)) return forbid(ctx, "expense_summary");
        const m = months ?? 6;
        const since = new Date();
        since.setMonth(since.getMonth() - m);
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
        audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "expense_summary", months: m });
        return { total, by_category: byCategory, count: data?.length ?? 0 };
      },
    }),

    occupancy_snapshot: tool({
      description: "لقطة حالية لإشغال الوحدات.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data: units } = await supabase
          .from("units")
          .select("id, status")
          .eq("org_id", orgId)
          .is("deleted_at", null);
        const total = units?.length ?? 0;
        const occupied = (units ?? []).filter(
          (u: any) => u.status === "occupied" || u.status === "rented",
        ).length;
        audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "occupancy_snapshot" });
        return {
          total_units: total,
          occupied,
          vacant: total - occupied,
          occupancy_pct: total ? +((occupied * 100) / total).toFixed(1) : 0,
        };
      },
    }),

    // ========= ACTIONS (write) =========
    create_task: tool({
      description:
        "أنشئ مهمة داخل النظام. القيود حسب الدور: agent/staff — بدون أولوية 'high'، وصف حتى 500 حرف، ومدة الاستحقاق خلال 30 يوماً. الأدوار المرتفعة (owner/admin/manager/finance) بلا قيود.",
      inputSchema: z.object({
        title: z.string().min(2).max(200),
        description: z.string().max(2000).optional(),
        due_date: z.string().describe("YYYY-MM-DD").optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
      }),
      execute: async ({ title, description, due_date, priority }) => {
        const role = ctx.orgRole || "member";
        if (!canWriteBasic(role)) {
          return forbid(ctx, "create_task", [...WRITE_BASIC]);
        }
        const elevated = isElevated(role);
        const allowedFields = elevated
          ? ["title", "description", "due_date", "priority"]
          : ["title", "description(≤500)", "due_date(≤30d)", "priority(low|medium)"];

        if (!elevated) {
          const bad: string[] = [];
          if (priority === "high") bad.push("priority=high");
          if (description && description.length > 500) bad.push("description>500");
          if (due_date) {
            const d = new Date(due_date).getTime();
            const max = Date.now() + 30 * 24 * 60 * 60 * 1000;
            if (isNaN(d) || d > max) bad.push("due_date>30d");
          }
          if (bad.length) {
            return fieldDenial(
              ctx,
              "create_task",
              bad,
              allowedFields,
              "الحد الأدنى للامتيازات: عدّل القيم ضمن الحدود المسموح بها أو اطلب مستخدماً برتبة أعلى.",
            );
          }
        }

        const { data, error } = await supabase
          .from("tasks")
          .insert({
            org_id: orgId,
            title,
            description: description ?? null,
            due_at: due_date ? new Date(due_date).toISOString() : null,
            priority: priority ?? "medium",
            status: "open",
            created_by: ctx.userId,
          })
          .select("id, title, due_at, priority")
          .single();
        if (error) {
          await audit(ctx, "ASSISTANT_ACTION_ERROR", {
            action: "create_task",
            error: error.message,
          });
          return { error: error.message };
        }
        await audit(ctx, "ASSISTANT_ACTION", {
          action: "create_task",
          task_id: data?.id,
          title,
          role,
        });
        return {
          ok: true,
          task: data,
          allowed_fields: allowedFields,
          role,
          message: `تم إنشاء المهمة: ${title}`,
        };
      },
    }),

    send_reminder: tool({
      description:
        "سجّل تذكيراً بالدفع لمستأجر (يظهر في سجل النشاط). متاح فقط لـ owner/admin/manager/finance. الحد الأقصى للرسالة 500 حرف لغير owner/admin.",
      inputSchema: z.object({
        tenant_id: z.string().uuid(),
        message: z.string().min(3).max(1000),
      }),
      execute: async ({ tenant_id, message }) => {
        const role = ctx.orgRole || "member";
        if (!isElevated(role)) return forbid(ctx, "send_reminder", [...ELEVATED]);
        const isTopLevel = role === "owner" || role === "admin";
        const allowedFields = isTopLevel
          ? ["tenant_id", "message(≤1000)"]
          : ["tenant_id", "message(≤500)"];
        if (!isTopLevel && message.length > 500) {
          return fieldDenial(
            ctx,
            "send_reminder",
            ["message>500"],
            allowedFields,
            "الرسائل الأطول من 500 حرف مقصورة على owner/admin.",
          );
        }
        const { error } = await supabase.from("logs").insert({
          org_id: orgId,
          level: "info",
          message: `Reminder to tenant ${tenant_id}: ${message}`,
          source: "assistant",
          meta: { source: "assistant", tenant_id, message } as any,
        });
        if (error) return { error: error.message };
        await audit(ctx, "ASSISTANT_ACTION", { action: "send_reminder", tenant_id, role });
        return { ok: true, allowed_fields: allowedFields, role, message: "تم تسجيل التذكير." };
      },
    }),

    // ========= SUPER ADMIN =========
    get_platform_stats: tool({
      description:
        "إحصاءات المنصة على مستوى النظام (عدد الشركات، المستخدمين، الاشتراكات النشطة، الإيصالات المعلّقة). متاح فقط لسوبر أدمن.",
      inputSchema: z.object({}),
      execute: async () => {
        const denied = await requireSuperAdmin("get_platform_stats");
        if (denied) return denied;
        const [orgs, users, subs, pending] = await Promise.all([
          supabase.from("organizations").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase
            .from("subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("status", "active"),
          supabase
            .from("subscription_payments")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        ]);
        await audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "get_platform_stats" });
        return {
          organizations: orgs.count ?? 0,
          users: users.count ?? 0,
          active_subscriptions: subs.count ?? 0,
          pending_receipts: pending.count ?? 0,
          link: "/admin",
        };
      },
    }),

    get_pending_receipts: tool({
      description:
        "قائمة إيصالات الاشتراكات المعلّقة في انتظار الموافقة (تحويلات بنكية يدوية). متاح فقط لسوبر أدمن.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      execute: async ({ limit }) => {
        const denied = await requireSuperAdmin("get_pending_receipts");
        if (denied) return denied;
        const n = limit ?? 20;
        const { data, error } = await supabase
          .from("subscription_payments")
          .select(
            "id, org_id, amount, currency, bank_name, bank_reference, transferred_at, receipt_url, note, created_at",
          )
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(n);
        if (error) return { error: error.message };
        const total = (data ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
        await audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "get_pending_receipts", limit: n });
        return {
          count: data?.length ?? 0,
          total_pending: total,
          receipts: data ?? [],
          link: "/admin/subscriptions",
        };
      },
    }),

    // ========= AUTOMATION SCRIPTS =========
    add_expense: tool({
      description:
        "سجّل مصروفاً جديداً. متاح لـ owner/admin/manager/finance. اعرض الملخص واستأذن قبل الإنشاء.",
      inputSchema: z.object({
        amount: z.number().positive(),
        category: z.string().min(2).max(60),
        spent_at: z.string().describe("YYYY-MM-DD").optional(),
        vendor: z.string().max(200).optional(),
        description: z.string().max(1000).optional(),
        property_id: z.string().uuid().optional(),
        currency: z.string().length(3).optional(),
      }),
      execute: async ({
        amount,
        category,
        spent_at,
        vendor,
        description,
        property_id,
        currency,
      }) => {
        if (!isElevated(ctx.orgRole)) return forbid(ctx, "add_expense");
        const { data, error } = await supabase
          .from("expenses")
          .insert({
            org_id: orgId,
            amount,
            category: category as any,
            spent_at: spent_at ?? new Date().toISOString().slice(0, 10),
            vendor: vendor ?? null,
            description: description ?? null,
            property_id: property_id ?? null,
            currency: currency ?? "SAR",
            vat_amount: 0,
            created_by: ctx.userId,
          })
          .select("id, amount, category, spent_at")
          .single();
        if (error) return { error: error.message };
        await audit(ctx, "ASSISTANT_ACTION", {
          action: "add_expense",
          expense_id: data?.id,
          amount,
        });
        return {
          ok: true,
          expense: data,
          message: `تم تسجيل المصروف بقيمة ${amount} ${currency ?? "SAR"}.`,
          link: "/dashboard/expenses",
        };
      },
    }),

    schedule_meeting: tool({
      description: "جدوِل اجتماعاً جديداً. متاح لجميع الموظفين. اعرض الملخص واستأذن قبل الإنشاء.",
      inputSchema: z.object({
        title: z.string().min(2).max(200),
        starts_at: z.string().describe("ISO datetime"),
        ends_at: z.string().describe("ISO datetime").optional(),
        location: z.string().max(300).optional(),
        link: z.string().url().optional(),
        description: z.string().max(2000).optional(),
      }),
      execute: async ({ title, starts_at, ends_at, location, link, description }) => {
        const role = ctx.orgRole || "member";
        if (!canWriteBasic(role)) return forbid(ctx, "schedule_meeting", [...WRITE_BASIC]);
        const start = new Date(starts_at);
        if (isNaN(start.getTime())) return { error: "starts_at غير صالح" };
        const end = ends_at ? new Date(ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
        const { data, error } = await supabase
          .from("meetings")
          .insert({
            org_id: orgId,
            title,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            location: location ?? null,
            link: link ?? null,
            description: description ?? null,
            organizer_id: ctx.userId,
            attendees: [] as any,
          })
          .select("id, title, starts_at, ends_at")
          .single();
        if (error) return { error: error.message };
        await audit(ctx, "ASSISTANT_ACTION", { action: "schedule_meeting", meeting_id: data?.id });
        return {
          ok: true,
          meeting: data,
          message: `تم جدولة الاجتماع «${title}».`,
          link: "/dashboard/meetings",
        };
      },
    }),

    create_lead: tool({
      description: "أنشئ عميلاً محتملاً جديداً مرتبطاً بجهة اتصال قائمة. متاح لجميع الموظفين.",
      inputSchema: z.object({
        contact_id: z.string().uuid(),
        stage: z.enum(["new", "qualified", "proposal", "negotiation", "won", "lost"]).optional(),
        source: z.string().max(120).optional(),
        budget_min: z.number().nonnegative().optional(),
        budget_max: z.number().nonnegative().optional(),
        property_id: z.string().uuid().optional(),
        notes: z.string().max(2000).optional(),
      }),
      execute: async ({
        contact_id,
        stage,
        source,
        budget_min,
        budget_max,
        property_id,
        notes,
      }) => {
        const role = ctx.orgRole || "member";
        if (!canWriteBasic(role)) return forbid(ctx, "create_lead", [...WRITE_BASIC]);
        const { data, error } = await supabase
          .from("leads")
          .insert({
            org_id: orgId,
            contact_id,
            stage: (stage ?? "new") as any,
            source: source ?? null,
            budget_min: budget_min ?? null,
            budget_max: budget_max ?? null,
            property_id: property_id ?? null,
            notes: notes ?? null,
            currency: "SAR",
            created_by: ctx.userId,
          })
          .select("id, stage")
          .single();
        if (error) return { error: error.message };
        await audit(ctx, "ASSISTANT_ACTION", { action: "create_lead", lead_id: data?.id });
        return {
          ok: true,
          lead: data,
          message: "تم إنشاء العميل المحتمل.",
          link: "/dashboard/leads",
        };
      },
    }),

    assign_task: tool({
      description: "أسند مهمة قائمة إلى موظف. متاح لأدوار owner/admin/manager فقط.",
      inputSchema: z.object({
        task_id: z.string().uuid(),
        assignee_id: z.string().uuid(),
      }),
      execute: async ({ task_id, assignee_id }) => {
        const role = ctx.orgRole || "member";
        if (!["owner", "admin", "manager"].includes(role)) {
          return forbid(ctx, "assign_task", ["owner", "admin", "manager"]);
        }
        const { data, error } = await supabase
          .from("tasks")
          .update({ assignee_id })
          .eq("id", task_id)
          .eq("org_id", orgId)
          .select("id, title, assignee_id")
          .single();
        if (error) return { error: error.message };
        await audit(ctx, "ASSISTANT_ACTION", { action: "assign_task", task_id, assignee_id });
        return { ok: true, task: data, message: "تم إسناد المهمة." };
      },
    }),

    record_payment: tool({
      description:
        "سجّل دفعة مستلمة. متاح لـ owner/admin/finance فقط. اعرض الملخص واستأذن قبل الإنشاء.",
      inputSchema: z.object({
        amount: z.number().positive(),
        tenant_id: z.string().uuid().optional(),
        contract_id: z.string().uuid().optional(),
        invoice_id: z.string().uuid().optional(),
        reference: z.string().max(120).optional(),
        paid_at: z.string().describe("ISO datetime").optional(),
        notes: z.string().max(1000).optional(),
        currency: z.string().length(3).optional(),
      }),
      execute: async ({
        amount,
        tenant_id,
        contract_id,
        invoice_id,
        reference,
        paid_at,
        notes,
        currency,
      }) => {
        const role = ctx.orgRole || "member";
        if (!["owner", "admin", "finance"].includes(role)) {
          return forbid(ctx, "record_payment", ["owner", "admin", "finance"]);
        }
        const { data, error } = await supabase
          .from("payments")
          .insert({
            org_id: orgId,
            amount,
            tenant_id: tenant_id ?? null,
            contract_id: contract_id ?? null,
            invoice_id: invoice_id ?? null,
            reference: reference ?? null,
            paid_at: (paid_at ? new Date(paid_at) : new Date()).toISOString(),
            notes: notes ?? null,
            currency_code: currency ?? "SAR",
            status: "paid",
          })
          .select("id, amount, status, paid_at")
          .single();
        if (error) return { error: error.message };
        await audit(ctx, "ASSISTANT_ACTION", {
          action: "record_payment",
          payment_id: data?.id,
          amount,
        });
        return {
          ok: true,
          payment: data,
          message: `تم تسجيل الدفعة بقيمة ${amount} ${currency ?? "SAR"}.`,
          link: "/dashboard/payments",
        };
      },
    }),

    search_units: tool({
      description: "ابحث في الوحدات حسب الحالة أو الرمز أو النطاق السعري. للقراءة فقط.",
      inputSchema: z.object({
        status: z.enum(["vacant", "occupied", "rented", "reserved", "maintenance"]).optional(),
        code: z.string().max(60).optional(),
        max_rent: z.number().positive().optional(),
        min_rent: z.number().nonnegative().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ status, code, max_rent, min_rent, limit }) => {
        let q = supabase
          .from("units")
          .select("id, code, type, status, area, bedrooms, rent_amount, currency_code, building_id")
          .eq("org_id", orgId)
          .is("deleted_at", null)
          .limit(limit ?? 20);
        if (status) q = q.eq("status", status);
        if (code) q = q.ilike("code", `%${code}%`);
        if (max_rent != null) q = q.lte("rent_amount", max_rent);
        if (min_rent != null) q = q.gte("rent_amount", min_rent);
        const { data, error } = await q;
        if (error) return { error: error.message };
        await audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "search_units", status, code });
        return { count: data?.length ?? 0, units: data ?? [], link: "/dashboard/units" };
      },
    }),

    search_contacts: tool({
      description: "ابحث في جهات الاتصال بالاسم أو الهاتف أو البريد. للقراءة فقط.",
      inputSchema: z.object({
        q: z.string().min(2).max(120),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ q, limit }) => {
        const term = `%${q}%`;
        const { data, error } = await supabase
          .from("contacts")
          .select("id, full_name, email, phone, contact_type")
          .eq("org_id", orgId)
          .or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
          .limit(limit ?? 20);
        if (error) return { error: error.message };
        await audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "search_contacts", q });
        return { count: data?.length ?? 0, contacts: data ?? [], link: "/dashboard/contacts" };
      },
    }),

    // ========= WRITE ACTIONS (draft-only, require confirmation) =========
    // These tools always create rows with status='draft'. The UI must show a
    // confirmation card with a link to review/publish before anything becomes
    // live. Every call is audited with action_type='write'.

    create_contract_draft: tool({
      description:
        "أنشئ عقدًا كمسودة (status=draft) لمراجعته قبل التفعيل. يتطلب الوحدة والمستأجر ومبلغ الإيجار السنوي وتاريخي البداية والنهاية. لا يُفعّل جدول الدفعات إلا بعد التفعيل اليدوي من صفحة العقد.",
      inputSchema: z.object({
        unit_id: z.string().uuid(),
        tenant_id: z.string().uuid(),
        start_date: z.string(), // YYYY-MM-DD
        end_date: z.string(),
        amount: z.number().positive(),
        currency_code: z.string().min(3).max(3).optional(),
        payment_frequency: z.enum(["monthly", "quarterly", "semi_annual", "annual"]).optional(),
        deposit: z.number().nonnegative().optional(),
        notes: z.string().max(1000).optional(),
      }),
      execute: async (input) => {
        if (!canWriteBasic(ctx.orgRole)) {
          return forbid(ctx, "create_contract_draft", [...WRITE_BASIC]);
        }
        const { data, error } = await supabase
          .from("contracts")
          .insert({
            org_id: orgId,
            unit_id: input.unit_id,
            tenant_id: input.tenant_id,
            start_date: input.start_date,
            end_date: input.end_date,
            amount: input.amount,
            currency_code: input.currency_code ?? "SAR",
            payment_frequency: input.payment_frequency ?? "monthly",
            deposit: input.deposit ?? 0,
            notes: input.notes ?? null,
            status: "draft",
            type: "residential",
            created_by: ctx.userId,
          } as never)
          .select("id, contract_number, status")
          .single();
        if (error) {
          await audit(ctx, "ASSISTANT_ACTION_ERROR", {
            action: "create_contract_draft",
            action_type: "write",
            error: error.message,
          });
          return { error: error.message };
        }
        await audit(ctx, "ASSISTANT_ACTION", {
          action: "create_contract_draft",
          action_type: "write",
          contract_id: data?.id,
          amount: input.amount,
        });
        return {
          ok: true,
          confirmation_required: true,
          contract: data,
          message: "تم إنشاء العقد كمسودة. راجع البيانات ثم فعّله يدويًا من صفحة العقد.",
          link: `/dashboard/contracts/${data?.id}`,
        };
      },
    }),

    create_invoice_draft: tool({
      description:
        "أنشئ فاتورة كمسودة (status=draft) بحقول الحد الأدنى. لا تُرسل ولا تُحمّل على المشتري إلا بعد المراجعة والاعتماد اليدوي.",
      inputSchema: z.object({
        contact_id: z.string().uuid(),
        issue_date: z.string(),
        due_date: z.string().optional(),
        subtotal: z.number().nonnegative(),
        vat_rate: z.number().min(0).max(100).optional(),
        currency: z.string().min(3).max(3).optional(),
        description: z.string().max(500).optional(),
      }),
      execute: async (input) => {
        if (!canWriteBasic(ctx.orgRole)) {
          return forbid(ctx, "create_invoice_draft", [...WRITE_BASIC]);
        }
        const rate = input.vat_rate ?? 15;
        const vat_amount = Math.round(input.subtotal * (rate / 100) * 100) / 100;
        const total = Math.round((input.subtotal + vat_amount) * 100) / 100;
        const number = `INV-DRAFT-${Date.now().toString(36).toUpperCase()}`;
        const { data, error } = await supabase
          .from("invoices")
          .insert({
            org_id: orgId,
            contact_id: input.contact_id,
            issue_date: input.issue_date,
            due_date: input.due_date ?? null,
            subtotal: input.subtotal,
            vat_rate: rate,
            vat_amount,
            total,
            currency: input.currency ?? "SAR",
            description: input.description ?? null,
            number,
            status: "draft",
            created_by: ctx.userId,
          } as never)
          .select("id, number, total, status")
          .single();
        if (error) {
          await audit(ctx, "ASSISTANT_ACTION_ERROR", {
            action: "create_invoice_draft",
            action_type: "write",
            error: error.message,
          });
          return { error: error.message };
        }
        await audit(ctx, "ASSISTANT_ACTION", {
          action: "create_invoice_draft",
          action_type: "write",
          invoice_id: data?.id,
          total,
        });
        return {
          ok: true,
          confirmation_required: true,
          invoice: data,
          message: `تم إنشاء الفاتورة ${number} كمسودة. راجع الأرقام ثم اعتمدها يدويًا.`,
          link: "/dashboard/accounting",
        };
      },
    }),

    create_maintenance_ticket_staff: tool({
      description:
        "افتح تذكرة صيانة نيابة عن الفريق (لا يعتمد على دور المستأجر). العنوان مطلوب، والوصف والأولوية اختياريان.",
      inputSchema: z.object({
        title: z.string().min(3).max(200),
        description: z.string().max(1000).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        unit_id: z.string().uuid().optional(),
      }),
      execute: async ({ title, description, priority, unit_id }) => {
        if (!canWriteBasic(ctx.orgRole)) {
          return forbid(ctx, "create_maintenance_ticket_staff", [...WRITE_BASIC]);
        }
        const ticket_no = `T-${Date.now().toString(36).toUpperCase()}`;
        const { data, error } = await supabase
          .from("maintenance_tickets")
          .insert({
            org_id: orgId,
            ticket_no,
            title,
            description: description ?? null,
            priority: priority ?? "medium",
            status: "open",
            source: "staff",
            unit_id: unit_id ?? null,
            photos: [],
            currency: "SAR",
            created_by: ctx.userId,
          } as never)
          .select("id, ticket_no, title, priority, status")
          .single();
        if (error) {
          await audit(ctx, "ASSISTANT_ACTION_ERROR", {
            action: "create_maintenance_ticket_staff",
            action_type: "write",
            error: error.message,
          });
          return { error: error.message };
        }
        await audit(ctx, "ASSISTANT_ACTION", {
          action: "create_maintenance_ticket_staff",
          action_type: "write",
          ticket_id: data?.id,
          title,
        });
        return {
          ok: true,
          confirmation_required: true,
          ticket: data,
          message: `تم فتح التذكرة ${ticket_no}.`,
          link: "/dashboard/maintenance",
        };
      },
    }),

    // ========= TENANT PORTAL =========
    usage_report: tool({
      description:
        "تقرير استخدام شامل للمؤسسة: إحصاءات عامة، المطالبات والمخالفات، الاشتراكات والمدفوعات، والأداء الفني. للأدوار المرتفعة فقط. مرّر days لضبط النافذة الزمنية (افتراضي 30).",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).optional(),
      }),
      execute: async ({ days }) => {
        if (!isElevated(ctx.orgRole)) return forbid(ctx, "usage_report");
        const d = days ?? 30;
        const since = new Date(Date.now() - d * 86_400_000).toISOString();
        const sinceDay = since.slice(0, 10);

        const employeesQ0 = await supabase
          .from("employees")
          .select("id, user_id, status")
          .eq("org_id", orgId)
          .is("deleted_at", null);
        const employees = employeesQ0.data ?? [];
        const empUserIds = employees.map((e: any) => e.user_id).filter(Boolean);

        const [
          loginsQ, claimsQ, violationsQ,
          subPayQ, paymentsQ, logsErrQ, aiUsageQ,
        ] = await Promise.all([
          empUserIds.length
            ? supabase.from("login_events").select("id, user_id, created_at, status")
                .in("user_id", empUserIds).gte("created_at", since)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from("expense_claims").select("id, status, amount, created_at")
            .eq("org_id", orgId).is("deleted_at", null).gte("created_at", since),
          supabase.from("policy_violations").select("id, severity, rule_type, created_at")
            .eq("org_id", orgId).gte("created_at", since),
          supabase.from("subscription_payments").select("id, status, amount, created_at")
            .eq("org_id", orgId).gte("created_at", since),
          supabase.from("payments").select("amount, status, paid_at")
            .eq("org_id", orgId).eq("status", "paid").gte("paid_at", since).is("deleted_at", null),
          supabase.from("logs").select("id, level, created_at")
            .eq("org_id", orgId).in("level", ["error", "critical"]).gte("created_at", since),
          supabase.from("api_key_usage").select("id, status_code, created_at")
            .eq("org_id", orgId).gte("created_at", since),
        ]);

        const logins = loginsQ.data ?? [];
        const successful = logins.filter((l: any) => l.status === "success" || l.status === "ok");
        const failed = logins.filter((l: any) => l.status && l.status !== "success" && l.status !== "ok");
        const uniqueLogins = new Set(successful.map((l: any) => l.user_id)).size;
        const claims = claimsQ.data ?? [];
        const claimsByStatus: Record<string, number> = {};
        let claimsTotal = 0;
        for (const c of claims as any[]) {
          claimsByStatus[c.status] = (claimsByStatus[c.status] ?? 0) + 1;
          claimsTotal += Number(c.amount || 0);
        }
        const violations = violationsQ.data ?? [];
        const violationsBySev: Record<string, number> = {};
        for (const v of violations as any[])
          violationsBySev[v.severity] = (violationsBySev[v.severity] ?? 0) + 1;
        const subs = subPayQ.data ?? [];
        const subsByStatus: Record<string, number> = {};
        let subsPendingAmount = 0, subsApprovedAmount = 0;
        for (const s of subs as any[]) {
          subsByStatus[s.status] = (subsByStatus[s.status] ?? 0) + 1;
          if (s.status === "pending") subsPendingAmount += Number(s.amount || 0);
          if (s.status === "approved") subsApprovedAmount += Number(s.amount || 0);
        }
        const revenue = (paymentsQ.data ?? []).reduce((s, p: any) => s + Number(p.amount || 0), 0);
        const errorLogs = (logsErrQ.data ?? []).length;
        const aiCalls = (aiUsageQ.data ?? []).length;

        await audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "usage_report", days: d });
        return {
          window_days: d,
          since: sinceDay,
          general: {
            active_users: uniqueLogins,
            login_events: logins.length,
            failed_logins: failed.length,
            employees_total: employees.length,
            employees_active: employees.filter((e: any) => e.status === "active").length,
          },
          claims_and_violations: {
            claims_count: claims.length,
            claims_total_amount: claimsTotal,
            by_status: claimsByStatus,
            violations_count: violations.length,
            violations_by_severity: violationsBySev,
          },
          subscriptions_and_payments: {
            subscription_payments_count: subs.length,
            subscription_by_status: subsByStatus,
            subscription_pending_amount: subsPendingAmount,
            subscription_approved_amount: subsApprovedAmount,
            revenue_paid: revenue,
            currency: "SAR",
          },
          technical_performance: {
            error_log_events: errorLogs,
            api_calls: aiCalls,
            api_error_calls: (aiUsageQ.data ?? []).filter((r: any) => Number(r.status_code || 0) >= 400).length,
          },
          note:
            "استخدم هذه الأرقام لصياغة تقرير نصي واضح بالعربية مع عناوين لكل قسم وتعليق موجز على أبرز المؤشرات.",
        };
      },
    }),

    ...(isTenant
      ? {
          my_rent_status: tool({
            description:
              "حالة الإيجار الخاصة بي: الدفعات القادمة والمتأخرة وإجمالي المستحق. متاح فقط للمستأجر.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data, error } = await supabase
                .from("rent_charges")
                .select("id, period_start, period_end, due_date, amount, currency, status")
                .eq("tenant_id", ctx.tenantId!)
                .order("due_date", { ascending: false })
                .limit(24);
              if (error) return { error: error.message };
              const today = new Date().toISOString().slice(0, 10);
              const overdue = (data ?? []).filter(
                (r: any) => r.status === "pending" && r.due_date < today,
              );
              const upcoming = (data ?? []).filter(
                (r: any) => r.status === "pending" && r.due_date >= today,
              );
              const total_overdue = overdue.reduce((s, r: any) => s + Number(r.amount), 0);
              await audit(ctx, "ASSISTANT_TOOL_CALL", { tool: "my_rent_status" });
              return {
                overdue_count: overdue.length,
                total_overdue,
                upcoming_count: upcoming.length,
                next_due: upcoming[upcoming.length - 1] ?? null,
                currency: data?.[0]?.currency ?? "SAR",
                link: "/portal/tenant",
              };
            },
          }),

          create_maintenance_ticket: tool({
            description:
              "افتح تذكرة صيانة نيابة عن المستأجر. اعرض الملخص واستأذن قبل الإنشاء. تُقيَّد الوصف بـ 1000 حرف والعنوان بـ 200.",
            inputSchema: z.object({
              title: z.string().min(3).max(200),
              description: z.string().max(1000).optional(),
              priority: z.enum(["low", "medium", "high"]).optional(),
            }),
            execute: async ({ title, description, priority }) => {
              const ticket_no = `T-${Date.now().toString(36).toUpperCase()}`;
              const { data, error } = await supabase
                .from("maintenance_tickets")
                .insert({
                  org_id: orgId,
                  ticket_no,
                  title,
                  description: description ?? null,
                  priority: priority ?? "medium",
                  status: "open",
                  source: "tenant",
                  submitted_by_tenant_id: ctx.tenantId!,
                  photos: [],
                  currency: "SAR",
                  created_by: ctx.userId,
                })
                .select("id, ticket_no, title, priority, status")
                .single();
              if (error) {
                await audit(ctx, "ASSISTANT_ACTION_ERROR", {
                  action: "create_maintenance_ticket",
                  error: error.message,
                });
                return { error: error.message };
              }
              await audit(ctx, "ASSISTANT_ACTION", {
                action: "create_maintenance_ticket",
                ticket_id: data?.id,
                title,
              });
              return {
                ok: true,
                ticket: data,
                message: `تم فتح تذكرة الصيانة رقم ${data?.ticket_no}.`,
                link: "/portal/tenant/maintenance",
              };
            },
          }),
        }
      : {}),
  };
}
