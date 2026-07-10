/**
 * Retry wrapper + persistent run log for public cron hooks.
 *
 * - Retries the given task on failure with exponential backoff (0.5s, 2s, 5s).
 * - Persists every attempt (success/failure/exhausted) to `cron_hook_runs`
 *   so admins can review why a run failed without digging through worker logs.
 * - Never throws: on total exhaustion returns the last error so the hook can
 *   still return a structured JSON response.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_BACKOFF_MS = [500, 2000, 5000] as const;

export type CronRunOutcome<T> =
  | { ok: true; result: T; attempts: number }
  | { ok: false; error: string; attempts: number };

async function logRun(row: {
  hook_name: string;
  attempt: number;
  max_attempts: number;
  status: "success" | "failed" | "exhausted";
  duration_ms: number;
  summary: unknown;
  error_message: string | null;
  started_at: string;
  finished_at: string;
}) {
  try {
    await (supabaseAdmin as never as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    })
      .from("cron_hook_runs")
      .insert(row);
  } catch (err) {
    // Never let logging failures crash the hook itself.
    console.error("cron_hook_runs insert failed", err);
  }
}

/**
 * Run `task` with retries and record every attempt. `backoffMs` controls the
 * delay BEFORE each retry (length = maxAttempts - 1). A transient failure on
 * attempt N sleeps for `backoffMs[N-1]` ms before attempt N+1.
 */
export async function runWithRetry<T>(
  hookName: string,
  task: () => Promise<T>,
  opts: { backoffMs?: readonly number[] } = {},
): Promise<CronRunOutcome<T>> {
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const maxAttempts = backoff.length + 1;

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = new Date();
    try {
      const result = await task();
      const finishedAt = new Date();
      await logRun({
        hook_name: hookName,
        attempt,
        max_attempts: maxAttempts,
        status: "success",
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        summary: (result as unknown) ?? null,
        error_message: null,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
      });
      return { ok: true, result, attempts: attempt };
    } catch (err) {
      const finishedAt = new Date();
      lastError = err instanceof Error ? err.message : String(err);
      const isLast = attempt === maxAttempts;
      await logRun({
        hook_name: hookName,
        attempt,
        max_attempts: maxAttempts,
        status: isLast ? "exhausted" : "failed",
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
        summary: null,
        error_message: lastError.slice(0, 2000),
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
      });
      if (isLast) break;
      await new Promise((r) => setTimeout(r, backoff[attempt - 1]));
    }
  }
  return { ok: false, error: lastError, attempts: maxAttempts };
}
