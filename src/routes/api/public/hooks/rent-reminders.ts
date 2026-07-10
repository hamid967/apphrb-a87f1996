import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron hook: scans upcoming/overdue rent charges and enqueues
 * WhatsApp + SMS reminders to tenants. Authenticated with a private
 * `CRON_HOOK_SECRET` (sent as `x-cron-secret`) — never the Supabase
 * anon/publishable key, which is public in the browser bundle.
 */
export const Route = createFileRoute("/api/public/hooks/rent-reminders")({
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
          const { enqueueRentReminders } = await import("@/lib/rent-reminders.server");
          const summary = await enqueueRentReminders();
          return new Response(
            JSON.stringify({ ok: true, ...summary, at: new Date().toISOString() }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          console.error("rent-reminders failed", err);
          return new Response(
            JSON.stringify({ ok: false, error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});