import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Bell,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listQueueForAdmin,
  getQueueStats,
  getProviderHealth,
  retryDeadLetterNotification,
  type QueueRow,
} from "@/lib/notifications-admin.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/notifications-queue")({
  head: () => sectionHead({ section: "admin", entityAr: "طابور الإشعارات", entityEn: "Notifications Queue", path: "/admin/notifications-queue" }),
  component: NotificationsQueuePage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    // Kept Arabic-only inside the error boundary — no hook access here.
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          {"إعادة المحاولة / Retry"}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{"غير موجود / Not found"}</div>,
});

type StatusFilter = "" | "pending" | "pending_credentials" | "sent" | "failed" | "skipped" | "dead_letter";
type ChannelFilter = "" | "whatsapp" | "sms" | "email";

type StatusVariant = "default" | "secondary" | "destructive" | "outline";
const STATUS_META: Record<string, { ar: string; en: string; variant: StatusVariant }> = {
  sent: { ar: "أُرسل", en: "Sent", variant: "default" },
  failed: { ar: "فشل", en: "Failed", variant: "destructive" },
  dead_letter: { ar: "متوقّف", en: "Dead-letter", variant: "destructive" },
  pending: { ar: "بالانتظار", en: "Pending", variant: "secondary" },
  pending_credentials: { ar: "بانتظار الاعتماد", en: "Awaiting credentials", variant: "outline" },
  skipped: { ar: "تم التخطّي", en: "Skipped", variant: "outline" },
};

const CHANNEL_LABEL_AR: Record<string, string> = { whatsapp: "واتساب", sms: "SMS", email: "بريد" };
const CHANNEL_LABEL_EN: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" };

function fmt(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale, { hour12: false });
}

