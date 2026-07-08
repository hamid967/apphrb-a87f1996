import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function primaryOrgId(supabase: ServerSupabase, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.org_id as string) ?? null;
}

export const getMyActiveSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) {
      return {
        status: "none" as const,
        end_date: null as string | null,
        days_remaining: null as number | null,
        in_grace: false,
        grace_days: 3,
        warning_days: 7,
      };
    }
    // Read configurable windows from app_settings (fallback defaults)
    const { data: settingRows } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["subscription.grace_period_days", "subscription.warning_days"]);
    const settingMap = new Map<string, any>((settingRows ?? []).map((r: any) => [r.key, r.value]));
    const graceDays = Number(settingMap.get("subscription.grace_period_days") ?? 3);
    const warningDays = Number(settingMap.get("subscription.warning_days") ?? 7);

    const { data } = await supabase
      .from("subscriptions")
      .select("status, end_date")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) {
      return {
        status: "none" as const,
        end_date: null,
        days_remaining: null,
        in_grace: false,
        grace_days: graceDays,
        warning_days: warningDays,
      };
    }
    const now = new Date();
    const end = data.end_date ? new Date(data.end_date) : null;
    const msPerDay = 86_400_000;
    const daysRemaining = end ? Math.ceil((end.getTime() - now.getTime()) / msPerDay) : null;
    // Grace period: within `graceDays` after end_date, still treat as active-with-grace
    const past = end && end < now;
    const graceEnd = end ? new Date(end.getTime() + graceDays * msPerDay) : null;
    const withinGrace = !!(past && graceEnd && now < graceEnd);
    const hardExpired =
      data.status === "expired" ||
      (past && !withinGrace && data.status !== "active" ? true : past && !withinGrace);
    return {
      status: (hardExpired ? "expired" : data.status) as
        | "active"
        | "expired"
        | "pending_payment"
        | "cancelled"
        | "none",
      end_date: data.end_date ?? null,
      days_remaining: daysRemaining,
      in_grace: withinGrace,
      grace_days: graceDays,
      warning_days: warningDays,
    };
  });

export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) {
      return {
        org_id: null as string | null,
        subscription: null as any,
        package: null as any,
        usage: { units: 0, properties: 0, users: 0 },
        bank_details: null as any,
      };
    }

    const [subRes, unitsRes, propsRes, membersRes, bankSettingRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select(
          "id, status, billing_cycle, start_date, end_date, amount, currency_code, package_id, rejection_reason, reviewed_at",
        )
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("end_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("units")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .is("deleted_at", null),
      supabase.from("properties").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      supabase
        .from("organization_members")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "platform.bank_details")
        .maybeSingle(),
    ]);

    let pkg: any = null;
    if (subRes.data?.package_id) {
      const { data } = await supabase
        .from("packages")
        .select(
          "id, code, name, description, price_monthly, price_yearly, max_users, max_properties, max_units, features",
        )
        .eq("id", subRes.data.package_id)
        .maybeSingle();
      pkg = data ?? null;
    }

    const sub = subRes.data
      ? (() => {
          const end = subRes.data.end_date ? new Date(subRes.data.end_date) : null;
          const now = new Date();
          const expired =
            subRes.data.status === "expired" ||
            (end && end < now && subRes.data.status !== "active");
          const daysRemaining = end
            ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000))
            : null;
          return {
            ...subRes.data,
            status: expired ? "expired" : subRes.data.status,
            days_remaining: daysRemaining,
          };
        })()
      : null;

    return {
      org_id: orgId,
      subscription: sub,
      package: pkg,
      usage: {
        units: unitsRes.count ?? 0,
        properties: propsRes.count ?? 0,
        users: membersRes.count ?? 0,
      },
      bank_details: (bankSettingRes.data?.value as any) ?? null,
    };
  });

