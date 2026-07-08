import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_devices")
      .select("*")
      .eq("user_id", context.userId)
      .order("last_seen_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listLoginEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("login_events")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const setDeviceTrust = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), trusted: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_devices")
      .update({ trusted: data.trusted, trusted_at: data.trusted ? new Date().toISOString() : null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const revokeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_devices")
      .update({ revoked_at: new Date().toISOString(), trusted: false })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const checkLoginRateLimit = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ identifier: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: res, error } = await sb.rpc("check_login_rate_limit", {
      _identifier: data.identifier,
      _window_minutes: 15,
      _max_attempts: 5,
    });
    if (error) throw error;
    return res as {
      blocked: boolean;
      attempts: number;
      max: number;
      window_minutes: number;
      retry_after_seconds: number;
    };
  });

export const recordLoginEvent = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({
        email: z.string().email().optional().nullable(),
        fingerprint: z.string().optional().nullable(),
        userAgent: z.string().optional().nullable(),
        status: z.enum(["success", "failed", "blocked", "rate_limited"]),
        reason: z.string().optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: id, error } = await sb.rpc("record_login_event", {
      _email: data.email ?? null,
      _fingerprint: data.fingerprint ?? null,
      _ip: null,
      _ua: data.userAgent ?? null,
      _status: data.status,
      _reason: data.reason ?? null,
    });
    if (error) throw error;
    return { id };
  });
