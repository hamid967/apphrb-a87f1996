import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ALLOWED_TOOL_NAMES } from "@/lib/ai-assistant.functions";

async function resolveOrg(supabase: any, userId: string) {
  const { data } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data?.org_id) throw new Error("No organization for user");
  return { orgId: data.org_id as string, role: String(data.role ?? "") };
}

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.enum(ALLOWED_TOOL_NAMES),
  args: z.record(z.any()).optional(),
  label: z.string().max(120).optional(),
  interval_minutes: z.number().int().min(5).max(43200),
  enabled: z.boolean().optional(),
});

export const listScriptSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { orgId } = await resolveOrg(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("scripts_schedules")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { schedules: data ?? [] };
  });

export const upsertScriptSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpsertSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { orgId } = await resolveOrg(context.supabase, context.userId);
    const payload: Record<string, unknown> = {
      org_id: orgId,
      created_by: context.userId,
      name: data.name,
      args: data.args ?? {},
      label: data.label ?? null,
      interval_minutes: data.interval_minutes,
      enabled: data.enabled ?? true,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("scripts_schedules")
        .update({
          name: payload.name,
          args: payload.args,
          label: payload.label,
          interval_minutes: payload.interval_minutes,
          enabled: payload.enabled,
        })
        .eq("id", data.id)
        .eq("org_id", orgId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { schedule: row };
    }
    const { data: row, error } = await context.supabase
      .from("scripts_schedules")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { schedule: row };
  });

export const toggleScriptSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { orgId } = await resolveOrg(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("scripts_schedules")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteScriptSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { orgId } = await resolveOrg(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("scripts_schedules")
      .delete()
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listScheduleRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ scheduleId: z.string().uuid(), limit: z.number().int().min(1).max(50).optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { orgId } = await resolveOrg(context.supabase, context.userId);
    const { data: runs, error } = await context.supabase
      .from("scripts_schedule_runs")
      .select("id, started_at, duration_ms, status, error, result")
      .eq("schedule_id", data.scheduleId)
      .eq("org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(data.limit ?? 20);
    if (error) throw new Error(error.message);
    return { runs: runs ?? [] };
  });

export const runScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { orgId } = await resolveOrg(context.supabase, context.userId);
    // Force next_run_at to now — cron worker will pick it up on next tick.
    const { error } = await context.supabase
      .from("scripts_schedules")
      .update({ next_run_at: new Date().toISOString(), enabled: true })
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
