import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-driven worker that processes queued notifications.
 *
 * Called by pg_cron every minute. Authenticated with a private
 * `CRON_HOOK_SECRET` (sent as `x-cron-secret`). Never accept the Supabase
 * publishable/anon key here — it is inlined in the public JS bundle and
 * would let any visitor drain the notification queue on demand.
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_HOOK_SECRET ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!secret || provided.length !== secret.length || provided !== secret) {
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