import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
  RefreshCw,
  CalendarClock,
} from "lucide-react";
import { sectionHead } from "@/lib/section-og-head";
import {
  listScheduleRuns,
  listScriptSchedules,
} from "@/lib/scripts-schedules.functions";

export const Route = createFileRoute("/_authenticated/assistant/scripts/schedules/$id")({
  head: ({ params }) =>
    sectionHead({
      section: "assistant",
      entityAr: `سجل الجدولة: ${params.id.slice(0, 8)}`,
      entityEn: `Schedule runs: ${params.id.slice(0, 8)}`,
      path: `/assistant/scripts/schedules/${params.id}`,
    }),
  component: ScheduleRunsPage,
});

function ScheduleRunsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar") ?? true;
  const { id } = Route.useParams();
  const runsFn = useServerFn(listScheduleRuns);
  const listFn = useServerFn(listScriptSchedules);

  const runsQ = useQuery({
    queryKey: ["schedule-runs", id],
    queryFn: () => runsFn({ data: { scheduleId: id, limit: 50 } }),
    refetchInterval: 30_000,
  });
  const schedQ = useQuery({
    queryKey: ["script-schedules"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  const schedule = ((schedQ.data as any)?.schedules ?? []).find((s: any) => s.id === id);
  const runs: any[] = (runsQ.data as any)?.runs ?? [];

  const total = runs.length;
  const okCount = runs.filter((r) => r.status === "success").length;
  const errCount = runs.filter((r) => r.status === "error").length;
  const avgDuration =
    total > 0
      ? Math.round(runs.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / total)
      : 0;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            to="/assistant/scripts/schedules"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {t("assistant.scripts.schedules")}
          </Link>
          <span>·</span>
          <CalendarClock className="size-3.5" />
          {schedule && (
            <span className="font-mono text-xs">{schedule.name}</span>
          )}
        </div>
        <h1 className="text-2xl font-bold">
          {schedule?.label ||
            (schedule &&
              t(`assistant.scripts.items.${schedule.name}.title` as any, {
                defaultValue: schedule.name,
              })) ||
            id}
        </h1>
        {schedule && (
          <p className="text-sm text-muted-foreground">
            {t("assistant.scripts.scheduleInterval")}:{" "}
            {formatInterval(schedule.interval_minutes, t)} ·{" "}
            {schedule.enabled ? "✓" : "✗"} {t("assistant.scripts.scheduleEnabled")}
            {schedule.next_run_at && schedule.enabled && (
              <>
                {" · "}
                {t("assistant.scripts.scheduleNextRun")}:{" "}
                {new Date(schedule.next_run_at).toLocaleString(i18n.language)}
              </>
            )}
          </p>
        )}
      </header>

      {/* KPI chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label={t("assistant.scripts.scheduleRuns")} value={String(total)} />
        <StatCard
          label={t("assistant.scripts.status_success")}
          value={String(okCount)}
          tone="ok"
        />
        <StatCard
          label={t("assistant.scripts.status_error")}
          value={String(errCount)}
          tone="err"
        />
        <StatCard label="avg" value={`${avgDuration} ms`} />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button
          onClick={() => runsQ.refetch()}
          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-muted"
        >
          <RefreshCw className={`size-3 ${runsQ.isFetching ? "animate-spin" : ""}`} />
          {t("assistant.scripts.refresh")}
        </button>
        <span>{t("assistant.scripts.autoRefreshOn")}</span>
      </div>

      {runsQ.isLoading ? (
        <div className="rounded-xl border bg-card p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : runsQ.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(runsQ.error as Error).message}
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("assistant.scripts.historyEmpty")}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden divide-y">
          {runs.map((r) => (
            <RunRow key={r.id} run={r} lang={i18n.language} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "err";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "err"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function RunRow({ run, lang, t }: { run: any; lang: string; t: any }) {
  const [open, setOpen] = useState(false);
  const ok = run.status === "success";
  return (
    <div className="p-3 space-y-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-start"
      >
        <div className="flex items-center gap-2 min-w-0">
          {ok ? (
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="size-4 text-destructive shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {new Date(run.started_at).toLocaleString(lang)}
            </div>
            {!ok && run.error && (
              <div className="text-xs text-destructive truncate" title={run.error} dir="ltr">
                {run.error}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <Clock className="size-3" />
          {run.duration_ms ?? 0} ms
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {open && (
        <div className="space-y-2">
          {!ok && run.error && (
            <pre
              className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive font-mono whitespace-pre-wrap break-words"
              dir="ltr"
            >
              {run.error}
            </pre>
          )}
          {run.result != null && (
            <pre
              className="rounded-md border bg-muted/40 p-2 text-xs overflow-x-auto max-h-80"
              dir="ltr"
            >
              {JSON.stringify(run.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function formatInterval(minutes: number, t: any): string {
  if (minutes >= 60 * 24)
    return t("assistant.scripts.intervalDays", { n: Math.round(minutes / (60 * 24)) });
  if (minutes >= 60)
    return t("assistant.scripts.intervalHours", { n: Math.round(minutes / 60) });
  return t("assistant.scripts.intervalMinutes", { n: minutes });
}
