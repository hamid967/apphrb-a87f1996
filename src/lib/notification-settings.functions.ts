import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ChannelSchema = z.enum(["whatsapp", "sms", "email"]);
const uuid = z.string().uuid();

export const listChannelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string }) => z.object({ orgId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("notification_channel_settings")
      .select("id, channel, enabled, sender_name, reply_to, config")
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    type ChannelRow = {
      id: string;
      channel: "whatsapp" | "sms" | "email";
      enabled: boolean;
      sender_name: string | null;
      reply_to: string | null;
      config: Record<string, string | number | boolean | null>;
    };
    return (rows ?? []) as ChannelRow[];
  });

export const upsertChannelSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      orgId: string;
      channel: "whatsapp" | "sms" | "email";
      enabled: boolean;
      sender_name?: string | null;
      reply_to?: string | null;
      config?: Record<string, string | number | boolean | null>;
    }) =>
      z
        .object({
          orgId: uuid,
          channel: ChannelSchema,
          enabled: z.boolean(),
          sender_name: z.string().max(120).nullable().optional(),
          reply_to: z.string().max(200).nullable().optional(),
          config: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
            .optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("notification_channel_settings").upsert(
      {
        org_id: data.orgId,
        channel: data.channel,
        enabled: data.enabled,
        sender_name: data.sender_name ?? null,
        reply_to: data.reply_to ?? null,
        config: data.config ?? {},
      },
      { onConflict: "org_id,channel" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listNotificationTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { orgId: string; key?: string }) =>
    z.object({ orgId: uuid, key: z.string().max(80).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("notification_templates")
      .select(
        "id, template_key, channel, enabled, subject_ar, subject_en, body_ar, body_en, variables",
      )
      .eq("org_id", data.orgId)
      .order("template_key")
      .order("channel");
    if (data.key) q = q.eq("template_key", data.key);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      template_key: string;
      channel: "whatsapp" | "sms" | "email";
      enabled: boolean;
      subject_ar: string | null;
      subject_en: string | null;
      body_ar: string;
      body_en: string;
      variables: string[];
    }>;
  });

export const upsertNotificationTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      orgId: string;
      template_key: string;
      channel: "whatsapp" | "sms" | "email";
      enabled: boolean;
      subject_ar?: string | null;
      subject_en?: string | null;
      body_ar: string;
      body_en: string;
      variables?: string[];
    }) =>
      z
        .object({
          orgId: uuid,
          template_key: z.string().min(1).max(80),
          channel: ChannelSchema,
          enabled: z.boolean(),
          subject_ar: z.string().max(200).nullable().optional(),
          subject_en: z.string().max(200).nullable().optional(),
          body_ar: z.string().max(4000),
          body_en: z.string().max(4000),
          variables: z.array(z.string().max(60)).max(30).optional(),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("notification_templates").upsert(
      {
        org_id: data.orgId,
        template_key: data.template_key,
        channel: data.channel,
        enabled: data.enabled,
        subject_ar: data.subject_ar ?? null,
        subject_en: data.subject_en ?? null,
        body_ar: data.body_ar,
        body_en: data.body_en,
        variables: data.variables ?? [],
      },
      { onConflict: "org_id,template_key,channel" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
