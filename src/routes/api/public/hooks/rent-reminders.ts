import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron hook: scans upcoming/overdue rent charges and enqueues
 * WhatsApp + SMS reminders to tenants. Authenticated with the Supabase
 * publishable key so pg_cron can call it safely.
 */
export const Route = createFileRoute("/api/public/hooks/rent-reminders")({
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