import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-user, per-event, per-channel notification toggles.
 * Absence of a row means "use default = enabled".
 */

const ChannelSchema = z.enum(["email", "whatsapp", "sms", "push", "in_app"]);
const uuid = z.string().uuid();

export type EventChannel = z.infer<typeof ChannelSchema>;

export type EventPrefRow = {
  event_key: string;
  channel: EventChannel;
  enabled: boolean;
};

export const listUserEventPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string }) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }): Promise<EventPrefRow[]> => {
    const { data: rows, error } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            a: string,
            b: string,
          ) => {
            eq: (a: string, b: string) => Promise<{ data: EventPrefRow[] | null; error: Error | null }>;
          };
        };
      };
    })
      .from("user_notification_event_prefs")
      .select("event_key, channel, enabled")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertUserEventPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { orgId: string; event_key: string; channel: EventChannel; enabled: boolean }) =>
      z
        .object({
          orgId: uuid,
          event_key: z.string().min(1).max(80),
          channel: ChannelSchema,
          enabled: z.boolean(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as {
      from: (t: string) => {
        upsert: (
          v: Record<string, unknown>,
          o: { onConflict: string },
        ) => Promise<{ error: Error | null }>;
      };
    })
      .from("user_notification_event_prefs")
      .upsert(
        {
          user_id: context.userId,
          org_id: data.orgId,
          event_key: data.event_key,
          channel: data.channel,
          enabled: data.enabled,
        },
        { onConflict: "user_id,org_id,event_key,channel" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });