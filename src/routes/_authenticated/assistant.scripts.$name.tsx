import { t } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { runDashboardTool } from "@/lib/ai-assistant.functions";
import { recordRun } from "@/lib/scripts-history";
import { exportRowsToCsv, exportRowsToPdf } from "@/lib/scripts-export";
import { sectionHead } from "@/lib/section-og-head";
import {
  ArrowLeft,
  Loader2,
  Play,
  Terminal,
  Filter,
  X,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  FileDown,
  FileText,
} from "lucide-react";

type SearchArgs = Record<string, string | number | undefined>;

export const Route = createFileRoute("/_authenticated/assistant/scripts/$name")({
  validateSearch: (search: Record<string, unknown>): SearchArgs => {
    const out: SearchArgs = {};
    for (const [k, v] of Object.entries(search)) {
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "number" || typeof v === "string") out[k] = v;
    }
    return out;
  },
  head: ({ params }) =>
    sectionHead({
      section: "assistant",
      entityAr: `تفاصيل: ${params.name}`,
      entityEn: `Script: ${params.name}`,
      path: `/assistant/scripts/${params.name}`,
    }),
  component: ScriptDetailPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-muted-foreground">{t("common.notFound")}</div>
  ),
});

/** Heuristic: pick the first array-of-objects inside a result payload. */
function extractRows(result: any): { key: string; rows: any[] } | null {
  if (!result || typeof result !== "object") return null;
  if (Array.isArray(result) && result.length && typeof result[0] === "object") {
    return { key: "items", rows: result };
  }
  // Prefer common list keys.
  const preferred = [
    "units",
    "tickets",
    "contracts",
    "payments",
    "charges",
    "rows",
    "items",
    "list",
    "data",
    "results",
    "employees",
    "by_month",
  ];
  for (const k of preferred) {
    const v = result[k];
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      return { key: k, rows: v };
    }
  }
  // Fallback: first array-of-objects value.
  for (const [k, v] of Object.entries(result)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      return { key: k, rows: v as any[] };
    }
  }
  return null;
}

/** Common alias sets for the three filter axes. */
const FILTER_KEYS = {
  city: ["city", "city_name", "city_ar", "region"],
  status: ["status", "state", "ticket_status", "contract_status", "payment_status"],
  establishment: [
    "establishment",
    "establishment_name",
    "company",
    "company_name",
    "organization",
    "organization_name",
    "org_name",
    "property",
    "property_name",
    "building",
    "building_name",
  ],
} as const;

function firstKey(row: any, keys: readonly string[]): string | null {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return k;
  }
  return null;
}

function uniqueValues(rows: any[], key: string): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const v = r?.[key];
    if (v === undefined || v === null || v === "") continue;
    s.add(String(v));
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, "ar"));
}

function ScriptDetailPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar") ?? true;
  
  const { name } = Route.useParams();
  const search = Route.useSearch();
  const runFn = useServerFn(runDashboardTool);

  // Filters (client-side over returned rows).
  const [cityF, setCityF] = useState<string | null>(null);
  const [statusF, setStatusF] = useState<string | null>(null);
  const [estF, setEstF] = useState<string | null>(null);

  // Run metadata.
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const startedAtRef = useRef<number>(0);

  const title = t(`assistant.scripts.items.${name}.title` as any, { defaultValue: name });

  const mutation = useMutation({
    mutationFn: async () => {
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(search)) {
        if (v === undefined || v === "") continue;
        const asNum = typeof v === "string" ? Number(v) : v;
        args[k] = Number.isFinite(asNum as number) && String(asNum) === String(v) ? asNum : v;
      }
      startedAtRef.current = performance.now();
      const startedAtMs = Date.now();
      try {
        const res = await runFn({ data: { name: name as any, args } });
        recordRun({
          name,
          args: args as Record<string, string | number>,
          startedAt: startedAtMs,
          durationMs: Math.round(performance.now() - startedAtRef.current),
          status: "success",
          result: res.result,
        });
        return res.result;
      } catch (e: any) {
        recordRun({
          name,
          args: args as Record<string, string | number>,
          startedAt: startedAtMs,
          durationMs: Math.round(performance.now() - startedAtRef.current),
          status: "error",
          errorMessage: e?.message ?? String(e),
        });
        throw e;
      }
    },
    onSuccess: () => {
      const dur = Math.round(performance.now() - startedAtRef.current);
      setLastDurationMs(dur);
      setLastUpdatedAt(Date.now());
      setProgress(100);
      toast.success(t("assistant.scripts.ran", { title }));
    },
    onError: (e: any) => {
      setProgress(0);
      toast.error(e?.message ?? t("assistant.scripts.runFailed"));
    },
  });

  // Fake progress while running so users see motion even for long-running fns.
  useEffect(() => {
    if (!mutation.isPending) return;
    setProgress(6);
    const id = window.setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, (90 - p) * 0.08) : p));
    }, 250);
    return () => window.clearInterval(id);
  }, [mutation.isPending]);

  // Reset progress after a moment of success so the bar hides.
  useEffect(() => {
    if (!mutation.isSuccess) return;
    const id = window.setTimeout(() => setProgress(0), 700);
    return () => window.clearTimeout(id);
  }, [mutation.isSuccess, lastUpdatedAt]);

  // Auto-run on mount + when search args change.
  useEffect(() => {
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, JSON.stringify(search)]);

  // Optional auto-refresh polling.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      if (!mutation.isPending) mutation.mutate();
    }, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, mutation.isPending]);

  const description = t(`assistant.scripts.items.${name}.desc` as any, { defaultValue: "" });

  const extracted = useMemo(() => extractRows(mutation.data), [mutation.data]);
  const allRows = extracted?.rows ?? [];

  const detectedKeys = useMemo(() => {
    const sample = allRows[0] ?? {};
    return {
      city: firstKey(sample, FILTER_KEYS.city),
      status: firstKey(sample, FILTER_KEYS.status),
      establishment: firstKey(sample, FILTER_KEYS.establishment),
    };
  }, [allRows]);

  const cityOptions = detectedKeys.city ? uniqueValues(allRows, detectedKeys.city) : [];
  const statusOptions = detectedKeys.status ? uniqueValues(allRows, detectedKeys.status) : [];
  const estOptions = detectedKeys.establishment
    ? uniqueValues(allRows, detectedKeys.establishment)
    : [];

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (cityF && detectedKeys.city && String(r[detectedKeys.city]) !== cityF) return false;
      if (statusF && detectedKeys.status && String(r[detectedKeys.status]) !== statusF)
        return false;
      if (
        estF &&
        detectedKeys.establishment &&
        String(r[detectedKeys.establishment]) !== estF
      )
        return false;
      return true;
    });
  }, [allRows, cityF, statusF, estF, detectedKeys]);

  const columns = useMemo(() => {
    if (!filteredRows.length) return [];
    const keys = new Set<string>();
    for (const r of filteredRows.slice(0, 20)) {
      for (const k of Object.keys(r)) keys.add(k);
    }
    return Array.from(keys);
  }, [filteredRows]);

  // Non-array summary values.
  const summaryEntries = useMemo(() => {
    if (!mutation.data || typeof mutation.data !== "object" || Array.isArray(mutation.data))
      return [];
    return Object.entries(mutation.data).filter(
      ([, v]) => v === null || typeof v !== "object",
    );
  }, [mutation.data]);

  const anyFilterActive = !!(cityF || statusF || estF);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              to="/assistant/scripts"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {t("assistant.scripts.backToList")}
            </Link>
            <span>·</span>
            <Terminal className="size-3" />
            <span className="font-mono">{name}</span>
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-primary"
            />
            <RefreshCw className={`size-3.5 ${autoRefresh ? "text-primary" : ""}`} />
            {t("assistant.scripts.autoRefresh")}
          </label>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {t("assistant.scripts.rerun")}
          </button>
          <button
            onClick={() => {
              if (!filteredRows.length && !summaryEntries.length) {
                toast.error(t("assistant.scripts.nothingToExport"));
                return;
              }
              exportRowsToCsv({
                scriptName: name,
                title,
                columns,
                rows: filteredRows,
                summary: summaryEntries,
              });
              toast.success(t("assistant.scripts.exportedCsv"));
            }}
            disabled={mutation.isPending || (!filteredRows.length && !summaryEntries.length)}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <FileDown className="size-4" />
            {t("assistant.scripts.exportCsv")}
          </button>
          <button
            onClick={() => {
              if (!filteredRows.length && !summaryEntries.length) {
                toast.error(t("assistant.scripts.nothingToExport"));
                return;
              }
              exportRowsToPdf({
                scriptName: name,
                title,
                columns,
                rows: filteredRows,
                summary: summaryEntries,
              });
              toast.success(t("assistant.scripts.exportedPdf"));
            }}
            disabled={mutation.isPending || (!filteredRows.length && !summaryEntries.length)}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <FileText className="size-4" />
            {t("assistant.scripts.exportPdf")}
          </button>
        </div>
      </header>

      {/* Progress bar (visible while running; briefly on completion). */}
      <div className="relative h-1 rounded-full bg-muted overflow-hidden" aria-hidden={progress === 0}>
        <div
          className={`absolute inset-y-0 start-0 transition-[width] duration-200 ease-out ${
            mutation.isError ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Status line: last updated / duration / auto-refresh. */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {mutation.isPending ? (
          <span className="inline-flex items-center gap-1.5 text-primary">
            <Loader2 className="size-3.5 animate-spin" />
            {t("assistant.scripts.running")}
          </span>
        ) : mutation.isSuccess && lastUpdatedAt ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-success dark:text-success">
              <CheckCircle2 className="size-3.5" />
              {t("assistant.scripts.completed")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              {new Date(lastUpdatedAt).toLocaleTimeString(i18n.language)}
              {lastDurationMs !== null && (
                <span className="text-muted-foreground/80">· {lastDurationMs} ms</span>
              )}
            </span>
          </>
        ) : null}
        {autoRefresh && !mutation.isError && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5">
            <RefreshCw className="size-3" />
            {t("assistant.scripts.autoRefreshOn")}
          </span>
        )}
      </div>

      {/* Summary chips (non-array scalar fields from result). */}
      {summaryEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {summaryEntries.map(([k, v]) => (
            <div key={k} className="rounded-lg border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {k}
              </div>
              <div className="mt-0.5 font-semibold truncate" title={String(v)}>
                {v === null ? "—" : String(v)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {mutation.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-3">
          <AlertTriangle className="size-5 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="font-semibold">{t("assistant.scripts.runFailed")}</div>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs opacity-90" dir="ltr">
              {(mutation.error as Error)?.message ?? String(mutation.error)}
            </pre>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium hover:bg-destructive/20 disabled:opacity-60"
            >
              <RefreshCw className="size-3.5" />
              {t("assistant.scripts.retry")}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      {allRows.length > 0 && (
        <div className="rounded-xl border bg-card p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Filter className="size-4 text-muted-foreground" />
            <span className="font-medium">{t("assistant.scripts.filters")}</span>
            <span className="text-xs text-muted-foreground">
              {t("assistant.scripts.showing", {
                shown: filteredRows.length,
                total: allRows.length,
              })}
            </span>
            {anyFilterActive && (
              <button
                onClick={() => {
                  setCityF(null);
                  setStatusF(null);
                  setEstF(null);
                }}
                className="ms-auto inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              >
                <X className="size-3" />
                {t("assistant.scripts.clearFilters")}
              </button>
            )}
          </div>

          <FilterGroup
            label={t("assistant.scripts.city")}
            options={cityOptions}
            value={cityF}
            onChange={setCityF}
            disabled={!detectedKeys.city}
            emptyHint={t("assistant.scripts.notInRows")}
          />
          <FilterGroup
            label={t("assistant.scripts.status")}
            options={statusOptions}
            value={statusF}
            onChange={setStatusF}
            disabled={!detectedKeys.status}
            emptyHint={t("assistant.scripts.notInRows")}
          />
          <FilterGroup
            label={t("assistant.scripts.establishment")}
            options={estOptions}
            value={estF}
            onChange={setEstF}
            disabled={!detectedKeys.establishment}
            emptyHint={t("assistant.scripts.notInRows")}
          />
        </div>
      )}

      {/* Table */}
      {mutation.isPending ? (
        <div className="rounded-xl border bg-card p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("assistant.scripts.running")}
        </div>
      ) : allRows.length === 0 ? (
        !mutation.isError && (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            {t("assistant.scripts.noRows")}
          </div>
        )
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm" dir="ltr">
              <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-1.5 whitespace-nowrap">
                        <CellValue value={r[c]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
  disabled,
  emptyHint,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  emptyHint: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground min-w-20">{label}:</span>
      {disabled || options.length === 0 ? (
        <span className="text-xs text-muted-foreground italic">{emptyHint}</span>
      ) : (
        <>
          <button
            onClick={() => onChange(null)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
              value === null
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {label === "" ? "all" : "الكل / All"}
          </button>
          {options.slice(0, 30).map((o) => {
            const active = value === o;
            return (
              <button
                key={o}
                onClick={() => onChange(active ? null : o)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {o}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

function CellValue({ value }: { value: any }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof value === "object") {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {JSON.stringify(value)}
      </span>
    );
  }
  if (typeof value === "boolean") return <span>{value ? "✓" : "✗"}</span>;
  return <span>{String(value)}</span>;
}
