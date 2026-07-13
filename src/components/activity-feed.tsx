import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Sparkles, Users, ArrowRightLeft, CheckSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActivityTimeline, type TimelineItem, type TimelineStatus } from "@/components/ui/activity-timeline";


type Kind = "contact" | "lead" | "task";
type Action = "insert" | "update" | "delete" | "stage" | "done";

type Activity = {
  id: string;
  at: number;
  kind: Kind;
  action: Action;
  title: string;
  detail?: string;
};

const MAX = 50;

export function ActivityFeed({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [items, setItems] = useState<Activity[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Guard against duplicate subscribe() calls for the same (component, orgId)
  // — StrictMode remounts and effect re-runs otherwise cause "already subscribed" errors.
  const subscribedFor = useRef<string | null>(null);
  // Keep the translator in a ref so a locale change does NOT re-run the effect
  // (which would tear down and rebuild the realtime channel unnecessarily).
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!orgId) return;
    if (subscribedFor.current === orgId) return;
    subscribedFor.current = orgId;
    const filter = `org_id=eq.${orgId}`;
    let disposed = false;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    const push = (a: Omit<Activity, "id" | "at">) => {
      const entry: Activity = { ...a, id: crypto.randomUUID(), at: Date.now() };
      setItems((prev) => [entry, ...prev].slice(0, MAX));
      setUnread((u) => u + 1);
      toast(entry.title, { description: entry.detail });
    };

    const channel = supabase
      .channel(`org-activity-${orgId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contacts", filter },
        (p) => {
          const r = p.new as any;
          push({
            kind: "contact",
            action: "insert",
            title: tRef.current("activity.contactCreated"),
            detail: r.full_name,
          });
          qc.invalidateQueries({ queryKey: ["contacts", orgId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contacts", filter },
        (p) => {
          const r = p.new as any;
          push({
            kind: "contact",
            action: "update",
            title: tRef.current("activity.contactUpdated"),
            detail: r.full_name,
          });
          qc.invalidateQueries({ queryKey: ["contacts", orgId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads", filter },
        (p) => {
          const r = p.new as any;
          push({
            kind: "lead",
            action: "insert",
            title: tRef.current("activity.leadCreated"),
            detail: tRef.current(`crm.leads.stages.${r.stage}`),
          });
          qc.invalidateQueries({ queryKey: ["leads", orgId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads", filter },
        (p) => {
          const oldR = p.old as any;
          const newR = p.new as any;
          if (oldR?.stage && newR?.stage && oldR.stage !== newR.stage) {
            push({
              kind: "lead",
              action: "stage",
              title: tRef.current("activity.leadStageMoved"),
              detail: `${tRef.current(`crm.leads.stages.${oldR.stage}`)} → ${tRef.current(`crm.leads.stages.${newR.stage}`)}`,
            });
          } else {
            push({ kind: "lead", action: "update", title: tRef.current("activity.leadUpdated") });
          }
          qc.invalidateQueries({ queryKey: ["leads", orgId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks", filter },
        (p) => {
          const r = p.new as any;
          push({
            kind: "task",
            action: "insert",
            title: tRef.current("activity.taskCreated"),
            detail: r.title,
          });
          qc.invalidateQueries({ queryKey: ["tasks", orgId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks", filter },
        (p) => {
          const oldR = p.old as any;
          const newR = p.new as any;
          if (oldR?.status !== "done" && newR?.status === "done") {
            push({
              kind: "task",
              action: "done",
              title: tRef.current("activity.taskDone"),
              detail: newR.title,
            });
          } else {
            push({
              kind: "task",
              action: "update",
              title: tRef.current("activity.taskUpdated"),
              detail: newR.title,
            });
          }
          qc.invalidateQueries({ queryKey: ["tasks", orgId] });
        },
      )
      .subscribe();
    activeChannel = channel;
    // If cleanup already ran before subscribe resolved, tear down immediately.
    if (disposed) {
      void supabase.removeChannel(channel).catch(() => {});
      activeChannel = null;
    }

    return () => {
      disposed = true;
      const ch = activeChannel;
      activeChannel = null;
      subscribedFor.current = null;
      if (!ch) return;
      try {
        // Unsubscribe first so no further callbacks fire, then remove.
        void ch.unsubscribe().catch(() => {});
      } catch {
        /* ignore */
      }
      void supabase.removeChannel(ch).catch(() => {});
    };
  }, [orgId, qc]);

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setUnread(0);
      }}
    >
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <Badge className="absolute -end-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] tabular-nums">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("activity.title")}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="mt-4 h-[calc(100vh-6rem)] pe-3">
          {(() => {
            const iconFor = (a: Activity) =>
              a.action === "stage"
                ? ArrowRightLeft
                : a.action === "update"
                  ? RefreshCw
                  : a.kind === "task"
                    ? CheckSquare
                    : a.kind === "lead"
                      ? Sparkles
                      : Users;
            const statusFor = (a: Activity): TimelineStatus =>
              a.action === "done"
                ? "success"
                : a.action === "insert"
                  ? "info"
                  : a.action === "stage"
                    ? "highlight"
                    : a.action === "delete"
                      ? "danger"
                      : "neutral";
            const badgeFor = (a: Activity) => {
              const key = `activity.actions.${a.action}`;
              const label = t(key);
              return label === key ? a.action : label;
            };
            const timeline: TimelineItem[] = items.map((a) => ({
              id: a.id,
              title: a.title,
              detail: a.detail,
              at: a.at,
              icon: iconFor(a),
              status: statusFor(a),
              badge: badgeFor(a),
            }));
            return <ActivityTimeline items={timeline} emptyLabel={t("activity.empty")} />;
          })()}
        </ScrollArea>

      </SheetContent>
    </Sheet>
  );
}
