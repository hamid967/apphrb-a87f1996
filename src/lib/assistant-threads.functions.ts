import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listAssistantThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assistant_threads")
      .select("id, title, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const createAssistantThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ title: z.string().optional() }).parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const { data: mem } = await context.supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await context.supabase
      .from("assistant_threads")
      .insert({
        user_id: context.userId,
        org_id: mem?.org_id ?? null,
        title: data.title ?? "محادثة جديدة",
      })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw error;
    return row;
  });

export const getAssistantThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ threadId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: thread, error: te } = await context.supabase
      .from("assistant_threads")
      .select("id, title, created_at, updated_at")
      .eq("id", data.threadId)
      .maybeSingle();
    if (te) throw te;
    if (!thread) throw new Error("Thread not found");
    const { data: msgs, error: me } = await context.supabase
      .from("assistant_messages")
      .select("id, role, content, created_at, feedback")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (me) throw me;
    return { thread, messages: msgs ?? [] };
  });

export const renameAssistantThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ threadId: z.string().uuid(), title: z.string().min(1).max(120) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("assistant_threads")
      .update({ title: data.title })
      .eq("id", data.threadId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAssistantThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ threadId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("assistant_threads")
      .delete()
      .eq("id", data.threadId);
    if (error) throw error;
    return { ok: true };
  });

export const setAssistantMessageFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        messageId: z.string().uuid(),
        feedback: z.enum(["up", "down"]).nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("assistant_messages")
      .update({ feedback: data.feedback })
      .eq("id", data.messageId);
    if (error) throw error;
    return { ok: true, feedback: data.feedback };
  });