export const listMySubscriptionPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const orgId = await primaryOrgId(supabase, userId);
    if (!orgId) return { items: [] as any[] };
    const { data, error } = await supabase
      .from("subscription_payments")
      .select(
        "id, amount, currency, bank_name, bank_reference, transferred_at, receipt_url, status, rejection_reason, reviewed_at, created_at, package_id",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { items: (data ?? []) as any[] };
  });

export const listPendingSubscriptionPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string; from?: string; to?: string }) => data ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    let q = supabase
      .from("subscription_payments")
      .select(
        "id, org_id, amount, currency, bank_name, bank_reference, transferred_at, receipt_url, status, rejection_reason, reviewed_at, created_at, package_id, submitted_by, refund_amount, refund_reason, refunded_at, organizations:org_id(name,slug), packages:package_id(name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    const status = data?.status ?? "pending";
    if (status !== "all") q = q.eq("status", status);
    if (data?.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data?.to) {
      // include the whole "to" day
      const to = new Date(data.to);
      to.setHours(23, 59, 59, 999);
      q = q.lte("created_at", to.toISOString());
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return { items: (rows ?? []) as any[] };
  });

export const refundSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { id: string; amount: number; reason: string; note?: string }) => {
      if (!data.id) throw new Error("id required");
      if (!(data.amount > 0)) throw new Error("refund amount must be > 0");
      if (!data.reason?.trim()) throw new Error("refund reason required");
      if (data.note && data.note.length > 500) throw new Error("note too long");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: pay, error: readErr } = await supabase
      .from("subscription_payments")
      .select("id, status, amount, subscription_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!pay) throw new Error("Payment not found");
    if (pay.status !== "approved") throw new Error("Only approved payments can be refunded");
    if (data.amount > Number(pay.amount)) throw new Error("Refund exceeds original amount");

    const fromStatus = pay.status;
    const nowIso = new Date().toISOString();

    const { error: upErr } = await supabase
      .from("subscription_payments")
      .update({
        status: "refunded" as const,
        refund_amount: data.amount,
        refund_reason: data.reason.trim(),
        refunded_at: nowIso,
        refunded_by: userId,
      })
      .eq("id", data.id);
    if (upErr) throw upErr;

    // Cancel linked subscription if any
    if (pay.subscription_id) {
      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("id", pay.subscription_id);
    }

    // Write audit row (trigger may or may not fire for refund; write explicit row)
    const noteText = data.note?.trim()
      ? `${data.reason.trim()} — ${data.amount} — ${data.note.trim()}`
      : `${data.reason.trim()} — ${data.amount}`;
    await supabase.from("payment_approvals").insert({
      payment_id: data.id,
      actor: userId,
      action: "refunded",
      from_status: fromStatus,
      to_status: "refunded",
      note: noteText,
    });

    return { ok: true };
  });

// ============================================================
// Subscription change log (audit_log-derived) for the current org
// ============================================================

type SubHistoryEvent = {
  id: string;
  at: string;
  type: "created" | "approved" | "rejected" | "renewed" | "expired" | "cancelled" | "updated";
  subscription_id: string;
  status_before: string | null;
  status_after: string | null;
  reason: string | null;
  end_date: string | null;
  billing_cycle: string | null;
  message_ar: string;
  message_en: string;
};

