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


        const { dispatchPendingNotifications } = await import(
          "@/lib/notifications-dispatch.server"
        );
        const { runWithRetry } = await import("@/lib/cron-retry.server");
        const outcome = await runWithRetry(
          "dispatch-notifications",
          () => dispatchPendingNotifications(50),
        );
        if (outcome.ok) {
          return new Response(
            JSON.stringify({
              ok: true,
              attempts: outcome.attempts,
              ...outcome.result,
              at: new Date().toISOString(),
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            ok: false,
            attempts: outcome.attempts,
            error: outcome.error,
            at: new Date().toISOString(),
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});