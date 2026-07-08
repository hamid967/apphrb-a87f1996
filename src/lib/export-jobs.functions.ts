import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const startSchema = z.object({
  orgId: z.string().uuid(),
  templateId: z.string().uuid().nullable().optional(),
  format: z.enum(["csv", "json", "pdf"]),
  params: z.record(z.string(), z.any()).default({}),
});

export const startExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => startSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("export_jobs")
      .insert({
        org_id: data.orgId,
        user_id: context.userId,
        template_id: data.templateId ?? null,
        format: data.format,
        params: data.params ?? {},
        status: "queued",
        progress: 0,
        step: "Queued",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { jobId: row.id as string };
  });

export const getExportJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("export_jobs")
      .select(
        "id, status, progress, step, format, error, result_data, result_url, row_count, started_at, finished_at, created_at",
      )
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return job;
  });

export const listExportJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ orgId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("export_jobs")
      .select(
        "id, status, progress, step, format, error, row_count, created_at, finished_at, template_id",
      )
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Runs export in a separate request. Client fires this without awaiting after
 * startExportJob. Reads the template, fetches rows, writes result to the job row.
 */
export const runExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ jobId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const jobId = data.jobId;

    async function patch(fields: Record<string, unknown>) {
      await (supabase.from("export_jobs") as any)
        .update(fields)
        .eq("id", jobId)
        .eq("user_id", context.userId);
    }

    const { data: job, error: jerr } = await supabase
      .from("export_jobs")
      .select("id, org_id, user_id, template_id, format, params, status")
      .eq("id", jobId)
      .maybeSingle();
    if (jerr) throw new Error(jerr.message);
    if (!job) throw new Error("Job not found");
    if (job.user_id !== context.userId) throw new Error("Forbidden");
    if (job.status !== "queued") return { ok: true, skipped: true };

    await patch({
      status: "processing",
      progress: 5,
      step: "Starting",
      started_at: new Date().toISOString(),
    });

    try {
      // Load template if provided; otherwise treat params.source as raw source
      let source: string | null = null;
      let columns: string[] | null = null;
      let filters: Record<string, any> = {};
      const p = (job.params ?? {}) as Record<string, any>;

      if (job.template_id) {
        const { data: tpl, error: terr } = await supabase
          .from("report_templates")
          .select("source, config")
          .eq("id", job.template_id)
          .maybeSingle();
        if (terr) throw new Error(terr.message);
        source = tpl?.source ?? null;
        const cfg = (tpl?.config ?? {}) as any;
        columns = Array.isArray(cfg.columns) ? cfg.columns : null;
        filters = cfg.filters ?? {};
      } else {
        source = p.source ?? null;
        columns = p.columns ?? null;
        filters = p.filters ?? {};
      }

      if (!source) throw new Error("Missing report source");

      await patch({ progress: 25, step: "Fetching data" });

      const selectCols = columns && columns.length ? columns.join(",") : "*";
      let q: any = (supabase.from(source as any) as any)
        .select(selectCols, { count: "exact" })
        .eq("org_id", job.org_id);
      if (filters.last_days && filters.date_field) {
        const since = new Date(Date.now() - Number(filters.last_days) * 86400000).toISOString();
        q = q.gte(filters.date_field, since);
      }
      if (Array.isArray(filters.status_in)) q = q.in("status", filters.status_in);
      q = q.limit(50000);

      const { data: rows, error: rerr, count } = await q;
      if (rerr) throw new Error(rerr.message);

      await patch({ progress: 70, step: "Formatting", row_count: count ?? rows?.length ?? 0 });

      let result_data: any = null;
      if (job.format === "json") {
        result_data = { rows: rows ?? [], count: count ?? rows?.length ?? 0 };
      } else if (job.format === "csv") {
        const list = (rows ?? []) as any[];
        const cols = columns && columns.length ? columns : Object.keys(list[0] ?? {});
        const esc = (v: any) => {
          if (v === null || v === undefined) return "";
          const s = typeof v === "object" ? JSON.stringify(v) : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [cols.join(","), ...list.map((r) => cols.map((c) => esc(r[c])).join(","))].join(
          "\n",
        );
        result_data = { csv, count: list.length };
      } else {
        // PDF payload = structured rows; client renders PDF from result_data
        result_data = { rows: rows ?? [], columns, count: count ?? rows?.length ?? 0 };
      }

      await patch({
        status: "completed",
        progress: 100,
        step: "Done",
        result_data,
        finished_at: new Date().toISOString(),
      });
      return { ok: true };
    } catch (e: any) {
      await patch({
        status: "failed",
        step: "Failed",
        error: e?.message ?? "Unknown error",
        finished_at: new Date().toISOString(),
      });
      throw e;
    }
  });