function classifySubEvent(row: any): SubHistoryEvent | null {
  const diff = row.diff ?? {};
  const before = diff.before ?? null;
  const after = diff.after ?? null;
  const at = row.created_at as string;
  const subId = (after?.id ?? before?.id ?? row.entity_id) as string;
  const statusB = before?.status ?? null;
  const statusA = after?.status ?? null;
  const reason = after?.rejection_reason ?? null;
  const endDate = after?.end_date ?? null;
  const cycle = after?.billing_cycle ?? null;

  const base = {
    id: row.id as string,
    at,
    subscription_id: subId,
    status_before: statusB,
    status_after: statusA,
    reason,
    end_date: endDate,
    billing_cycle: cycle,
  };

  if (row.action === "INSERT") {
    return {
      ...base,
      type: "created",
      message_ar: "تم إنشاء طلب الاشتراك بانتظار مراجعة الإدارة.",
      message_en: "Subscription request created and awaiting admin review.",
    };
  }
  if (row.action === "DELETE") {
    return {
      ...base,
      type: "cancelled",
      message_ar: "تم إلغاء الاشتراك.",
      message_en: "Subscription has been cancelled.",
    };
  }
  if (row.action === "UPDATE" && statusB !== statusA) {
    if (statusA === "active") {
      return {
        ...base,
        type: statusB === "active" ? "renewed" : "approved",
        message_ar:
          statusB === "active"
            ? `تم تجديد اشتراكك حتى ${endDate ?? "—"}.`
            : `تمت الموافقة على اشتراكك وتفعيله حتى ${endDate ?? "—"}.`,
        message_en:
          statusB === "active"
            ? `Your subscription has been renewed through ${endDate ?? "—"}.`
            : `Your subscription has been approved and activated through ${endDate ?? "—"}.`,
      };
    }
    if (statusA === "rejected") {
      return {
        ...base,
        type: "rejected",
        message_ar: reason
          ? `تم رفض طلب التفعيل. السبب: ${reason}`
          : "تم رفض طلب التفعيل من قبل الإدارة.",
        message_en: reason
          ? `Your activation request was rejected. Reason: ${reason}`
          : "Your activation request was rejected by the admin team.",
      };
    }
    if (statusA === "expired") {
      return {
        ...base,
        type: "expired",
        message_ar: "انتهت صلاحية الاشتراك. يرجى التواصل معنا للتجديد.",
        message_en: "Your subscription has expired. Please contact us to renew.",
      };
    }
    if (statusA === "cancelled") {
      return {
        ...base,
        type: "cancelled",
        message_ar: "تم إلغاء الاشتراك.",
        message_en: "Subscription has been cancelled.",
      };
    }
    return {
      ...base,
      type: "updated",
      message_ar: `تم تحديث حالة الاشتراك من ${statusB ?? "—"} إلى ${statusA ?? "—"}.`,
      message_en: `Subscription status changed from ${statusB ?? "—"} to ${statusA ?? "—"}.`,
    };
  }
  return null;
}

export const listSubscriptionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { org_id?: string } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });

    let orgId = data?.org_id ?? null;
    if (orgId) {
      if (!isAdmin) {
        const { data: mem } = await supabase
          .from("organization_members")
          .select("org_id")
          .eq("org_id", orgId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!mem) throw new Error("Forbidden");
      }
    } else {
      orgId = await primaryOrgId(supabase, userId);
    }
    if (!orgId) return { items: [] as SubHistoryEvent[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("audit_log")
      .select("id, action, diff, entity_id, created_at")
      .eq("entity", "subscriptions")
      .eq("diff->>org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const items: SubHistoryEvent[] = [];
    for (const r of rows ?? []) {
      const ev = classifySubEvent(r);
      if (ev) items.push(ev);
    }
    return { items };
  });

export const reviewSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { id: string; decision: "approve" | "reject"; reason?: string; note?: string }) => {
      if (!data.id) throw new Error("id required");
      if (data.decision === "reject" && !data.reason?.trim()) {
        throw new Error("rejection reason required");
      }
      if (data.note && data.note.length > 500) {
        throw new Error("note too long");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    // Fetch context for unified audit before update
    const { data: existing } = await supabase
      .from("subscription_payments")
      .select("org_id, amount, currency, bank_reference")
      .eq("id", data.id)
      .maybeSingle();
    const patch =
      data.decision === "approve"
        ? {
            status: "approved" as const,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: null,
          }
        : {
            status: "rejected" as const,
            reviewed_by: userId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: data.reason!.trim(),
          };
    const { error } = await supabase.from("subscription_payments").update(patch).eq("id", data.id);
    if (error) throw error;
    // Persist optional admin note onto the audit row the trigger just wrote
    const trimmed = data.note?.trim();
    if (trimmed) {
      const { data: last } = await supabase
        .from("payment_approvals")
        .select("id, note")
        .eq("payment_id", data.id)
        .eq("action", data.decision === "approve" ? "approved" : "rejected")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.id) {
        const merged = last.note ? `${last.note}\n— ${trimmed}` : trimmed;
        await supabase.from("payment_approvals").update({ note: merged }).eq("id", last.id);
      }
    }
    // Unified Decision Center audit
    const { logDecisionAction } = await import("@/lib/decision-audit.server");
    await logDecisionAction({
      kind: "receipt",
      action: data.decision,
      entity_id: data.id,
      actor: userId,
      org_id: existing?.org_id ?? null,
      reason: data.decision === "reject" ? data.reason!.trim() : null,
      note: trimmed ?? null,
      extra: {
        amount: existing?.amount ?? null,
        currency: existing?.currency ?? null,
        bank_reference: existing?.bank_reference ?? null,
      },
    });
    return { ok: true };
  });

