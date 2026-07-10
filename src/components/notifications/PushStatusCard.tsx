/**
 * Inbox section: shows current Web Push status for the signed-in user
 * (browser support, permission, subscription state) and exposes explicit
 * Enable / Disable actions. Disable removes the server-side row from
 * `push_subscriptions` AND unsubscribes the browser's PushManager.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BellPlus, BellOff, HelpCircle, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  deletePushSubscription,
  getVapidKey,
  savePushSubscription,
} from "@/lib/push.functions";
import { PushPermissionHelpDialog } from "@/components/notifications/PushPermissionHelpDialog";

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

type PermState = "default" | "granted" | "denied" | "unsupported";

export function PushStatusCard() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? false;
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PermState>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "enable" | "disable" | "refresh">(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpReason, setHelpReason] = useState<"denied" | "dismissed" | "unsupported">("denied");

  const openHelp = (reason: "denied" | "dismissed" | "unsupported") => {
    setHelpReason(reason);
    setHelpOpen(true);
  };

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      typeof Notification !== "undefined";
    setSupported(ok);
    if (!ok) {
      setPermission("unsupported");
      setSubscribed(false);
      setEndpoint(null);
      return;
    }
    setPermission(Notification.permission as PermState);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
      setEndpoint(sub?.endpoint ?? null);
    } catch {
      setSubscribed(false);
      setEndpoint(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy("enable");
    try {
      if (Notification.permission === "denied") {
        toast.error(
          isAr
            ? "الإشعارات محظورة — افتح دليل التفعيل"
            : "Notifications blocked — see how to enable",
        );
        openHelp("denied");
        return;
      }
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error(isAr ? "تم رفض الإذن" : "Permission denied");
        openHelp(perm === "denied" ? "denied" : "dismissed");
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
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const ep = json.endpoint ?? sub.endpoint;
      const p256dh = json.keys?.p256dh ?? bufToBase64Url(sub.getKey("p256dh"));
      const auth = json.keys?.auth ?? bufToBase64Url(sub.getKey("auth"));
      await savePushSubscription({
        data: {
          endpoint: ep,
          p256dh,
          auth,
          user_agent: navigator.userAgent.slice(0, 500),
        },
      });
      toast.success(isAr ? "تم تفعيل إشعارات المتصفح" : "Browser push enabled");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    setBusy("disable");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      const ep = sub?.endpoint ?? endpoint;
      // Always try to remove the server row (covers stale rows after
      // browser data was cleared but the DB still has the subscription).
      if (ep) {
        try {
          await deletePushSubscription({ data: { endpoint: ep } });
        } catch (e) {
          // Non-fatal — continue to unsubscribe locally.
          console.warn("deletePushSubscription failed:", (e as Error).message);
        }
      }
      if (sub) {
        await sub.unsubscribe();
      }
      toast.success(
        isAr ? "تم إلغاء تفعيل إشعارات المتصفح" : "Browser push disabled",
      );
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const statusLabel = !supported
    ? isAr
      ? "غير مدعوم"
      : "Unsupported"
    : permission === "denied"
      ? isAr
        ? "محظور من المتصفح"
        : "Blocked in browser"
      : subscribed
        ? isAr
          ? "مُفعّل"
          : "Enabled"
        : permission === "granted"
          ? isAr
            ? "مسموح — غير مشترك"
            : "Allowed — not subscribed"
          : isAr
            ? "غير مُفعّل"
            : "Disabled";

  const statusVariant: "default" | "secondary" | "outline" | "destructive" =
    !supported || permission === "denied"
      ? "destructive"
      : subscribed
        ? "default"
        : "secondary";

  return (
    <div className="surface-card mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
            {subscribed ? (
              <BellPlus className="size-5" />
            ) : (
              <BellOff className="size-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">
                {isAr ? "إشعارات المتصفح (Push)" : "Browser push notifications"}
              </h2>
              <Badge variant={statusVariant} className="text-[10px]">
                {statusLabel}
              </Badge>
            </div>
            <p className="mt-1 max-w-[520px] text-xs text-muted-foreground">
              {isAr
                ? "استقبل تنبيهات فورية عند وصول إشعارات جديدة حتى عندما تكون الصفحة مغلقة على هذا الجهاز/المتصفح."
                : "Receive instant alerts for new notifications on this device/browser even when the tab is closed."}
            </p>
            {permission === "denied" && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-destructive">
                <ShieldAlert className="size-3.5" />
                {isAr
                  ? "افتح إعدادات الموقع في المتصفح واسمح بالإشعارات لتفعيلها."
                  : "Open site settings in the browser and allow notifications to enable."}
              </p>
            )}
            {subscribed && endpoint && (
              <p
                className="mt-2 truncate text-[10px] text-muted-foreground"
                title={endpoint}
                dir="ltr"
              >
                {endpoint}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => {
              setBusy("refresh");
              void refresh().finally(() => setBusy(null));
            }}
            aria-label={isAr ? "تحديث الحالة" : "Refresh status"}
          >
            {busy === "refresh" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
          {supported && !subscribed && (
            <Button
              size="sm"
              disabled={busy !== null || permission === "denied"}
              onClick={enable}
            >
              {busy === "enable" ? (
                <Loader2 className="size-4 me-2 animate-spin" />
              ) : (
                <BellPlus className="size-4 me-2" />
              )}
              {isAr ? "تفعيل" : "Enable"}
            </Button>
          )}
          {supported && subscribed && (
            <Button
              size="sm"
              variant="destructive"
              disabled={busy !== null}
              onClick={disable}
            >
              {busy === "disable" ? (
                <Loader2 className="size-4 me-2 animate-spin" />
              ) : (
                <BellOff className="size-4 me-2" />
              )}
              {isAr ? "إلغاء التفعيل" : "Disable"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
