import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { sectionHead } from "@/lib/section-og-head";
import {
  loadHistory,
  clearHistory,
  removeEntry,
  type ScriptRunEntry,
} from "@/lib/scripts-history";
import {
  ArrowLeft,
  History,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Play,
  ChevronDown,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/assistant/scripts/history")({
  head: () =>
    sectionHead({
      section: "assistant",
      entityAr: "سجل تشغيل السكربتات",
      entityEn: "Scripts run history",
      path: "/assistant/scripts/history",
    }),
  component: ScriptsHistoryPage,
});

function ScriptsHistoryPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar") ?? true;
  const [entries, setEntries] = useState<ScriptRunEntry[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = () => setEntries(loadHistory());
  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener("scripts-history-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("scripts-history-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!q) return true;
      const label = t(`assistant.scripts.items.${e.name}.title` as any, {
        defaultValue: e.name,
      }) as string;
      const hay = [
        e.name,
        label,
        e.errorMessage ?? "",
        JSON.stringify(e.args ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, query, statusFilter, t]);

  const successCount = entries.filter((e) => e.status === "success").length;
  const errorCount = entries.length - successCount;

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-5" dir={isRtl ? "rtl" : "ltr"}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Link
            to="/assistant/scripts"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {t("assistant.scripts.backToList")}
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="size-6" />
            {t("assistant.scripts.historyTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("assistant.scripts.historySubtitle", {
              total: entries.length,
              success: successCount,
              error: errorCount,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className="size-4" />
            {t("assistant.scripts.refresh")}
          </button>
          {entries.length > 0 && (
            <button
              onClick={() => {
                if (confirm(t("assistant.scripts.confirmClearHistory"))) clearHistory();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              {t("assistant.scripts.clearHistory")}
            </button>
          )}
        </div>
      </header>

      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-64">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-2 size-4 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("assistant.scripts.searchPlaceholder")}
            className="w-full rounded-md border bg-background ps-8 pe-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="inline-flex rounded-md border p-0.5 text-xs">
          {(["all", "success", "error"] as const).map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t(`assistant.scripts.status_${s}` as any)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          {t("assistant.scripts.historyEmpty")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("assistant.scripts.noMatches")}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => (
            <HistoryRow
              key={e.id}
              entry={e}
              expanded={expanded === e.id}
              onToggle={() => setExpanded((cur) => (cur === e.id ? null : e.id))}
              onRemove={() => removeEntry(e.id)}
              lang={i18n.language}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryRow({
  entry,
  expanded,
  onToggle,
  onRemove,
  lang,
}: {
  entry: ScriptRunEntry;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  lang: string;
}) {
  const { t } = useTranslation();
  const label = t(`assistant.scripts.items.${entry.name}.title` as any, {
    defaultValue: entry.name,
  }) as string;
  const argsSummary = Object.entries(entry.args)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");

  return (
    <li className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 p-3 flex-wrap">
        {entry.status === "success" ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <XCircle className="size-5 shrink-0 text-destructive" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate">{label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{entry.name}</span>
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
            <span>{new Date(entry.startedAt).toLocaleString(lang)}</span>
            <span>· {entry.durationMs} ms</span>
            {argsSummary && (
              <span className="font-mono truncate max-w-[40ch]" title={argsSummary}>
                · {argsSummary}
              </span>
            )}
          </div>
          {entry.status === "error" && entry.errorMessage && (
            <div className="mt-1 text-xs text-destructive truncate" title={entry.errorMessage}>
              {entry.errorMessage}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/assistant/scripts/$name"
            params={{ name: entry.name }}
            search={entry.args as Record<string, string | number>}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
            title={t("assistant.scripts.rerunQuick")}
          >
            <Play className="size-3.5" />
            {t("assistant.scripts.rerunQuick")}
          </Link>
          {entry.result !== undefined && (
            <button
              onClick={onToggle}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <ChevronDown
                className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
              {expanded ? t("assistant.scripts.hideResult") : t("assistant.scripts.showResult")}
            </button>
          )}
          <button
            onClick={onRemove}
            className="inline-flex items-center rounded-md border p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            aria-label={t("assistant.scripts.removeEntry")}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {expanded && entry.result !== undefined && (
        <pre
          className="border-t bg-muted/40 p-3 text-xs overflow-x-auto max-h-72"
          dir="ltr"
        >
          {JSON.stringify(entry.result, null, 2)}
        </pre>
      )}
    </li>
  );
}