function NotificationsQueuePage() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || "ar").startsWith("ar");
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("");
  const [channel, setChannel] = useState<ChannelFilter>("");
  const [orgId, setOrgId] = useState("");
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listQueueForAdmin);
  const statsFn = useServerFn(getQueueStats);
  const healthFn = useServerFn(getProviderHealth);
  const retryFn = useServerFn(retryDeadLetterNotification);

  const listQ = useQuery({
    queryKey: ["admin-nq", status, channel, orgId, search],
    queryFn: () =>
      listFn({
        data: {
          status: status || undefined,
          channel: channel || undefined,
          org_id: orgId || undefined,
          search: search || undefined,
          limit: 200,
        },
      }),
  });
  const statsQ = useQuery({ queryKey: ["admin-nq-stats"], queryFn: () => statsFn({}) });
  const healthQ = useQuery({ queryKey: ["admin-nq-health"], queryFn: () => healthFn({}) });

  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: () => {
      toast.success(isAr ? "تمت إعادة الجدولة" : "Rescheduled");
      qc.invalidateQueries({ queryKey: ["admin-nq"] });
      qc.invalidateQueries({ queryKey: ["admin-nq-stats"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : isAr ? "فشلت الإعادة" : "Retry failed"),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-nq"] });
    qc.invalidateQueries({ queryKey: ["admin-nq-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-nq-health"] });
  };

  const rows: QueueRow[] = listQ.data ?? [];
  const stats = statsQ.data;
  const health = healthQ.data;
  const hasFilters = !!(status || channel || orgId || search);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <AdminPageHeader
        icon={Bell}
        ar="طابور الإشعارات"
        en="Notifications Queue"
        descriptionAr="مراقبة إرسال WhatsApp/SMS/Email وإعادة تشغيل الرسائل المتوقّفة"
        descriptionEn="Monitor WhatsApp/SMS/Email sends and requeue dead-letter messages"
        actions={
          <Button size="sm" variant="outline" onClick={refreshAll} disabled={listQ.isFetching}>
            <RefreshCw className={"me-2 size-4 " + (listQ.isFetching ? "animate-spin" : "")} />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard isAr={isAr} label={isAr ? "أُرسلت 24س" : "Sent 24h"} value={stats?.last_24h.sent ?? 0} icon={CheckCircle2} tone="ok" />
        <StatCard isAr={isAr} label={isAr ? "فشلت 24س" : "Failed 24h"} value={stats?.last_24h.failed ?? 0} icon={XCircle} tone="err" />
        <StatCard isAr={isAr} label={isAr ? "بالانتظار" : "Pending"} value={stats?.totals.pending ?? 0} icon={Clock} tone="muted" />
        <StatCard
          isAr={isAr}
          label={isAr ? "بانتظار اعتماد" : "Awaiting credentials"}
          value={stats?.totals.pending_credentials ?? 0}
          icon={ShieldAlert}
          tone="muted"
        />
        <StatCard
          isAr={isAr}
          label={isAr ? "متوقّف (dead-letter)" : "Dead-letter"}
          value={stats?.totals.dead_letter ?? 0}
          icon={ShieldAlert}
          tone={stats && stats.totals.dead_letter > 0 ? "err" : "muted"}
        />
      </div>

      {/* Provider health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{isAr ? "حالة المزوّدين" : "Provider health"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <ProviderPill isAr={isAr} name={isAr ? "واتساب" : "WhatsApp"} icon={MessageSquare} ok={!!health?.whatsapp.configured} />
          <ProviderPill isAr={isAr} name="SMS" icon={MessageSquare} ok={!!health?.sms.configured} />
          <ProviderPill isAr={isAr} name={isAr ? "البريد" : "Email"} icon={Mail} ok={!!health?.email.configured} />
          {health && (
            <div className="ms-auto self-center text-xs text-muted-foreground" dir="ltr">
              default_cc: +{health.default_country_code}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{isAr ? "مرشحات" : "Filters"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>{isAr ? "الحالة" : "Status"}</Label>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : (v as StatusFilter))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={isAr ? "الكل" : "All"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                <SelectItem value="pending">{isAr ? "بالانتظار" : "Pending"}</SelectItem>
                <SelectItem value="pending_credentials">{isAr ? "بانتظار الاعتماد" : "Awaiting credentials"}</SelectItem>
                <SelectItem value="sent">{isAr ? "أُرسل" : "Sent"}</SelectItem>
                <SelectItem value="failed">{isAr ? "فشل" : "Failed"}</SelectItem>
                <SelectItem value="skipped">{isAr ? "تم التخطّي" : "Skipped"}</SelectItem>
                <SelectItem value="dead_letter">{isAr ? "متوقّف" : "Dead-letter"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "القناة" : "Channel"}</Label>
            <Select value={channel || "all"} onValueChange={(v) => setChannel(v === "all" ? "" : (v as ChannelFilter))}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={isAr ? "الكل" : "All"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                <SelectItem value="whatsapp">{isAr ? "واتساب" : "WhatsApp"}</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">{isAr ? "بريد" : "Email"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isAr ? "المنظمة (UUID)" : "Organization (UUID)"}</Label>
            <Input
              value={orgId}
              onChange={(e) => setOrgId(e.target.value.trim())}
              placeholder={isAr ? "اختياري" : "Optional"}
              dir="ltr"
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label>{isAr ? "بحث بالمستلم" : "Search recipient"}</Label>
            <div className="relative mt-1">
              <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAr ? "+9665… أو user@…" : "+9665… or user@…"}
                dir="ltr"
                className="ps-9"
              />
            </div>
          </div>
          {hasFilters && (
            <div className="md:col-span-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setStatus("");
                  setChannel("");
                  setOrgId("");
                  setSearch("");
                }}
              >
                {isAr ? "مسح المرشحات" : "Clear filters"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isAr ? `آخر ${rows.length} صف` : `Last ${rows.length} rows`}
            {listQ.isFetching && (
              <Loader2 className="ms-2 inline size-3 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 && !listQ.isLoading ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد صفوف مطابقة للمرشحات." : "No rows match the filters."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <Th>{isAr ? "المنظمة" : "Organization"}</Th>
                    <Th>{isAr ? "القناة" : "Channel"}</Th>
                    <Th>{isAr ? "المستلم" : "Recipient"}</Th>
                    <Th>{isAr ? "القالب" : "Template"}</Th>
                    <Th>{isAr ? "الحالة" : "Status"}</Th>
                    <Th>{isAr ? "المحاولات" : "Attempts"}</Th>
                    <Th>{isAr ? "آخر خطأ" : "Last error"}</Th>
                    <Th>{isAr ? "أُنشئ" : "Created"}</Th>
                    <Th>{isAr ? "أُرسل" : "Sent"}</Th>
                    <Th>{isAr ? "إجراء" : "Action"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <QueueRowView key={r.id} isAr={isAr} r={r} onRetry={() => retry.mutate(r.id)} retrying={retry.isPending} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{children}</th>;
}

function StatCard({
  isAr,
  label,
  value,
  icon: Icon,
  tone,
}: {
  isAr: boolean;
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "ok" | "err" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-600" : tone === "err" ? "text-destructive" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid size-10 place-items-center rounded-md bg-muted/40 ${toneCls}`}>
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString(isAr ? "ar-SA" : "en-US")}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderPill({
  isAr,
  name,
  icon: Icon,
  ok,
}: {
  isAr: boolean;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  ok: boolean;
}) {
  return (
    <div
      className={
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm " +
        (ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5")
      }
    >
      <Icon className={"size-4 " + (ok ? "text-emerald-600" : "text-destructive")} />
      <span>{name}</span>
      <span className={"text-xs " + (ok ? "text-emerald-700" : "text-destructive")}>
        {ok ? (isAr ? "مفعّل" : "Enabled") : (isAr ? "غير مُعد" : "Not configured")}
      </span>
    </div>
  );
}

function QueueRowView({
  isAr,
  r,
  onRetry,
  retrying,
}: {
  isAr: boolean;
  r: QueueRow;
  onRetry: () => void;
  retrying: boolean;
}) {
  const metaBase = STATUS_META[r.status];
  const meta = metaBase
    ? { label: isAr ? metaBase.ar : metaBase.en, variant: metaBase.variant }
    : { label: r.status, variant: "outline" as StatusVariant };
  const orgLabel = r.organizations?.name ?? r.org_id.slice(0, 8);
  const CHANNEL_LABEL = isAr ? CHANNEL_LABEL_AR : CHANNEL_LABEL_EN;
  const locale = isAr ? "ar-SA" : "en-US";
  const shortErr = useMemo(() => {
    if (!r.last_error) return null;
    return r.last_error.length > 80 ? r.last_error.slice(0, 80) + "…" : r.last_error;
  }, [r.last_error]);
  return (
    <tr className="border-t align-top">
      <td className="px-3 py-2">
        <div className="text-xs">{orgLabel}</div>
        <div className="font-mono text-[10px] text-muted-foreground" dir="ltr">
          {r.org_id.slice(0, 8)}
        </div>
      </td>
      <td className="px-3 py-2">{CHANNEL_LABEL[r.channel] ?? r.channel}</td>
      <td className="px-3 py-2 max-w-[220px] truncate" dir="ltr" title={r.recipient}>
        {r.recipient}
      </td>
      <td className="px-3 py-2 font-mono text-xs" dir="ltr">
        {r.template}
      </td>
      <td className="px-3 py-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </td>
      <td className="px-3 py-2 tabular-nums">
        {r.attempts ?? 0}
        {r.max_attempts ? <span className="text-muted-foreground">/{r.max_attempts}</span> : null}
      </td>
      <td className="px-3 py-2 max-w-[240px]" dir="ltr" title={r.last_error ?? undefined}>
        {shortErr ? (
          <span className="text-[11px] text-destructive">{shortErr}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground" dir="ltr">
        {fmt(r.created_at, locale)}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground" dir="ltr">
        {fmt(r.sent_at, locale)}
      </td>
      <td className="px-3 py-2">
        {r.status === "dead_letter" ? (
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            {retrying ? <Loader2 className="me-1 size-3 animate-spin" /> : <RotateCw className="me-1 size-3" />}
            {isAr ? "إعادة" : "Retry"}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}
