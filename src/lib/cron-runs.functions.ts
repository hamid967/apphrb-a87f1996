import { createServerFn } from "@tanstack/react-start";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

/** Cron job overview + last N runs and HTTP responses for the admin panel. */
export type CronRun = {
  runid: number;
  start_time: string;
  end_time: string | null;
  status: string;
  return_message: string | null;
};

export type CronHttpResponse = {
  id: number;
  created: string;
  status_code: number | null;
  content_preview: string | null;
  timed_out: boolean | null;
  error_msg: string | null;
};

export type CronJobSummary = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  command_url: string | null;
  runs: CronRun[];
  responses: CronHttpResponse[];
  stats: { total: number; failed: number; last_status_code: number | null };
};

/**
 * Returns every pg_cron job plus its recent invocation history. Uses
 * SECURITY DEFINER public RPCs to reach the `cron` / `net` schemas because
 * PostgREST does not expose them, and gates the whole call behind
 * `requireAAL2SuperAdmin` — never expose to non-super-admins.
 */
export const getCronRunsSummary = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async (): Promise<CronJobSummary[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: jobs, error } = await supabaseAdmin.rpc("admin_list_cron_jobs");
    if (error) throw new Error(`admin_list_cron_jobs failed: ${error.message}`);

    const rows = (jobs ?? []) as Array<{
      jobid: number;
      jobname: string;
      schedule: string;
      active: boolean;
      command_url: string | null;
    }>;

    const summaries = await Promise.all(
      rows.map(async (j) => {
        const [runsRes, respRes] = await Promise.all([
          supabaseAdmin.rpc("admin_list_cron_runs", { _jobid: j.jobid, _limit: 20 }),
          j.command_url
            ? supabaseAdmin.rpc("admin_list_http_responses", {
                _url_like: extractPath(j.command_url),
                _limit: 20,
              })
            : Promise.resolve({ data: [], error: null }),
        ]);

        const runs = (runsRes.data ?? []) as CronRun[];
        const responses = (respRes.data ?? []) as CronHttpResponse[];

        const failed = runs.filter(
          (r) => r.status !== "succeeded" && r.status !== "starting" && r.status !== "running",
        ).length;
        const httpFailed = responses.filter(
          (r) => r.status_code !== null && r.status_code >= 400,
        ).length;
        const lastResp = responses[0];

        return {
          jobid: j.jobid,
          jobname: j.jobname,
          schedule: j.schedule,
          active: j.active,
          command_url: j.command_url,
          runs,
          responses,
          stats: {
            total: runs.length,
            failed: failed + httpFailed,
            last_status_code: lastResp?.status_code ?? null,
          },
        } satisfies CronJobSummary;
      }),
    );

    return summaries;
  });

/** Reduce a full URL to the last path segment so `_http_response` matches
 *  across preview/production domains (both hit the same `/api/public/hooks/...`). */
function extractPath(fullUrl: string): string {
  try {
    return new URL(fullUrl).pathname;
  } catch {
    return fullUrl;
  }
}

/** Jobs that admins are allowed to reschedule via the UI. */
export const EDITABLE_CRON_JOBS = [
  "run-scheduled-scripts",
  "dispatch-notifications",
  "rent-reminders",
] as const;
export type EditableCronJob = (typeof EDITABLE_CRON_JOBS)[number];

/** Update the schedule (and optionally active flag) of a managed cron job.
 *  Server-side authorization is enforced twice: the middleware requires an
 *  AAL2 super_admin, and the underlying RPC re-checks `has_role(..., super_admin)`. */
export const updateCronSchedule = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((data: { jobname: string; schedule: string; active?: boolean }) => {
    if (!EDITABLE_CRON_JOBS.includes(data.jobname as EditableCronJob)) {
      throw new Error(`unknown_job: ${data.jobname}`);
    }
    const parts = String(data.schedule ?? "").trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error("invalid_schedule: expected 5-field cron expression");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("admin_update_cron_schedule", {
      _jobname: data.jobname,
      _schedule: data.schedule,
      _active: data.active ?? undefined,
    });
    if (error) throw new Error(`admin_update_cron_schedule failed: ${error.message}`);
    return (rows ?? [])[0] ?? null;
  });
