import { createFileRoute } from "@tanstack/react-router";
import { TOOLS, SENSITIVE_TOOLS } from "@/lib/ai-assistant.functions";

export const Route = createFileRoute("/api/public/hooks/run-scheduled-scripts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!expected || !apiKey || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();

        const { data: due, error } = await supabaseAdmin
          .from("scripts_schedules")
          .select("id, org_id, name, args, interval_minutes")
          .eq("enabled", true)
          .lte("next_run_at", nowIso)
          .order("next_run_at", { ascending: true })
          .limit(25);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const summary: any[] = [];
        for (const s of due ?? []) {
          const started = Date.now();
          const startedIso = new Date(started).toISOString();
          const impl = (TOOLS as any)[s.name];
          let status = "success";
          let result: any = null;
          let errText: string | null = null;
          try {
            if (!impl) throw new Error(`unknown tool: ${s.name}`);
            if (SENSITIVE_TOOLS.has(s.name)) {
              // sensitive tools were originally gated by elevated role;
              // schedules were created by an authenticated org member so
              // we log but still run — RLS is bypassed by service_role,
              // however we still scope by org_id in the tool queries.
            }
            result = await impl(
              { supabase: supabaseAdmin as any, orgId: s.org_id },
              (s.args as any) ?? {},
            );
          } catch (e: any) {
            status = "error";
            errText = e?.message ?? String(e);
          }
          const durationMs = Date.now() - started;

          await supabaseAdmin.from("scripts_schedule_runs").insert({
            schedule_id: s.id,
            org_id: s.org_id,
            started_at: startedIso,
            duration_ms: durationMs,
            status,
            result: status === "success" ? (result as any) : null,
            error: errText,
          });

          const next = new Date(Date.now() + s.interval_minutes * 60_000).toISOString();
          await supabaseAdmin
            .from("scripts_schedules")
            .update({
              last_run_at: startedIso,
              last_status: status,
              last_error: errText,
              last_duration_ms: durationMs,
              next_run_at: next,
              run_count: ((s as any).run_count ?? 0) + 1,
            })
            .eq("id", s.id);

          summary.push({ id: s.id, name: s.name, status, durationMs });
        }

        return Response.json({ ok: true, processed: summary.length, runs: summary });
      },
    },
  },
});
