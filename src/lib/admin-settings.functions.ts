import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

const KEYS = [
  "subscription.trial_days",
  "subscription.grace_period_days",
  "subscription.warning_days",
  "bank.name",
  "bank.account_name",
  "bank.iban",
  "bank.swift",
  "bank.notes",
  "alerts.slack_webhook_url",
  "alerts.slack_enabled",
  "alerts.email_to",
  "alerts.email_enabled",
] as const;

export const listAppSettings = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_settings")
      .select("key,value,updated_at")
      .in("key", KEYS as unknown as string[]);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const k of KEYS) map[k] = "";
    for (const row of data ?? []) map[row.key] = row.value ?? "";
    return map;
  });

export const saveAppSettings = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((i) => z.object({ values: z.record(z.string(), z.string()) }).parse(i))
  .handler(async ({ data, context }) => {
    const rows = Object.entries(data.values)
      .filter(([k]) => (KEYS as readonly string[]).includes(k))
      .map(([key, value]) => ({
        key,
        value,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      }));
    if (rows.length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw error;
    return { ok: true };
  });

/**
 * Sends a real POST to the given Slack Incoming Webhook URL to verify the
 * configuration. Never persists the URL — takes it from the current form
 * value so the operator can validate before saving.
 */
export const testSlackWebhook = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((i) =>
    z
      .object({
        url: z.string().url().startsWith("https://hooks.slack.com/"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(data.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `:white_check_mark: *Aqari admin* — Slack webhook test at ${new Date().toISOString()}`,
        }),
        signal: ctrl.signal,
      });
      const body = await res.text();
      if (!res.ok || body.trim() !== "ok") {
        return { ok: false as const, status: res.status, error: body.slice(0, 300) };
      }
      return { ok: true as const, status: res.status };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "network_error" };
    } finally {
      clearTimeout(timer);
    }
  });

/**
 * Validates the recipient address for admin alert emails. Kept as a format
 * check for now — actual delivery is exercised by the existing email queue
 * when alerts are enabled.
 */
export const testAlertEmail = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((i) => z.object({ to: z.string().email() }).parse(i))
  .handler(async ({ data, context }) => {
    const { enqueueAdminAlertEmail } = await import("@/lib/admin-alert-email.server");
    const res = await enqueueAdminAlertEmail({
      recipientEmail: data.to,
      props: {
        kind: "render_error",
        path: "/admin/telemetry",
        message: "This is a TEST alert triggered from Admin Settings. No real error occurred.",
        actorId: context.userId,
        eventTime: new Date().toISOString(),
        telemetryUrl: (process.env.PUBLIC_APP_URL || "https://hrhbs.com") + "/admin/telemetry",
        extraJson: JSON.stringify({ test: true, triggered_by: context.userId }, null, 2),
      },
      idempotencyKey: `admin-alert-test-${context.userId}-${Date.now()}`,
    });
    if (!res.ok) {
      return {
        ok: false as const,
        to: data.to,
        reason: res.reason,
        error: (res as { error?: string }).error,
      };
    }
    return { ok: true as const, to: data.to, queued: true, messageId: res.messageId };
  });
