import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  Play,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
} from "lucide-react";
import { sectionHead } from "@/lib/section-og-head";
import {
  listScriptSchedules,
  upsertScriptSchedule,
  toggleScriptSchedule,
  deleteScriptSchedule,
  runScheduleNow,
} from "@/lib/scripts-schedules.functions";

type ToolName =
  | "revenue_summary"
  | "overdue_payments"
  | "expiring_contracts"
  | "expense_summary"
  | "occupancy_snapshot"
  | "rent_forecast"
  | "risk_analysis"
  | "suggest_rent_price"
  | "employee_performance"
  | "summarize_system"
  | "cash_flow_summary"
  | "maintenance_backlog"
  | "vacant_units_list";

const TOOL_NAMES: ToolName[] = [
  "revenue_summary",
  "overdue_payments",
  "expiring_contracts",
  "expense_summary",
  "occupancy_snapshot",
  "rent_forecast",
  "risk_analysis",
  "suggest_rent_price",
  "employee_performance",
  "summarize_system",
  "cash_flow_summary",
  "maintenance_backlog",
  "vacant_units_list",
];

const INTERVAL_PRESETS: { minutes: number; unit: "minutes" | "hours" | "days"; n: number }[] = [
  { minutes: 15, unit: "minutes", n: 15 },
  { minutes: 60, unit: "hours", n: 1 },
  { minutes: 60 * 6, unit: "hours", n: 6 },
  { minutes: 60 * 12, unit: "hours", n: 12 },
  { minutes: 60 * 24, unit: "days", n: 1 },
  { minutes: 60 * 24 * 7, unit: "days", n: 7 },
];

export const Route = createFileRoute("/_authenticated/assistant/scripts/schedules")({
  head: () =>
    sectionHead({
      section: "assistant",
      entityAr: "جدولة السكربتات",
      entityEn: "Script Schedules",
      path: "/assistant/scripts/schedules",
    }),
  component: SchedulesPage,
});

type Row = {
  id: string;
  name: ToolName;
  args: Record<string, any> | null;
  label: string | null;
  interval_minutes: number;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  run_count: number;
  max_retries: number;
  retry_delay_minutes: number;
  current_retry: number;
};


function SchedulesPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar") ?? true;
  const qc = useQueryClient();

  const listFn = useServerFn(listScriptSchedules);
  const upsertFn = useServerFn(upsertScriptSchedule);
  const toggleFn = useServerFn(toggleScriptSchedule);
  const deleteFn = useServerFn(deleteScriptSchedule);
  const runNowFn = useServerFn(runScheduleNow);

  const { data, isLoading, error } = useQuery({
    queryKey: ["script-schedules"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<Partial<Row> | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["script-schedules"] });

  const upsert = useMutation({
    mutationFn: (v: any) => upsertFn({ data: v }),
    onSuccess: () => {
      toast.success(t("assistant.scripts.scheduleSaved"));
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const toggleM = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: invalidate,
  });
  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("assistant.scripts.scheduleDeleted"));
      invalidate();
    },
  });
  const runNowM = useMutation({
    mutationFn: (id: string) => runNowFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("assistant.scripts.scheduleTriggered"));
      invalidate();
    },
  });

  const rows: Row[] = (data as any)?.schedules ?? [];

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/assistant/scripts" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3.5" />
              {t("assistant.scripts.backToList")}
            </Link>
            <span>·</span>
            <CalendarClock className="size-3.5" />
          </div>
          <h1 className="text-2xl font-bold">{t("assistant.scripts.schedulesTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("assistant.scripts.schedulesSubtitle")}</p>
        </div>
        <button
          onClick={() =>
            setEditing({
              name: "revenue_summary",
              args: {},
              label: "",
              interval_minutes: 60 * 24,
              enabled: true,
              max_retries: 0,
              retry_delay_minutes: 5,
            })
          }

          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          <Plus className="size-4" />
          {t("assistant.scripts.newSchedule")}
        </button>
      </header>

      {editing && (
        <ScheduleEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => upsert.mutate(v)}
          busy={upsert.isPending}
        />
      )}

      {isLoading ? (
        <div className="rounded-xl border bg-card p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("assistant.scripts.noSchedules")}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">{t("assistant.scripts.scheduleScript")}</th>
                  <th className="px-3 py-2 text-start">{t("assistant.scripts.scheduleInterval")}</th>
                  <th className="px-3 py-2 text-start">{t("assistant.scripts.scheduleNextRun")}</th>
                  <th className="px-3 py-2 text-start">{t("assistant.scripts.scheduleLastRun")}</th>
                  <th className="px-3 py-2 text-start">{t("assistant.scripts.scheduleEnabled")}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium">
                        {r.label ||
                          t(`assistant.scripts.items.${r.name}.title` as any, {
                            defaultValue: r.name,
                          })}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{r.name}</div>
                    </td>
                    <td className="px-3 py-2 align-top">{formatInterval(r.interval_minutes, t)}</td>
                    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
                      {r.enabled ? new Date(r.next_run_at).toLocaleString(i18n.language) : "—"}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      {r.last_run_at ? (
                        <div className="space-y-0.5">
                          <div className="whitespace-nowrap">
                            {new Date(r.last_run_at).toLocaleString(i18n.language)}
                          </div>
                          {r.last_status === "success" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" /> ok
                              {r.last_duration_ms != null && (
                                <span className="text-muted-foreground">
                                  · {r.last_duration_ms} ms
                                </span>
                              )}
                            </span>
                          ) : r.last_status === "error" ? (
                            <span
                              className="inline-flex items-center gap-1 text-destructive"
                              title={r.last_error ?? ""}
                            >
                              <AlertTriangle className="size-3" /> error
                              {r.current_retry > 0 && (
                                <span className="text-muted-foreground">
                                  · {t("assistant.scripts.scheduleAttempt")} {r.current_retry}/{r.max_retries}
                                </span>
                              )}
                            </span>
                          ) : null}

                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t("assistant.scripts.never")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={(e) =>
                            toggleM.mutate({ id: r.id, enabled: e.target.checked })
                          }
                          className="accent-primary"
                        />
                      </label>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        <Link
                          to="/assistant/scripts/schedules/$id"
                          params={{ id: r.id }}
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted"
                        >
                          {t("assistant.scripts.viewRuns")}
                        </Link>
                        <button
                          onClick={() => runNowM.mutate(r.id)}
                          disabled={runNowM.isPending}
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted"
                          title={t("assistant.scripts.scheduleRunNow")}
                        >
                          <Play className="size-3" />
                          {t("assistant.scripts.scheduleRunNow")}
                        </button>
                        <button
                          onClick={() =>
                            setEditing({
                              id: r.id,
                              name: r.name,
                              args: r.args ?? {},
                              label: r.label ?? "",
                              interval_minutes: r.interval_minutes,
                              enabled: r.enabled,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(t("assistant.scripts.confirmDeleteSchedule"))) {
                              delM.mutate(r.id);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <RefreshCw className="size-3" />
        {t("assistant.scripts.autoRefreshOn")}
      </div>
    </div>
  );
}

function formatInterval(minutes: number, t: any): string {
  if (minutes >= 60 * 24) return t("assistant.scripts.intervalDays", { n: Math.round(minutes / (60 * 24)) });
  if (minutes >= 60) return t("assistant.scripts.intervalHours", { n: Math.round(minutes / 60) });
  return t("assistant.scripts.intervalMinutes", { n: minutes });
}

function ScheduleEditor({
  initial,
  onCancel,
  onSubmit,
  busy,
}: {
  initial: Partial<Row>;
  onCancel: () => void;
  onSubmit: (v: any) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState<ToolName>((initial.name as ToolName) ?? "revenue_summary");
  const [label, setLabel] = useState(initial.label ?? "");
  const [interval, setInterval] = useState<number>(initial.interval_minutes ?? 60 * 24);
  const [enabled, setEnabled] = useState<boolean>(initial.enabled ?? true);
  const [argsText, setArgsText] = useState<string>(
    JSON.stringify(initial.args ?? {}, null, 2),
  );

  const parsedArgs = useMemo(() => {
    try {
      const v = JSON.parse(argsText || "{}");
      return { ok: true as const, value: v };
    } catch (e: any) {
      return { ok: false as const, err: e?.message ?? "invalid json" };
    }
  }, [argsText]);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">
          {initial.id ? t("assistant.scripts.editSchedule") : t("assistant.scripts.newSchedule")}
        </div>
        <button onClick={onCancel} className="rounded p-1 hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t("assistant.scripts.scheduleScript")}</span>
          <select
            value={name}
            onChange={(e) => setName(e.target.value as ToolName)}
            className="rounded-md border bg-background px-3 py-1.5"
          >
            {TOOL_NAMES.map((n) => (
              <option key={n} value={n}>
                {t(`assistant.scripts.items.${n}.title` as any, { defaultValue: n })}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t("assistant.scripts.scheduleLabel")}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5"
          />
        </label>
        <div className="md:col-span-2 flex flex-col gap-2">
          <span className="text-muted-foreground text-sm">
            {t("assistant.scripts.scheduleInterval")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={5}
              max={43200}
              step={5}
              value={interval}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setInterval(Math.min(43200, Math.max(5, Math.round(n))));
              }}
              className="w-32 rounded-md border bg-background px-3 py-1.5 font-mono"
              aria-label="interval_minutes"
            />
            <span className="text-xs text-muted-foreground">
              {t("assistant.scripts.intervalMinutes", { n: interval })} · ≈ {formatInterval(interval, t)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {INTERVAL_PRESETS.map((p) => {
              const active = interval === p.minutes;
              const label = t(
                p.unit === "minutes"
                  ? "assistant.scripts.intervalMinutes"
                  : p.unit === "hours"
                    ? "assistant.scripts.intervalHours"
                    : "assistant.scripts.intervalDays",
                { n: p.n },
              );
              return (
                <button
                  key={p.minutes}
                  type="button"
                  onClick={() => setInterval(p.minutes)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">min 5 · max 43200 (30 يوم)</p>
        </div>
        <label className="md:col-span-2 flex flex-col gap-1">
          <span className="text-muted-foreground">args (JSON)</span>
          <textarea
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            rows={4}
            className="rounded-md border bg-background px-3 py-1.5 font-mono text-xs"
            dir="ltr"
          />
          {!parsedArgs.ok && (
            <span className="text-xs text-destructive">{parsedArgs.err}</span>
          )}
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-primary"
          />
          <span>{t("assistant.scripts.scheduleEnabled")}</span>
        </label>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("assistant.scripts.scheduleCancel")}
        </button>
        <button
          onClick={() => {
            if (!parsedArgs.ok) {
              toast.error(parsedArgs.err);
              return;
            }
            onSubmit({
              id: initial.id,
              name,
              args: parsedArgs.value,
              label: label || undefined,
              interval_minutes: interval,
              enabled,
            });
          }}
          disabled={busy || !parsedArgs.ok}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t("assistant.scripts.scheduleSave")}
        </button>
      </div>
    </div>
  );
}
