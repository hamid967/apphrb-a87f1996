import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-driven worker that processes queued notifications.
 *
 * Called by pg_cron every minute. Authenticated with the Supabase anon key
 * (`apikey` header) — the /api/public prefix bypasses edge auth, so we
 * verify the key ourselves against `SUPABASE_PUBLISHABLE_KEY`.
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { dispatchPendingNotifications } = await import(
            "@/lib/notifications-dispatch.server"
          );
          const summary = await dispatchPendingNotifications(50);
          return new Response(
            JSON.stringify({ ok: true, ...summary, at: new Date().toISOString() }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          console.error("dispatch-notifications failed", err);
          return new Response(
            JSON.stringify({ ok: false, error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});