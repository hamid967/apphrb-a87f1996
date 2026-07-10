import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-user, per-event, per-channel notification toggles.
 * Absence of a row means "use default = enabled, instant".
 */

const ChannelSchema = z.enum(["email", "whatsapp", "sms", "push", "in_app"]);
const FrequencySchema = z.enum(["instant", "daily", "weekly", "off"]);
const uuid = z.string().uuid();

export type EventChannel = z.infer<typeof ChannelSchema>;
export type EventFrequency = z.infer<typeof FrequencySchema>;

export type EventPrefRow = {
  event_key: string;
  channel: EventChannel;
  enabled: boolean;
  frequency: EventFrequency;
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
      .select("event_key, channel, enabled, frequency")
      .eq("user_id", context.userId)
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertUserEventPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      orgId: string;
      event_key: string;
      channel: EventChannel;
      enabled?: boolean;
      frequency?: EventFrequency;
    }) =>
      z
        .object({
          orgId: uuid,
          event_key: z.string().min(1).max(80),
          channel: ChannelSchema,
          enabled: z.boolean().optional(),
          frequency: FrequencySchema.optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const payload: Record<string, unknown> = {
      user_id: context.userId,
      org_id: data.orgId,
      event_key: data.event_key,
      channel: data.channel,
    };
    if (data.enabled !== undefined) payload.enabled = data.enabled;
    if (data.frequency !== undefined) payload.frequency = data.frequency;
    // Defaults for a fresh row when neither field is passed
    if (data.enabled === undefined && !("enabled" in payload)) payload.enabled = true;
    if (data.frequency === undefined && !("frequency" in payload)) payload.frequency = "instant";

    const { error } = await (context.supabase as unknown as {
      from: (t: string) => {
        upsert: (
          v: Record<string, unknown>,
          o: { onConflict: string },
        ) => Promise<{ error: Error | null }>;
      };
    })
      .from("user_notification_event_prefs")
      .upsert(payload, { onConflict: "user_id,org_id,event_key,channel" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
