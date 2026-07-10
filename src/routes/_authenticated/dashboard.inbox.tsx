import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Bell, Check, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sectionHead } from "@/lib/section-og-head";
import {
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from "@/lib/notifications.functions";
import { PushStatusCard } from "@/components/notifications/PushStatusCard";

export const Route = createFileRoute("/_authenticated/dashboard/inbox")({
  head: () =>
    sectionHead({
      section: "dashboard",
      entityAr: "صندوق الإشعارات",
      entityEn: "Inbox",
      path: "/dashboard/inbox",
    }),
  component: InboxPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{error.message}</div>
  ),
});

type QueueRow = {
  id: string;
  channel: string;
  template: string;
  status: string;
  variables: Record<string, unknown> | null;
  sent_at: string | null;
  created_at: string;
  read_at: string | null;
};

function extractLink(vars: Record<string, unknown> | null): string | null {
  if (!vars) return null;
  for (const k of ["link", "url", "href", "action_url"]) {
    const v = vars[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function extractTitle(vars: Record<string, unknown> | null, fallback: string): string {
  if (!vars) return fallback;
  for (const k of ["title", "subject", "heading"]) {
    const v = vars[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return fallback;
}

function extractBody(vars: Record<string, unknown> | null): string | null {
  if (!vars) return null;
  for (const k of ["body", "message", "reason", "text"]) {
    const v = vars[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function InboxPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? false;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["dashboard-inbox-queue", unreadOnly],
    queryFn: () => listMyNotifications({ data: { unreadOnly, limit: 100 } }),
    refetchInterval: 60_000,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markMyNotificationRead({ data: { id, read: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard-inbox-queue"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const markAll = useMutation({
    mutationFn: () => markAllMyNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-inbox-queue"] });
      toast.success(isAr ? "تم تعليم الكل كمقروء" : "All marked as read");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (q.data ?? []) as QueueRow[];
  const unreadCount = items.filter((r) => !r.read_at).length;

  return (
    <div className="mx-auto w-full max-w-[900px] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
            <Bell className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {isAr ? "صندوق الإشعارات" : "My inbox"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `${unreadCount} غير مقروءة`
                : `${unreadCount} unread`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Push status moved to a dedicated card below */}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs">
            <input
              type="checkbox"
              className="accent-primary"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            {isAr ? "غير المقروءة فقط" : "Unread only"}
          </label>
          <Button
            variant="outline"
            size="sm"
            disabled={markAll.isPending || unreadCount === 0}
            onClick={() => markAll.mutate()}
          >
            {markAll.isPending ? (
              <Loader2 className="size-4 me-2 animate-spin" />
            ) : (
              <CheckCheck className="size-4 me-2" />
            )}
            {isAr ? "تعليم الكل كمقروء" : "Mark all read"}
          </Button>
        </div>
      </div>

      <div className="surface-card divide-y divide-border/60">
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : q.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            {(q.error as Error)?.message ?? (isAr ? "خطأ" : "Error")}
          </p>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {isAr ? "لا توجد إشعارات" : "No notifications"}
          </p>
        ) : (
          items.map((n) => {
            const link = extractLink(n.variables);
            const title = extractTitle(n.variables, n.template);
            const body = extractBody(n.variables);
            const unread = !n.read_at;
            return (
              <div
                key={n.id}
                className="flex items-start gap-3 p-4 transition hover:bg-muted/30"
              >
                <div
                  className={
                    "mt-1 size-2 shrink-0 rounded-full " +
                    (unread ? "bg-primary" : "bg-muted-foreground/40")
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
                    </span>
                  </div>
                  {body && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                      {body}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {n.channel}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {n.template}
                    </Badge>
                    <Badge
                      variant={n.status === "sent" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {n.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {link && (
                    <Button
                      asChild
                      size="sm"
                      variant="default"
                      onClick={() => unread && markOne.mutate(n.id)}
                    >
                      <a
                        href={link}
                        target={link.startsWith("http") ? "_blank" : undefined}
                        rel={link.startsWith("http") ? "noopener noreferrer" : undefined}
                      >
                        <ExternalLink className="size-4 me-1" />
                        {isAr ? "فتح" : "Open"}
                      </a>
                    </Button>
                  )}
                  {unread && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markOne.isPending}
                      onClick={() => markOne.mutate(n.id)}
                    >
                      <Check className="size-4 me-1" />
                      {isAr ? "مقروء" : "Mark read"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
