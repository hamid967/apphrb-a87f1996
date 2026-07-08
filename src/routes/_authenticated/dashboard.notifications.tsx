import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { Archive, Bell, Check, CheckCheck, ExternalLink, Filter, Inbox, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { sectionHead } from "@/lib/section-og-head";
const SearchSchema = z.object({
  tab: z.enum(["all", "unread", "read", "archived"]).catch("all"),
  type: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/dashboard/notifications")({
  validateSearch: zodValidator(SearchSchema),
  head: () => sectionHead({ section: "dashboard", entityAr: "الإشعارات", entityEn: "Notifications", path: "/dashboard/notifications" }),
  component: NotificationsCenter,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{error.message}</div>
  ),
});

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
};

function NotificationsCenter() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar") ?? false;
  const dfLocale = isAr ? ar : enUS;
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const q = useQuery({
    enabled: !!user?.id,
    queryKey: [
      "notifications-center",
      user?.id,
      search.tab,
      search.type ?? "all",
      search.from ?? "",
      search.to ?? "",
    ],
    refetchInterval: 60_000,
    queryFn: async () => {
      let req = supabase
        .from("notifications")
        .select("id, title, body, type, link, read_at, archived_at, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (search.tab === "archived") {
        req = req.not("archived_at", "is", null);
      } else {
        req = req.is("archived_at", null);
        if (search.tab === "unread") req = req.is("read_at", null);
        if (search.tab === "read") req = req.not("read_at", "is", null);
      }
      if (search.type && search.type !== "all") req = req.eq("type", search.type);
      if (search.from) req = req.gte("created_at", `${search.from}T00:00:00`);
      if (search.to) req = req.lte("created_at", `${search.to}T23:59:59`);
      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as NotifRow[];
    },
  });

  // Independent counts (so switching tabs doesn't lose the badge).
  const countsQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["notifications-counts", user?.id],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [total, unread, archived] = await Promise.all([
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .is("archived_at", null),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .is("read_at", null)
          .is("archived_at", null),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .not("archived_at", "is", null),
      ]);
      return {
        total: total.count ?? 0,
        unread: unread.count ?? 0,
        archived: archived.count ?? 0,
      };
    },
  });

  // Full list of distinct types for the filter dropdown.
  const typesQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["notifications-types", user?.id],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("type")
        .eq("user_id", user!.id)
        .order("type")
        .limit(500);
      const set = new Set<string>();
      (data ?? []).forEach((r) => r.type && set.add(r.type));
      return Array.from(set).sort();
    },
  });

  const items = q.data ?? [];

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["notifications-center"] });
    qc.invalidateQueries({ queryKey: ["notifications-counts"] });
    qc.invalidateQueries({ queryKey: ["topbar-notif-count"] });
  };

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    // Optimistic update: mark the row read immediately in every cached list
    // and count so the UI reacts before the network round-trip returns.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notifications-center"] });
      const nowIso = new Date().toISOString();
      const prevLists = qc.getQueriesData<NotifRow[]>({ queryKey: ["notifications-center"] });
      prevLists.forEach(([key, rows]) => {
        if (!rows) return;
        qc.setQueryData<NotifRow[]>(
          key,
          rows.map((r) => (r.id === id ? { ...r, read_at: r.read_at ?? nowIso } : r)),
        );
      });
      const prevCounts = qc.getQueryData<{ total: number; unread: number }>([
        "notifications-counts",
        user?.id,
      ]);
      if (prevCounts) {
        qc.setQueryData(["notifications-counts", user?.id], {
          ...prevCounts,
          unread: Math.max(0, prevCounts.unread - 1),
        });
      }
      return { prevLists, prevCounts };
    },
    onError: (e: Error, _id, ctx) => {
      ctx?.prevLists?.forEach(([key, rows]) => qc.setQueryData(key, rows));
      if (ctx?.prevCounts) qc.setQueryData(["notifications-counts", user?.id], ctx.prevCounts);
      toast.error(e.message);
    },
    onSettled: invalidateAll,
  });

  const markUnread = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: null })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notifications-center"] });
      const prevLists = qc.getQueriesData<NotifRow[]>({ queryKey: ["notifications-center"] });
      prevLists.forEach(([key, rows]) => {
        if (!rows) return;
        qc.setQueryData<NotifRow[]>(
          key,
          rows.map((r) => (r.id === id ? { ...r, read_at: null } : r)),
        );
      });
      const prevCounts = qc.getQueryData<{ total: number; unread: number }>([
        "notifications-counts",
        user?.id,
      ]);
      if (prevCounts) {
        qc.setQueryData(["notifications-counts", user?.id], {
          ...prevCounts,
          unread: prevCounts.unread + 1,
        });
      }
      return { prevLists, prevCounts };
    },
    onError: (e: Error, _id, ctx) => {
      ctx?.prevLists?.forEach(([key, rows]) => qc.setQueryData(key, rows));
      if (ctx?.prevCounts) qc.setQueryData(["notifications-counts", user?.id], ctx.prevCounts);
      toast.error(e.message);
    },
    onSettled: invalidateAll,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user!.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications-center"] });
      const nowIso = new Date().toISOString();
      const prevLists = qc.getQueriesData<NotifRow[]>({ queryKey: ["notifications-center"] });
      prevLists.forEach(([key, rows]) => {
        if (!rows) return;
        qc.setQueryData<NotifRow[]>(
          key,
          rows.map((r) => (r.read_at ? r : { ...r, read_at: nowIso })),
        );
      });
      const prevCounts = qc.getQueryData<{ total: number; unread: number }>([
        "notifications-counts",
        user?.id,
      ]);
      if (prevCounts) {
        qc.setQueryData(["notifications-counts", user?.id], {
          ...prevCounts,
          unread: 0,
        });
      }
      return { prevLists, prevCounts };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.prevLists?.forEach(([key, rows]) => qc.setQueryData(key, rows));
      if (ctx?.prevCounts) qc.setQueryData(["notifications-counts", user?.id], ctx.prevCounts);
      toast.error(e.message);
    },
    onSettled: () => {
      invalidateAll();
      toast.success(isAr ? "تم تعليم الكل كمقروءة" : "All marked as read");
    },
  });

  const archiveAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ archived_at: new Date().toISOString() })
        .eq("user_id", user!.id)
        .is("archived_at", null)
        .is("read_at", null);
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications-center"] });
      const nowIso = new Date().toISOString();
      const prevLists = qc.getQueriesData<NotifRow[]>({ queryKey: ["notifications-center"] });
      prevLists.forEach(([key, rows]) => {
        if (!rows) return;
        qc.setQueryData<NotifRow[]>(
          key,
          rows.filter((r) => r.read_at),
        );
      });
      const prevCounts = qc.getQueryData<{ total: number; unread: number; archived: number }>([
        "notifications-counts",
        user?.id,
      ]);
      const removedUnread = prevLists
        .flatMap(([, rows]) => rows ?? [])
        .filter((r) => !r.read_at && !r.archived_at).length;
      if (prevCounts) {
        qc.setQueryData(["notifications-counts", user?.id], {
          total: Math.max(0, prevCounts.total - removedUnread),
          unread: 0,
          archived: prevCounts.archived + removedUnread,
        });
      }
      return { prevLists, prevCounts };
    },
    onError: (e: Error, _vars, ctx) => {
      ctx?.prevLists?.forEach(([key, rows]) => qc.setQueryData(key, rows));
      if (ctx?.prevCounts) qc.setQueryData(["notifications-counts", user?.id], ctx.prevCounts);
      toast.error(e.message);
    },
    onSettled: () => {
      invalidateAll();
      toast.success(isAr ? "تم أرشفة الكل" : "All archived");
    },
  });

  const unarchive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ archived_at: null })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notifications-center"] });
      const prevLists = qc.getQueriesData<NotifRow[]>({ queryKey: ["notifications-center"] });
      prevLists.forEach(([key, rows]) => {
        if (!rows) return;
        qc.setQueryData<NotifRow[]>(
          key,
          rows.map((r) => (r.id === id ? { ...r, archived_at: null } : r)),
        );
      });
      const prevCounts = qc.getQueryData<{ total: number; unread: number; archived: number }>([
        "notifications-counts",
        user?.id,
      ]);
      if (prevCounts) {
        qc.setQueryData(["notifications-counts", user?.id], {
          total: prevCounts.total + 1,
          archived: Math.max(0, prevCounts.archived - 1),
          unread: prevCounts.unread,
        });
      }
      return { prevLists, prevCounts };
    },
    onError: (e: Error, _id, ctx) => {
      ctx?.prevLists?.forEach(([key, rows]) => qc.setQueryData(key, rows));
      if (ctx?.prevCounts) qc.setQueryData(["notifications-counts", user?.id], ctx.prevCounts);
      toast.error(e.message);
    },
    onSettled: invalidateAll,
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notifications-center"] });
      const prevLists = qc.getQueriesData<NotifRow[]>({ queryKey: ["notifications-center"] });
      prevLists.forEach(([key, rows]) => {
        if (!rows) return;
        qc.setQueryData<NotifRow[]>(
          key,
          rows.filter((r) => r.id !== id),
        );
      });
      const prevCounts = qc.getQueryData<{ total: number; unread: number; archived: number }>([
        "notifications-counts",
        user?.id,
      ]);
      const removed = prevLists.flatMap(([, rows]) => rows ?? []).filter((r) => r.id === id && !r.archived_at);
      if (prevCounts && removed.length) {
        qc.setQueryData(["notifications-counts", user?.id], {
          total: Math.max(0, prevCounts.total - removed.length),
          unread: Math.max(0, prevCounts.unread - removed.filter((r) => !r.read_at).length),
          archived: prevCounts.archived + removed.length,
        });
      }
      return { prevLists, prevCounts };
    },
    onError: (e: Error, _id, ctx) => {
      ctx?.prevLists?.forEach(([key, rows]) => qc.setQueryData(key, rows));
      if (ctx?.prevCounts) qc.setQueryData(["notifications-counts", user?.id], ctx.prevCounts);
      toast.error(e.message);
    },
    onSettled: invalidateAll,
  });

  const typeLabel = useMemo(() => {
    const AR: Record<string, string> = {
      "application.status_changed": "تغيير حالة طلب",
      "application.note_added": "ملاحظة على طلب",
      "application.approved": "قبول طلب",
      "application.rejected": "رفض طلب",
    };
    return (type: string) => (isAr ? AR[type] ?? type : type);
  }, [isAr]);

  const setSearch = (patch: Partial<z.infer<typeof SearchSchema>>) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) as never,
      replace: true,
    });
  };

  const clearFilters = () =>
    navigate({ search: { tab: search.tab } as never, replace: true });

  const hasFilters =
    (search.type && search.type !== "all") || search.from || search.to;

  return (
    <div className="mx-auto w-full max-w-[1000px] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
            <Bell className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {isAr ? "مركز الإشعارات" : "Notifications center"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `${countsQ.data?.unread ?? 0} غير مقروءة من ${countsQ.data?.total ?? 0}`
                : `${countsQ.data?.unread ?? 0} unread of ${countsQ.data?.total ?? 0}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={markAll.isPending || (countsQ.data?.unread ?? 0) === 0}
            onClick={() => markAll.mutate()}
          >
            {markAll.isPending ? (
              <Loader2 className="size-4 me-2 animate-spin" />
            ) : (
              <CheckCheck className="size-4 me-2" />
            )}
            {isAr ? "تعليم الكل كمقروءة" : "Mark all as read"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={archiveAll.isPending || (countsQ.data?.unread ?? 0) === 0}
            onClick={() => archiveAll.mutate()}
          >
            {archiveAll.isPending ? (
              <Loader2 className="size-4 me-2 animate-spin" />
            ) : (
              <Inbox className="size-4 me-2" />
            )}
            {isAr ? "أرشفة غير المقروءة" : "Archive unread"}
          </Button>
        </div>
      </div>

      <Tabs
        value={search.tab}
        onValueChange={(v: string) => setSearch({ tab: v as "all" | "unread" | "read" | "archived" })}
        dir={isAr ? "rtl" : "ltr"}
      >
        <TabsList className="mb-4">
          <TabsTrigger value="all">
            {isAr ? "الكل" : "All"}
            <span className="ms-2 text-[10px] opacity-70">
              {countsQ.data?.total ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger value="unread">
            {isAr ? "غير مقروءة" : "Unread"}
            {countsQ.data?.unread ? (
              <Badge className="ms-2 h-4 px-1.5 text-[10px]">
                {countsQ.data.unread}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="read">{isAr ? "مقروءة" : "Read"}</TabsTrigger>
          <TabsTrigger value="archived">
            {isAr ? "مؤرشفة" : "Archived"}
            {countsQ.data?.archived ? (
              <Badge className="ms-2 h-4 px-1.5 text-[10px]">
                {countsQ.data.archived}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="size-4" />
            {isAr ? "التصفية" : "Filters"}
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="ms-auto h-7 text-xs"
                onClick={clearFilters}
              >
                <X className="size-3 me-1" />
                {isAr ? "مسح" : "Clear"}
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1 block text-xs">
              {isAr ? "النوع" : "Type"}
            </Label>
            <Select
              value={search.type ?? "all"}
              onValueChange={(v) => setSearch({ type: v === "all" ? undefined : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "كل الأنواع" : "All types"}</SelectItem>
                {(typesQ.data ?? []).map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {typeLabel(tp)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">{isAr ? "من تاريخ" : "From"}</Label>
            <Input
              type="date"
              value={search.from ?? ""}
              onChange={(e) => setSearch({ from: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">{isAr ? "إلى تاريخ" : "To"}</Label>
            <Input
              type="date"
              value={search.to ?? ""}
              onChange={(e) => setSearch({ to: e.target.value || undefined })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-card">
        {q.isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-muted/40"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
            <Inbox className="size-8 opacity-50" />
            <p className="text-sm">
              {isAr ? "لا توجد إشعارات تطابق التصفية" : "No notifications match the filters"}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((n) => {
              const unread = !n.read_at;
              return (
                <li
                  key={n.id}
                  className={
                    "group flex items-start gap-3 p-4 transition hover:bg-muted/40 " +
                    (unread ? "bg-primary/[0.03]" : "")
                  }
                >
                  <div
                    className={
                      "mt-1.5 size-2 shrink-0 rounded-full " +
                      (unread ? "bg-primary" : "bg-muted-foreground/30")
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.link ? (
                        <a
                          href={n.link}
                          onClick={(e) => {
                            e.preventDefault();
                            if (unread) markRead.mutate(n.id);
                            navigate({ to: n.link! as never, replace: false });
                          }}
                          className={
                            "truncate text-sm hover:underline cursor-pointer " +
                            (unread ? "font-semibold" : "font-medium")
                          }
                        >
                          {n.title}
                        </a>
                      ) : (
                        <span
                          className={
                            "truncate text-sm " +
                            (unread ? "font-semibold" : "font-medium")
                          }
                        >
                          {n.title}
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {typeLabel(n.type)}
                      </Badge>
                    </div>
                    {n.body && (
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                          locale: dfLocale,
                        })}
                      </span>
                      <span>·</span>
                      <span dir="ltr">
                        {new Date(n.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
                      </span>
                    </div>
                    {n.link && (
                      <div className="mt-2">
                        <a
                          href={n.link}
                          onClick={(e) => {
                            e.preventDefault();
                            if (unread) markRead.mutate(n.id);
                            navigate({ to: n.link! as never, replace: false });
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
                        >
                          <ExternalLink className="size-3" />
                          {isAr ? "فتح تفاصيل الطلب" : "Open application details"}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    {search.tab === "archived" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        disabled={unarchive.isPending}
                        onClick={() => unarchive.mutate(n.id)}
                        aria-label={isAr ? "إلغاء الأرشفة" : "Unarchive"}
                      >
                        {unarchive.isPending && unarchive.variables === n.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Inbox className="size-3.5" />
                        )}
                        {isAr ? "إلغاء الأرشفة" : "Unarchive"}
                      </Button>
                    ) : unread ? (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 gap-1 text-xs"
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(n.id)}
                        aria-label={isAr ? "علِّم كمقروء" : "Mark as read"}
                      >
                        {markRead.isPending && markRead.variables === n.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        {isAr ? "علِّم كمقروء" : "Mark as read"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        disabled={markUnread.isPending}
                        onClick={() => markUnread.mutate(n.id)}
                        aria-label={isAr ? "تعليم كغير مقروءة" : "Mark as unread"}
                      >
                        {isAr ? "تعليم كغير مقروءة" : "Mark unread"}
                      </Button>
                    )}
                    {search.tab !== "archived" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        disabled={archive.isPending}
                        onClick={() => archive.mutate(n.id)}
                        aria-label={isAr ? "أرشفة" : "Archive"}
                      >
                        {archive.isPending && archive.variables === n.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Archive className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}