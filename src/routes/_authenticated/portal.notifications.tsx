import { createFileRoute } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Send } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";
import { Button } from "@/components/ui/button";
import {
  listPortalNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/portal.functions";
import { listOrgNotifications } from "@/lib/notifications.functions";
import { useCurrentOrg } from "@/hooks/use-current-org";

export const Route = createFileRoute("/_authenticated/portal/notifications")({
  head: () => portalHead({ titleAr: 'الإشعارات', titleEn: 'Notifications', descAr: 'كل إشعاراتك من محطتك.', path: '/portal/notifications' }),
  component: NotificationsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

function NotificationsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "notifications", unreadOnly],
    queryFn: () => listPortalNotifications({ data: { unreadOnly } }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal"] }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portal"] }),
  });
  return (
    <div className="mx-auto max-w-[900px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<Bell className="size-5" />}
        title={isAr ? "الإشعارات" : "Notifications"}
        subtitle={isAr ? "تنبيهات النظام والاستحقاقات" : "System & expiry alerts"}
        actions={
          <>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                className="accent-primary"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              {isAr ? "غير المقروءة فقط" : "Unread only"}
            </label>
            <Button size="sm" variant="outline" onClick={() => markAll.mutate()}>
              <CheckCheck className="size-4" /> {isAr ? "تعليم الكل" : "Mark all read"}
            </Button>
          </>
        }
      />
      <div className="surface-card divide-y divide-border/60">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {isAr ? "لا إشعارات" : "No notifications"}
          </p>
        ) : (
          data.items.map((n: any) => (
            <button
              key={n.id}
              onClick={() => !n.read_at && markOne.mutate(n.id)}
              className="flex w-full items-start gap-3 p-4 text-start transition hover:bg-muted/30"
            >
              <div
                className={
                  "mt-1 size-2 shrink-0 rounded-full " +
                  (n.read_at ? "bg-muted-foreground/40" : "bg-primary")
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
                  </span>
                </div>
                {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                {n.type && (
                  <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {n.type}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
      <OrgDeliveryLog isAr={isAr} />
    </div>
  );
}

/**
 * Org-wide delivery log (WhatsApp / SMS / email queue). Backed by
 * `listOrgNotifications`. Only rendered when the current user belongs to
 * an org so RLS has something to scope against.
 */
function OrgDeliveryLog({ isAr }: { isAr: boolean }) {
  const { orgId, ready } = useCurrentOrg();
  const [status, setStatus] = useState<"all" | "pending" | "sent" | "failed">("all");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["org", "notifications", orgId, status],
    enabled: ready && !!orgId,
    queryFn: () =>
      listOrgNotifications({
        data: {
          org_id: orgId!,
          status: status === "all" ? undefined : (status as "pending" | "sent" | "failed"),
          limit: 50,
        },
      }),
    staleTime: 30_000,
  });
  if (!ready || !orgId) return null;

  const badge = (s: string) => {
    const tone =
      s === "sent"
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
        : s === "failed"
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : s === "pending_credentials"
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
            : "bg-muted text-muted-foreground border-border";
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${tone}`}>
        {s.replace("_", " ")}
      </span>
    );
  };

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold">
          <Send className="size-4" />
          {isAr ? "سجل إرسال الإشعارات" : "Delivery log"}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "pending", "sent", "failed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={
                "rounded-full border px-2.5 py-1 text-[11px] transition " +
                (status === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40")
              }
            >
              {isAr
                ? { all: "الكل", pending: "قيد الإرسال", sent: "مُرسل", failed: "فشل" }[s]
                : s}
            </button>
          ))}
        </div>
      </div>
      <div className="surface-card divide-y divide-border/60">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-destructive">
            {isAr ? "تعذّر تحميل السجل" : "Could not load delivery log"}
          </p>
        ) : !data || data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {isAr ? "لا رسائل في السجل" : "No delivery records"}
          </p>
        ) : (
          data.map((n) => (
            <div key={n.id} className="flex items-start gap-3 p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {n.channel}
                  </span>
                  <span className="truncate text-sm font-medium">{n.template}</span>
                  {badge(n.status)}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {isAr ? "إلى:" : "To:"} <span dir="ltr">{n.recipient}</span>
                  {n.attempts ? (
                    <span className="ms-2">
                      {isAr ? "المحاولات:" : "attempts:"} {n.attempts}
                    </span>
                  ) : null}
                </p>
                {n.last_error && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-destructive/80" dir="ltr">
                    {n.last_error}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {new Date((n.sent_at ?? n.created_at) as string).toLocaleString(
                  isAr ? "ar-SA" : "en-US",
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
