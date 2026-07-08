/**
 * Server-only helper that scans upcoming/overdue rent charges and enqueues
 * WhatsApp + SMS reminders to the tenant. Called from the pg_cron hook
 * `/api/public/hooks/rent-reminders`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { toE164 } from "@/lib/notifications-dispatch.server";

type ReminderKind = "upcoming" | "due_today" | "overdue";

const REMINDER_TEMPLATES: Record<ReminderKind, { ar: string; en: string; event: string }> = {
  upcoming: {
    event: "rent_reminder_upcoming",
    ar: "تذكير: دفعة الإيجار للعقد {{contract}} بمبلغ {{amount}} {{currency}} مستحقة بتاريخ {{due_date}}.",
    en: "Reminder: rent payment for contract {{contract}} of {{amount}} {{currency}} is due on {{due_date}}.",
  },
  due_today: {
    event: "rent_reminder_due_today",
    ar: "دفعة الإيجار للعقد {{contract}} بمبلغ {{amount}} {{currency}} مستحقة اليوم.",
    en: "Rent payment for contract {{contract}} of {{amount}} {{currency}} is due today.",
  },
  overdue: {
    event: "rent_reminder_overdue",
    ar: "تنبيه: دفعة الإيجار للعقد {{contract}} بمبلغ {{amount}} {{currency}} متأخرة منذ {{due_date}}.",
    en: "Alert: rent payment for contract {{contract}} of {{amount}} {{currency}} is overdue since {{due_date}}.",
  },
};

function classify(dueDate: string, today: string, upcomingDays: number): ReminderKind | null {
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "overdue";
  const due = new Date(dueDate + "T00:00:00Z").getTime();
  const now = new Date(today + "T00:00:00Z").getTime();
  const diff = Math.round((due - now) / 86_400_000);
  if (diff > 0 && diff <= upcomingDays) return "upcoming";
  return null;
}

export async function enqueueRentReminders(options: {
  upcomingDays?: number;
  overdueMaxDays?: number;
  limit?: number;
} = {}): Promise<{
  scanned: number;
  queued: number;
  skipped: number;
  errors: number;
}> {
  const upcomingDays = options.upcomingDays ?? 3;
  const overdueMaxDays = options.overdueMaxDays ?? 30;
  const limit = options.limit ?? 500;
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - overdueMaxDays * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + upcomingDays * 86_400_000).toISOString().slice(0, 10);

  const { data: charges, error } = await supabaseAdmin
    .from("rent_charges")
    .select(
      "id, org_id, contract_id, tenant_id, due_date, amount, currency, status, contracts(contract_number), tenants(full_name, phone)",
    )
    .neq("status", "paid")
    .gte("due_date", from)
    .lte("due_date", to)
    .limit(limit);
  if (error) throw error;

  let queued = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of charges ?? []) {
    const kind = classify(String(row.due_date), today, upcomingDays);
    if (!kind) {
      skipped++;
      continue;
    }
    const tenant = row.tenants as { full_name: string | null; phone: string | null } | null;
    const contract = row.contracts as { contract_number: string | null } | null;
    const phone = toE164(tenant?.phone ?? null);
    if (!phone) {
      skipped++;
      continue;
    }
    const spec = REMINDER_TEMPLATES[kind];
    const variables = {
      body: spec.ar,
      contract: contract?.contract_number ?? String(row.contract_id).slice(0, 8),
      amount: Number(row.amount).toLocaleString("ar"),
      currency: row.currency ?? "SAR",
      due_date: String(row.due_date),
      tenant_name: tenant?.full_name ?? "",
    };

    for (const channel of ["whatsapp", "sms"] as const) {
      const idempotency = `rent_${kind}:${row.id}:${today}:${channel}`;
      const { error: insErr } = await supabaseAdmin.from("notification_queue").insert({
        org_id: row.org_id,
        channel,
        recipient: phone,
        template: spec.event,
        variables,
        status: "pending",
        idempotency_key: idempotency,
      });
      if (insErr) {
        // Duplicate idempotency = already queued today — that's fine.
        if ((insErr as { code?: string }).code === "23505") {
          skipped++;
        } else {
          errors++;
        }
      } else {
        queued++;
      }
    }
  }

  return { scanned: charges?.length ?? 0, queued, skipped, errors };
}

/**
 * Enqueue a "payment status update" notification to the tenant when an admin
 * approves or rejects a submitted payment. Best-effort; failures are logged
 * but do not throw so the caller (admin review flow) always completes.
 */
export async function enqueuePaymentStatusUpdate(input: {
  org_id: string;
  tenant_id: string;
  amount: number;
  currency: string;
  decision: "approve" | "reject";
  reason?: string | null;
}): Promise<void> {
  try {
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("full_name, phone")
      .eq("id", input.tenant_id)
      .maybeSingle();
    const phone = toE164((tenant as { phone: string | null } | null)?.phone ?? null);
    if (!phone) return;

    const isApprove = input.decision === "approve";
    const bodyAr = isApprove
      ? `تم اعتماد دفعتك بمبلغ {{amount}} {{currency}}. شكراً لسدادك.`
      : `تم رفض إبلاغك عن دفعة بمبلغ {{amount}} {{currency}}. {{reason}}`;
    const template = isApprove ? "payment_approved" : "payment_rejected";
    const variables = {
      body: bodyAr,
      amount: input.amount.toLocaleString("ar"),
      currency: input.currency,
      reason: input.reason ?? "",
    };

    for (const channel of ["whatsapp", "sms"] as const) {
      const idempotency = `${template}:${input.tenant_id}:${Date.now()}:${channel}`;
      await supabaseAdmin.from("notification_queue").insert({
        org_id: input.org_id,
        channel,
        recipient: phone,
        template,
        variables,
        status: "pending",
        idempotency_key: idempotency,
      });
    }
  } catch (err) {
    console.error("enqueuePaymentStatusUpdate failed", err);
  }
}