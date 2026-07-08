import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Kinds that fan out as a Slack alert (in addition to being persisted to
// system_events). Kept intentionally narrow so signal-to-noise stays high.
const ALERT_KINDS = new Set(["render_error", "aal2_bypass"]);

async function postSlackAlert(
  kind: string,
  path: string | null,
  message: string | null,
  actorId: string,
  overrideUrl: string | null,
  enabled: boolean,
) {
  if (!enabled) return;
  const url = overrideUrl || process.env.SLACK_ALERT_WEBHOOK_URL;
  if (!url) return; // No webhook configured — silently skip.
  const emoji = kind === "render_error" ? ":rotating_light:" : ":warning:";
  const title =
    kind === "render_error"
      ? "Admin render error"
      : kind === "aal2_bypass"
        ? "Admin AAL2 bypass activated"
        : `Admin event: ${kind}`;
  const body = {
    text: `${emoji} *${title}*`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `${emoji} *${title}*` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Path*\n\`${path ?? "—"}\`` },
          { type: "mrkdwn", text: `*Actor*\n\`${actorId}\`` },
          { type: "mrkdwn", text: `*Kind*\n\`${kind}\`` },
          {
            type: "mrkdwn",
            text: `*Time*\n${new Date().toISOString()}`,
          },
        ],
      },
      ...(message
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Message*\n\`\`\`${message.slice(0, 1500)}\`\`\``,
              },
            },
          ]
        : []),
    ],
  };
  try {
    // 3s ceiling — never let a slow Slack POST hold up the request.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    // Best-effort — Slack outages must not break admin telemetry.
  }
}

/**
 * Records a lightweight telemetry event for the /admin/* surface.
 * Uses the service-role client because system_events has no INSERT policy
 * for authenticated users; the caller is still verified via
 * requireSupabaseAuth + super_admin check.
 */
export const logAdminEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const kind = String(d.kind ?? "");
    if (!kind || kind.length > 64) throw new Error("invalid_kind");
    const path = typeof d.path === "string" ? d.path.slice(0, 512) : null;
    const message = typeof d.message === "string" ? d.message.slice(0, 2000) : null;
    const stack = typeof d.stack === "string" ? d.stack.slice(0, 4000) : null;
    const durationMs = typeof d.durationMs === "number" ? Math.round(d.durationMs) : null;
    const extra = typeof d.extra === "object" && d.extra !== null ? d.extra : null;
    return { kind, path, message, stack, durationMs, extra };
  })
  .handler(async ({ context, data }) => {
    // Confirm caller is super_admin before writing.
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as never,
    });
    if (!isAdmin) return { ok: false as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      path: data.path,
      message: data.message,
      stack: data.stack,
      duration_ms: data.durationMs,
      extra: data.extra,
    } as unknown as Record<string, unknown>;
    const { error } = await supabaseAdmin.from("system_events").insert({
      event_type: `admin.${data.kind}`,
      actor_id: context.userId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
    });
    if (error) return { ok: false as const, error: error.message };
    // Fan out to Slack after a successful insert. Non-blocking best-effort.
    if (ALERT_KINDS.has(data.kind)) {
      // Read runtime alert config from app_settings (falls back to env when unset).
      const { data: cfg } = await supabaseAdmin
        .from("app_settings")
        .select("key,value")
        .in("key", [
          "alerts.slack_webhook_url",
          "alerts.slack_enabled",
          "alerts.email_enabled",
          "alerts.email_to",
        ]);
      const map = new Map<string, string>();
      for (const row of cfg ?? []) map.set(row.key, row.value ?? "");
      const overrideUrl = map.get("alerts.slack_webhook_url") || null;
      // Default ON when unset, so existing env-only setups keep working.
      const enabledRaw = map.get("alerts.slack_enabled");
      const enabled =
        enabledRaw === undefined ||
        enabledRaw === "" ||
        enabledRaw === "true" ||
        enabledRaw === "1";
      await postSlackAlert(
        data.kind,
        data.path,
        data.message,
        context.userId,
        overrideUrl,
        enabled,
      );

      // Email fan-out (opt-in, requires explicit recipient).
      const emailEnabledRaw = map.get("alerts.email_enabled");
      const emailEnabled = emailEnabledRaw === "true" || emailEnabledRaw === "1";
      const emailTo = (map.get("alerts.email_to") || "").trim();
      if (emailEnabled && emailTo) {
        try {
          const { enqueueAdminAlertEmail } = await import("@/lib/admin-alert-email.server");
          const extraJson = data.extra ? JSON.stringify(data.extra, null, 2) : null;
          await enqueueAdminAlertEmail({
            recipientEmail: emailTo,
            props: {
              kind: data.kind,
              path: data.path,
              message: data.message,
              actorId: context.userId,
              eventTime: new Date().toISOString(),
              telemetryUrl:
                (process.env.PUBLIC_APP_URL || "https://hrhbs.com") + "/admin/telemetry",
              extraJson,
            },
            idempotencyKey: `admin-alert-${data.kind}-${context.userId}-${Date.now()}`,
          });
        } catch {
          // Best-effort — email outages must not break admin telemetry.
        }
      }
    }
    return { ok: true as const };
  });
