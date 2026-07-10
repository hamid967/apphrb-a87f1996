/**
 * Server-only helpers for sending Web Push notifications.
 *
 * Uses `@block65/webcrypto-web-push` which relies on the Web Crypto API,
 * so it runs on Cloudflare Workers (unlike the classic Node `web-push`).
 * Loads VAPID keys from env at call time — never at module scope, since
 * this file is server-only but the values are only bound to the worker.
 */
import {
  ApplicationServer,
  type PushSubscription as WPPushSubscription,
} from "@block65/webcrypto-web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

let appServer: ApplicationServer | null = null;
async function getAppServer(): Promise<ApplicationServer | null> {
  if (appServer) return appServer;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@hrhbs.com";
  if (!pub || !priv) return null;
  appServer = await ApplicationServer.new({
    contactInformation: subject,
    publicKey: pub,
    privateKey: priv,
  });
  return appServer;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
};

/**
 * Deliver `payload` to every push subscription belonging to `userId`.
 * Failed endpoints are recorded (410/404 subscriptions are removed).
 * Returns delivery counts so the dispatcher can decide success/retry.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ delivered: number; removed: number; failed: number }> {
  const server = await getAppServer();
  if (!server) return { delivered: 0, removed: 0, failed: 0 };

  const admin = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, b: string) => Promise<{
          data: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> | null;
          error: { message: string } | null;
        }>;
      };
      delete: () => { eq: (a: string, b: string) => Promise<unknown> };
      update: (v: Record<string, unknown>) => { eq: (a: string, b: string) => Promise<unknown> };
    };
  };

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!subs || subs.length === 0) return { delivered: 0, removed: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/dashboard/inbox",
    tag: payload.tag,
    icon: payload.icon,
  });

  let delivered = 0;
  let removed = 0;
  let failed = 0;

  for (const s of subs) {
    const sub: WPPushSubscription = {
      endpoint: s.endpoint,
      expirationTime: null,
      keys: { p256dh: s.p256dh, auth: s.auth },
    };
    try {
      const message = await server.subscribe(sub, body);
      const res = await fetch(message);
      if (res.status === 201 || res.status === 200 || res.status === 202) {
        delivered++;
        await admin
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), failure_count: 0, last_error: null })
          .eq("id", s.id);
      } else if (res.status === 404 || res.status === 410) {
        removed++;
        await admin.from("push_subscriptions").delete().eq("id", s.id);
      } else {
        failed++;
        const txt = await res.text().catch(() => "");
        await admin
          .from("push_subscriptions")
          .update({ last_error: `HTTP ${res.status}: ${txt.slice(0, 200)}` })
          .eq("id", s.id);
      }
    } catch (err) {
      failed++;
      await admin
        .from("push_subscriptions")
        .update({ last_error: (err as Error).message.slice(0, 300) })
        .eq("id", s.id);
    }
  }

  return { delivered, removed, failed };
}
