/**
 * Client component: toggle Web Push subscription for the current user.
 * Registers /push-sw.js, requests Notification permission, subscribes to
 * PushManager with the server's VAPID public key, and persists the
 * subscription via the `savePushSubscription` server fn.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BellPlus, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deletePushSubscription,
  getVapidKey,
  savePushSubscription,
} from "@/lib/push.functions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

function bufToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function PushEnableButton() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? false;
  const [supported, setSupported] = useState<boolean>(false);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof Notification !== "undefined";
    setSupported(ok);
    if (!ok) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
        const sub = await reg?.pushManager.getSubscription();
        setSubscribed(Boolean(sub));
      } catch {
        // ignore
      }
    })();
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      if (Notification.permission === "denied") {
        toast.error(
          isAr
            ? "الإشعارات محظورة من إعدادات المتصفح"
            : "Notifications are blocked in browser settings",
        );
        return;
      }
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error(isAr ? "تم رفض الإذن" : "Permission denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const { publicKey } = await getVapidKey();
      if (!publicKey) {
        toast.error(isAr ? "مفتاح VAPID غير مضبوط" : "VAPID key not configured");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const endpoint = json.endpoint ?? sub.endpoint;
      const p256dh = json.keys?.p256dh ?? bufToBase64Url(sub.getKey("p256dh"));
      const auth = json.keys?.auth ?? bufToBase64Url(sub.getKey("auth"));
      await savePushSubscription({
        data: {
          endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent.slice(0, 500),
        },
      });
      setSubscribed(true);
      toast.success(isAr ? "تم تفعيل إشعارات المتصفح" : "Browser push enabled");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await deletePushSubscription({ data: { endpoint } });
      }
      setSubscribed(false);
      toast.success(isAr ? "تم إيقاف الإشعارات" : "Push disabled");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <span className="text-[11px] text-muted-foreground">
        {isAr ? "المتصفح لا يدعم Push" : "Push not supported"}
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant={subscribed ? "outline" : "default"}
      disabled={busy}
      onClick={subscribed ? disable : enable}
    >
      {busy ? (
        <Loader2 className="size-4 me-2 animate-spin" />
      ) : subscribed ? (
        <BellOff className="size-4 me-2" />
      ) : (
        <BellPlus className="size-4 me-2" />
      )}
      {subscribed
        ? isAr
          ? "إيقاف إشعارات المتصفح"
          : "Disable browser push"
        : isAr
          ? "تفعيل إشعارات المتصفح"
          : "Enable browser push"}
    </Button>
  );
}
