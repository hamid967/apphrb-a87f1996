import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { runDashboardTool } from "@/lib/ai-assistant.functions";
import { Loader2, Play, Terminal, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/assistant/scripts")({
  head: () => sectionHead({ section: "assistant", entityAr: "سكربتات المساعد", entityEn: "Assistant Scripts", path: "/assistant/scripts" }),
  component: AssistantScriptsPage,
});

type ParamField = {
  name: string;
  type: "number" | "string";
  labelKey: string;
  placeholderKey?: string;
  placeholder?: string;
  /** Interactive range settings (for numeric time/limit inputs). */
  range?: {
    min: number;
    max: number;
    step?: number;
    default: number;
    /** Unit shown next to the value (e.g. "شهر", "يوم"). */
    unitKey?: "unitMonths" | "unitDays" | "unitItems";
    presets: number[];
  };
};

type CategoryKey = "reports" | "analysis" | "forecasts" | "ops";

type ScriptDef = {
  name: string;
  category: CategoryKey;
  fields: ParamField[];
};

const MONTHS_RANGE = {
  min: 1,
  max: 24,
  step: 1,
  default: 6,
  unitKey: "unitMonths" as const,
  presets: [1, 3, 6, 12, 24],
};
const HORIZON_RANGE = {
  min: 1,
  max: 12,
  step: 1,
  default: 3,
  unitKey: "unitMonths" as const,
  presets: [1, 3, 6, 12],
};
const DAYS_RANGE = {
  min: 7,
  max: 365,
  step: 1,
  default: 60,
  unitKey: "unitDays" as const,
  presets: [7, 30, 60, 90, 180, 365],
};
const LIMIT_RANGE = {
  min: 5,
  max: 200,
  step: 5,
  default: 25,
  unitKey: "unitItems" as const,
  presets: [10, 25, 50, 100],
};

const SCRIPTS: ScriptDef[] = [
  {
    name: "revenue_summary",
    category: "reports",
    fields: [{ name: "months", type: "number", labelKey: "months", range: MONTHS_RANGE }],
  },
  { name: "overdue_payments", category: "reports", fields: [] },
  {
    name: "expiring_contracts",
    category: "reports",
    fields: [{ name: "days", type: "number", labelKey: "days", range: DAYS_RANGE }],
  },
  {
    name: "expense_summary",
    category: "reports",
    fields: [{ name: "months", type: "number", labelKey: "months", range: MONTHS_RANGE }],
  },
  { name: "occupancy_snapshot", category: "analysis", fields: [] },
  {
    name: "rent_forecast",
    category: "forecasts",
    fields: [{ name: "months", type: "number", labelKey: "horizonMonths", range: HORIZON_RANGE }],
  },
  { name: "risk_analysis", category: "analysis", fields: [] },
  {
    name: "suggest_rent_price",
    category: "forecasts",
    fields: [
      { name: "unit_id", type: "string", labelKey: "unitId", placeholderKey: "optional" },
      { name: "city", type: "string", labelKey: "city", placeholderKey: "optional" },
    ],
  },
  { name: "employee_performance", category: "analysis", fields: [] },
  { name: "summarize_system", category: "reports", fields: [] },
  {
    name: "cash_flow_summary",
    category: "reports",
    fields: [{ name: "months", type: "number", labelKey: "months", range: MONTHS_RANGE }],
  },
  { name: "maintenance_backlog", category: "ops", fields: [] },
  {
    name: "vacant_units_list",
    category: "ops",
    fields: [{ name: "limit", type: "number", labelKey: "limit", range: LIMIT_RANGE }],
  },

];

function ScriptCard({
  script,
  onRun,
  t,
}: {
  script: ScriptDef;
  onRun: (name: string, args: Record<string, unknown>) => Promise<any>;
  t: TFunction;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of script.fields) {
      if (f.range) initial[f.name] = String(f.range.default);
    }
    return initial;
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const title = t(`assistant.scripts.items.${script.name}.title` as const);
  const description = t(`assistant.scripts.items.${script.name}.desc` as const);
  const category = t(`assistant.scripts.cats.${script.category}` as const);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const args: Record<string, unknown> = {};
      for (const f of script.fields) {
        const v = values[f.name]?.trim();
        if (!v) continue;
        args[f.name] = f.type === "number" ? Number(v) : v;
      }
      const res = await onRun(script.name, args);
      setResult(res);
      setOpen(true);
      toast.success(t("assistant.scripts.ran", { title }));
    } catch (e: any) {
      const msg = e?.message ?? t("assistant.scripts.runFailed");
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Terminal className="size-3.5" />
            <span className="font-mono">{script.name}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{category}</span>
          </div>
          <h3 className="mt-1 font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {script.fields.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {script.fields.map((f) => {
            const label = t(`assistant.scripts.fields.${f.labelKey}` as const);
            const placeholder = f.placeholderKey
              ? t(`assistant.scripts.fields.${f.placeholderKey}` as const)
              : f.placeholder;

            if (f.range) {
              const r = f.range;
              const raw = values[f.name];
              const num = raw !== undefined && raw !== "" ? Number(raw) : r.default;
              const val = Number.isFinite(num) ? num : r.default;
              const unit = r.unitKey ? t(`assistant.scripts.fields.${r.unitKey}` as const) : "";
              const setVal = (n: number) => {
                const clamped = Math.min(r.max, Math.max(r.min, n));
                setValues((v) => ({ ...v, [f.name]: String(clamped) }));
              };
              return (
                <div key={f.name} className="sm:col-span-2 flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{label}</span>
                    <div className="inline-flex items-baseline gap-1 rounded-md bg-muted px-2 py-0.5">
                      <span className="font-mono text-sm font-semibold text-foreground">{val}</span>
                      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={r.min}
                    max={r.max}
                    step={r.step ?? 1}
                    value={val}
                    onChange={(e) => setVal(Number(e.target.value))}
                    className="w-full accent-primary"
                    aria-label={label}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {r.presets.map((p) => {
                      const active = val === p;
                      return (
                        <button
                          type="button"
                          key={p}
                          onClick={() => setVal(p)}
                          className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {p}
                          {unit ? ` ${unit}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <label key={f.name} className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <input
                  type={f.type === "number" ? "number" : "text"}
                  placeholder={placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {t("assistant.scripts.run")}
        </button>
        {(result || error) && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? t("assistant.scripts.hideResult") : t("assistant.scripts.showResult")}
          </button>
        )}
      </div>

      {open && error && (
        <pre
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive overflow-x-auto"
          dir="ltr"
        >
          {error}
        </pre>
      )}
      {open && result && (
        <pre
          className="rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto max-h-80"
          dir="ltr"
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AssistantScriptsPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar") ?? true;
  const runFn = useServerFn(runDashboardTool);
  const onRun = async (name: string, args: Record<string, unknown>) => {
    const res = await runFn({ data: { name: name as any, args } });
    return res.result;
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t("assistant.scripts.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("assistant.scripts.subtitle")}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SCRIPTS.map((s) => (
          <ScriptCard key={s.name} script={s} onRun={onRun} t={t} />
        ))}
      </div>
    </div>
  );
}
