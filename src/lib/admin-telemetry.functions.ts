import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Kinds that fan out as an email alert (in addition to being persisted to
// system_events). Kept intentionally narrow so signal-to-noise stays high.
const ALERT_KINDS = new Set(["render_error", "aal2_bypass"]);

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

    // Email fan-out (opt-in, requires explicit recipient).
    if (ALERT_KINDS.has(data.kind)) {
      const { data: cfg } = await supabaseAdmin
        .from("app_settings")
        .select("key,value")
        .in("key", ["alerts.email_enabled", "alerts.email_to"]);
      const map = new Map<string, string>();
      for (const row of cfg ?? []) map.set(row.key, row.value ?? "");
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
