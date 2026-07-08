import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/auctions-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Public endpoint — require a shared cron secret to prevent
        // unauthenticated attackers from firing auction state transitions.
        const secret = process.env.AUCTIONS_TICK_SECRET ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!secret || provided.length !== secret.length || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data: activated }, { data: finalized, error }] = await Promise.all([
          supabaseAdmin.rpc("activate_scheduled_auctions"),
          supabaseAdmin.rpc("finalize_expired_auctions"),
        ]);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        // Notify winners (best-effort)
        const rows =
          (finalized as Array<{
            auction_id: string;
            winner_user_id: string;
            winning_amount: number;
          }> | null) ?? [];
        for (const row of rows) {
          try {
            const { data: a } = await supabaseAdmin
              .from("auctions")
              .select("org_id")
              .eq("id", row.auction_id)
              .maybeSingle();
            if (!a?.org_id) continue;
            await supabaseAdmin.from("notification_queue").insert({
              org_id: a.org_id,
              recipient: row.winner_user_id,
              channel: "in_app",
              template: "auction_won",
              variables: { auction_id: row.auction_id, amount: row.winning_amount },
              status: "pending",
            });
          } catch {
            /* ignore */
          }
        }
        return Response.json({ ok: true, activated, finalized: (finalized ?? []).length });
      },
    },
  },
});
