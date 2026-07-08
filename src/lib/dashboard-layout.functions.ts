import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const widgetSchema = z.object({
  id: z.string(),
  title: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.any()).default({}),
  displayField: z.string().default(""),
  size: z.enum(["sm", "md", "lg"]),
  visible: z.boolean(),
});

const layoutSchema = z.object({
  auto: z
    .object({
      widgets: z.array(widgetSchema),
      updatedAt: z.string().optional(),
    })
    .optional(),
});

export type DashboardLayout = z.infer<typeof layoutSchema>;
export type AutoWidget = z.infer<typeof widgetSchema>;

export const getMyDashboardLayout = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("dashboard_layout")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    const raw = (data?.dashboard_layout ?? {}) as unknown;
    const parsed = layoutSchema.safeParse(raw);
    return parsed.success ? (parsed.data as DashboardLayout) : ({} as DashboardLayout);
  });

export const saveAutoDashboardLayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ widgets: z.array(widgetSchema) }).parse(input))
  .handler(async ({ data, context }) => {
    // Read current layout so we don't clobber other keys we may add later.
    const { data: row, error: readErr } = await context.supabase
      .from("profiles")
      .select("dashboard_layout")
      .eq("id", context.userId)
      .maybeSingle();
    if (readErr) throw readErr;
    const current = (row?.dashboard_layout ?? {}) as Record<string, unknown>;
    const next = {
      ...current,
      auto: { widgets: data.widgets, updatedAt: new Date().toISOString() },
    };
    const { error } = await context.supabase
      .from("profiles")
      .update({ dashboard_layout: next as never })
      .eq("id", context.userId);
    if (error) throw error;
    return { ok: true, count: data.widgets.length };
  });
