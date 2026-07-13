import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  Radio,
  AlertTriangle,
  RefreshCcw,
  WifiOff,
  Percent,
  Timer,
  PlayCircle,
  Save,
  Settings2,
  Loader2,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  listRealtimeConnectionStats,
  getRealtimePollingConfig,
  updateRealtimePollingConfig,
  DEFAULT_POLLING_INTERVALS,
  type RealtimeEventKind,
  type PollingIntervalsConfig,
  type PollingStatusKey,
} from "@/lib/realtime-diagnostics.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/realtime-diagnostics")({
  head: () => sectionHead({ section: "admin", entityAr: "تشخيصات لحظية", entityEn: "Realtime Diagnostics", path: "/admin/realtime-diagnostics" }),
  component: RealtimeDiagnosticsPage,
});

const RANGES = [
  { value: "1", ar: "آخر ساعة", en: "Last hour" },
  { value: "24", ar: "آخر 24 ساعة", en: "Last 24h" },
  { value: "72", ar: "آخر 3 أيام", en: "Last 3 days" },
  { value: "168", ar: "آخر أسبوع", en: "Last week" },
];

function RealtimeDiagnosticsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const fetchStats = useServerFn(listRealtimeConnectionStats);
  const [sinceHours, setSinceHours] = useState("24");
  const [search, setSearch] = useState("");

  const hours = Number(sinceHours) || 24;
  const q = useQuery({
    queryKey: ["admin", "realtime-diagnostics", hours],
    queryFn: () => fetchStats({ data: { sinceHours: hours, limit: 500 } }),
    refetchInterval: 30_000,
  });

  const rows = q.data?.rows ?? [];
  const summary = q.data?.summary;
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        r.channel_key.toLowerCase().includes(s) ||
        r.user_id.toLowerCase().includes(s) ||
        (r.user_label ?? "").toLowerCase().includes(s),
    );
  }, [rows, search]);

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        icon={Radio}
        ar="تشخيص الاتصال المباشر"
        en="Realtime Diagnostics"
        descriptionAr="عدد الانقطاعات ونجاحات إعادة الاتصال لكل مستخدم/قناة."
        descriptionEn="Disconnect and reconnect counts per user and channel."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sinceHours} onValueChange={setSinceHours}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {isAr ? r.ar : r.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "بحث عن قناة/مستخدم" : "Search channel / user"}
              className="h-9 w-[240px]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void q.refetch()}
              disabled={q.isFetching}
            >
              <RefreshCcw className="me-1 size-4" />
              {isAr ? "تحديث" : "Refresh"}
            </Button>
          </div>
        }
      />

      <PollingSettingsCard isAr={isAr} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {/* summary cards below */}
        <SummaryCard
          icon={<WifiOff className="size-4 text-warning" />}
          label={isAr ? "انقطاعات" : "Disconnects"}
          value={summary?.totalDisconnects ?? 0}
        />
        <SummaryCard
          icon={<RefreshCcw className="size-4 text-success" />}
          label={isAr ? "إعادات ناجحة" : "Reconnects"}
          value={summary?.totalReconnects ?? 0}
        />
        <SummaryCard
          icon={<AlertTriangle className="size-4 text-destructive" />}
          label={isAr ? "حالات فشل" : "Failed"}
          value={summary?.totalFailed ?? 0}
        />
        <SummaryCard
          icon={<PlayCircle className="size-4 text-info" />}
          label={isAr ? "جلسات Polling" : "Polling sessions"}
          value={summary?.totalPollSessions ?? 0}
        />
        <SummaryCard
          icon={<Timer className="size-4 text-info" />}
          label={isAr ? "طلبات Polling" : "Polling fetches"}
          value={summary?.totalPollFetches ?? 0}
        />
        <SummaryCard
          icon={<AlertTriangle className="size-4 text-destructive" />}
          label={isAr ? "أخطاء Polling" : "Polling errors"}
          value={summary?.totalPollErrors ?? 0}
        />
        <SummaryCard
          icon={<Percent className="size-4 text-primary" />}
          label={isAr ? "معدّل الاسترداد" : "Recovery rate"}
          value={summary ? `${Math.round(summary.reconnectRate * 100)}%` : "—"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAr ? "التفصيل لكل مستخدم × قناة" : "Per user × channel breakdown"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {isAr ? "جارٍ التحميل…" : "Loading…"}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد أحداث في هذه الفترة." : "No events in this range."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? "المستخدم" : "User"}</TableHead>
                  <TableHead>{isAr ? "القناة" : "Channel"}</TableHead>
                  <TableHead className="text-end">{isAr ? "انقطاعات" : "Disconnects"}</TableHead>
                  <TableHead className="text-end">{isAr ? "إعادات" : "Reconnects"}</TableHead>
                  <TableHead className="text-end">{isAr ? "فشل" : "Failed"}</TableHead>
                  <TableHead className="text-end">
                    {isAr ? "Polling (جلسات)" : "Poll sessions"}
                  </TableHead>
                  <TableHead className="text-end">
                    {isAr ? "Polling (طلبات)" : "Poll fetches"}
                  </TableHead>
                  <TableHead className="text-end">
                    {isAr ? "أخطاء Polling" : "Poll errors"}
                  </TableHead>
                  <TableHead>{isAr ? "آخر حدث" : "Last event"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const rate = r.disconnects > 0 ? r.reconnects / r.disconnects : null;
                  return (
                    <TableRow key={`${r.user_id}::${r.channel_key}`}>
                      <TableCell>
                        <div className="text-sm font-medium">{r.user_label ?? "—"}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {r.user_id.slice(0, 8)}…
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.channel_key}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {r.disconnects}
                        {rate !== null && (
                          <span className="ms-1 text-[10px] text-muted-foreground">
                            ({Math.round(rate * 100)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-success">
                        {r.reconnects}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {r.failed > 0 ? (
                          <Badge variant="destructive">{r.failed}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-info">
                        {r.poll_sessions}
                      </TableCell>
                      <TableCell className="text-end tabular-nums text-info">
                        {r.poll_fetches}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {r.poll_errors > 0 ? (
                          <Badge variant="destructive">{r.poll_errors}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{new Date(r.last_event_at).toLocaleString()}</div>
                        <LastKindBadge kind={r.last_kind} isAr={isAr} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        </div>
        <div className="grid size-9 place-items-center rounded-md bg-muted">{icon}</div>
      </CardContent>
    </Card>
  );
}

function LastKindBadge({ kind, isAr }: { kind: RealtimeEventKind; isAr: boolean }) {
  switch (kind) {
    case "reconnect":
      return (
        <Badge variant="outline" className="mt-1 border-success/40 text-success">
          {isAr ? "إعادة" : "reconnect"}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="mt-1">
          {isAr ? "فشل" : "failed"}
        </Badge>
      );
    case "poll_start":
      return (
        <Badge variant="outline" className="mt-1 border-info/40 text-info">
          {isAr ? "بدء Polling" : "poll start"}
        </Badge>
      );
    case "poll_stop":
      return (
        <Badge variant="outline" className="mt-1 border-info/40 text-info">
          {isAr ? "إيقاف Polling" : "poll stop"}
        </Badge>
      );
    case "poll_fetch":
      return (
        <Badge variant="outline" className="mt-1 border-info/40 text-info">
          {isAr ? "طلب Polling" : "poll fetch"}
        </Badge>
      );
    case "poll_error":
      return (
        <Badge variant="destructive" className="mt-1">
          {isAr ? "خطأ Polling" : "poll error"}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="mt-1 border-warning/40 text-warning">
          {isAr ? "انقطاع" : "disconnect"}
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
// Live-editable polling intervals per realtime status. Values persist in
// app_settings and propagate to all clients within ~60s without redeploy.
// ---------------------------------------------------------------------------

const STATUS_ROWS: Array<{
  key: PollingStatusKey;
  ar: string;
  en: string;
  hint_ar: string;
  hint_en: string;
}> = [
  {
    key: "connected",
    ar: "متصل",
    en: "Connected",
    hint_ar: "عادةً بدون polling؛ يمكن ضبط فاصل احتياطي طويل.",
    hint_en: "Usually off; set a long safety interval if desired.",
  },
  {
    key: "connecting",
    ar: "جارٍ الاتصال",
    en: "Connecting",
    hint_ar: "أثناء أول محاولة اتصال.",
    hint_en: "During initial connect attempt.",
  },
  {
    key: "reconnecting",
    ar: "إعادة الاتصال",
    en: "Reconnecting",
    hint_ar: "بعد انقطاع مؤقت.",
    hint_en: "After a transient disconnect.",
  },
  {
    key: "failed",
    ar: "فشل",
    en: "Failed",
    hint_ar: "بعد استنفاد محاولات إعادة الاتصال.",
    hint_en: "After retries are exhausted.",
  },
  {
    key: "disabled",
    ar: "معطّل",
    en: "Disabled",
    hint_ar: "عندما تكون القناة معطّلة (لا معرّف).",
    hint_en: "When the channel isn't enabled.",
  },
];

function PollingSettingsCard({ isAr }: { isAr: boolean }) {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(getRealtimePollingConfig);
  const saveCfg = useServerFn(updateRealtimePollingConfig);

  const q = useQuery({
    queryKey: ["realtime", "polling-config"],
    queryFn: () => fetchCfg(),
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState<PollingIntervalsConfig>(DEFAULT_POLLING_INTERVALS);
  useEffect(() => {
    if (q.data?.config) setDraft(q.data.config);
  }, [q.data?.config]);

  const save = useMutation({
    mutationFn: (cfg: PollingIntervalsConfig) => saveCfg({ data: { config: cfg } }),
    onSuccess: (r) => {
      toast.success(isAr ? "تم حفظ الإعدادات" : "Settings saved");
      if (r?.config) setDraft(r.config);
      void qc.invalidateQueries({ queryKey: ["realtime", "polling-config"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(isAr ? `فشل الحفظ: ${msg}` : `Save failed: ${msg}`);
    },
  });

  const setSeconds = (k: PollingStatusKey, secStr: string) => {
    const n = Number(secStr);
    if (!Number.isFinite(n) || n <= 0) return;
    setDraft((d) => ({ ...d, [k]: Math.round(n * 1000) }));
  };
  const toggle = (k: PollingStatusKey, enabled: boolean) => {
    setDraft((d) => ({
      ...d,
      [k]: enabled ? (d[k] ?? DEFAULT_POLLING_INTERVALS[k] ?? 15000) : null,
    }));
  };

  const dirty = q.data?.config
    ? STATUS_ROWS.some((r) => (q.data!.config[r.key] ?? null) !== (draft[r.key] ?? null))
    : false;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-primary" />
            {isAr ? "فواصل Polling حسب الحالة" : "Polling intervals by status"}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تُطبَّق مباشرة على كل العملاء خلال ~60 ثانية دون إعادة نشر. المدى المسموح 1–600 ثانية."
              : "Applied to all clients within ~60s without redeploy. Range 1–600 seconds."}
          </p>
          {q.data?.updatedAt && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {isAr ? "آخر تحديث: " : "Last updated: "}
              {new Date(q.data.updatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => q.data?.config && setDraft(q.data.config)}
            disabled={!dirty || save.isPending}
          >
            {isAr ? "إلغاء" : "Reset"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraft(DEFAULT_POLLING_INTERVALS)}
            disabled={save.isPending}
          >
            {isAr ? "الافتراضيات" : "Defaults"}
          </Button>
          <Button size="sm" onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>
            {save.isPending ? (
              <Loader2 className="me-1 size-4 animate-spin" />
            ) : (
              <Save className="me-1 size-4" />
            )}
            {isAr ? "حفظ" : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {isAr ? "جارٍ التحميل…" : "Loading…"}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {STATUS_ROWS.map((row) => {
              const val = draft[row.key];
              const enabled = val !== null;
              const seconds = enabled ? Math.round((val as number) / 1000) : "";
              return (
                <div key={row.key} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-medium">{isAr ? row.ar : row.en}</Label>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {isAr ? "تفعيل" : "Enable"}
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => toggle(row.key, v)}
                        aria-label={row.key}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={600}
                      step={1}
                      inputMode="numeric"
                      className="h-9 w-28 tabular-nums"
                      value={seconds}
                      disabled={!enabled}
                      onChange={(e) => setSeconds(row.key, e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {isAr ? "ثانية" : "seconds"}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {isAr ? row.hint_ar : row.hint_en}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