export const signReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { path: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const { data: signed, error } = await supabase.storage
      .from("subscription-receipts")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw error;
    return { url: signed.signedUrl as string };
  });

export const getSubscriptionPaymentAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: rows, error } = await supabase
      .from("payment_approvals")
      .select("id, action, from_status, to_status, note, actor, created_at")
      .eq("payment_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { items: (rows ?? []) as any[] };
  });

// ============================================================
// Subscription request approval (manual activation flow)
// ============================================================

export const listSubscriptionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { status?: string } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");
    const status = data?.status ?? "pending";
    let q = supabase
      .from("subscriptions")
      .select(
        "id, org_id, package_id, status, billing_cycle, start_date, end_date, amount, currency_code, rejection_reason, reviewed_at, reviewed_by, created_at, organizations:org_id(name, slug), packages:package_id(name, code)"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "all") q = q.eq("status", status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { items: (rows ?? []) as any[] };
  });

export const reviewSubscriptionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      decision: "approve" | "reject";
      billing_cycle?: "monthly" | "yearly";
      months?: number;
      reason?: string;
    }) => {
      if (!data?.id) throw new Error("id required");
      if (data.decision !== "approve" && data.decision !== "reject") {
        throw new Error("invalid decision");
      }
      if (data.decision === "reject" && !data.reason?.trim()) {
        throw new Error("rejection reason required");
      }
      return data;
    }
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) throw new Error("Forbidden");

    const nowIso = new Date().toISOString();
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (data.decision === "approve") {
      const cycle = data.billing_cycle ?? "monthly";
      const months = Math.max(1, Math.min(60, data.months ?? (cycle === "yearly" ? 12 : 1)));
      const start = new Date();
      const end = new Date(start);
      end.setMonth(end.getMonth() + months);
      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: "active",
          billing_cycle: cycle,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          reviewed_by: userId,
          reviewed_at: nowIso,
          rejection_reason: null,
        })
        .eq("id", data.id);
      if (error) throw error;
      const { logDecisionAction } = await import("@/lib/decision-audit.server");
      await logDecisionAction({
        kind: "subscription",
        action: "approve",
        entity_id: data.id,
        actor: userId,
        org_id: existingSub?.org_id ?? null,
        extra: {
          billing_cycle: data.billing_cycle ?? "monthly",
          months: data.months ?? null,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
        },
      });
    } else {
      const { error } = await supabase
        .from("subscriptions")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: nowIso,
          rejection_reason: data.reason!.trim(),
        })
        .eq("id", data.id);
      if (error) throw error;
      const { logDecisionAction } = await import("@/lib/decision-audit.server");
      await logDecisionAction({
        kind: "subscription",
        action: "reject",
        entity_id: data.id,
        actor: userId,
        org_id: existingSub?.org_id ?? null,
        reason: data.reason!.trim(),
      });
    }
    return { ok: true };
  });
