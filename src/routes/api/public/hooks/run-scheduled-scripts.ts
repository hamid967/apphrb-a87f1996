import { createFileRoute } from "@tanstack/react-router";
import { TOOLS, SENSITIVE_TOOLS } from "@/lib/ai-assistant.functions";

export const Route = createFileRoute("/api/public/hooks/run-scheduled-scripts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Private cron secret only — the Supabase anon/publishable key is in
        // the public JS bundle and cannot gate service-role execution.
        const secret = process.env.CRON_HOOK_SECRET ?? "";
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!secret || provided.length !== secret.length || provided !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();

        const { data: due, error } = await supabaseAdmin
          .from("scripts_schedules")
          .select(
            "id, org_id, name, args, interval_minutes, max_retries, retry_delay_minutes, current_retry, run_count",
          )
          .eq("enabled", true)
          .lte("next_run_at", nowIso)
          .order("next_run_at", { ascending: true })
          .limit(25);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const summary: any[] = [];
        for (const s of (due as any[]) ?? []) {
          const started = Date.now();
          const startedIso = new Date(started).toISOString();
          const impl = (TOOLS as any)[s.name];
          const attempt = (s.current_retry ?? 0) + 1;
          let status = "success";
          let result: any = null;
          let errText: string | null = null;
          try {
            if (!impl) throw new Error(`unknown tool: ${s.name}`);
            if (SENSITIVE_TOOLS.has(s.name)) {
              // sensitive tools run via service_role but tool queries still scope by org_id
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
            attempt,
            result: status === "success" ? (result as any) : null,
            error: errText,
          });

          // Retry vs. reschedule decision
          const maxRetries = s.max_retries ?? 0;
          const retryDelay = s.retry_delay_minutes ?? 5;
          const willRetry = status === "error" && attempt <= maxRetries;
          const nextMinutes = willRetry ? retryDelay : s.interval_minutes;
          const next = new Date(Date.now() + nextMinutes * 60_000).toISOString();
          const nextRetry = willRetry ? attempt : 0; // reset counter after success or exhaustion

          await supabaseAdmin
            .from("scripts_schedules")
            .update({
              last_run_at: startedIso,
              last_status: status,
              last_error: errText,
              last_duration_ms: durationMs,
              next_run_at: next,
              current_retry: nextRetry,
              run_count: (s.run_count ?? 0) + 1,
            })
            .eq("id", s.id);

          summary.push({
            id: s.id,
            name: s.name,
            status,
            attempt,
            willRetry,
            durationMs,
          });
        }

        return Response.json({ ok: true, processed: summary.length, runs: summary });
      },
    },
  },
});
