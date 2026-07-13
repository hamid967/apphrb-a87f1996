import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Toggle } from "@/components/ui/toggle";
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
import { MotionBarChart } from "@/components/charts/motion-tremor";
import {
  Loader2,
  PlayCircle,
  FileJson,
  FileSpreadsheet,
  Sparkles,
  RotateCcw,
  Rocket,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useBackgroundExport } from "@/hooks/use-background-export";

export const Route = createFileRoute("/_authenticated/reports/preview")({
  head: () => ({ meta: [{ title: "Report Preview" }] }),
  component: PreviewPage,
});

type Summary = { label: string; field: string; agg: "sum" | "count"; where?: string };
type Template = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  source: "deals" | "expense_claims" | "contracts" | "commissions";
  config: {
    columns?: string[];
    segments?: string[];
    group_by?: string[];
    filters?: {
      date_field?: string;
      last_days?: number;
      status_in?: string[];
    };
    summaries?: Summary[];
  };
};

type Row = Record<string, unknown>;

type Overrides = {
  columns: string[];
  segments: string[];
  lastDays: number | null;
  statusIn: string[];
};

const SEGMENT_CHOICES = ["status", "month"];
const CANDIDATE_COLUMNS: Record<Template["source"], string[]> = {
  deals: [
    "status",
    "offer_amount",
    "agreed_amount",
    "offer_date",
    "expected_close_date",
    "created_at",
  ],
  expense_claims: [
    "claim_number",
    "status",
    "amount",
    "category",
    "submitted_at",
    "approved_at",
    "created_at",
  ],
  contracts: ["contract_number", "status", "amount", "start_date", "end_date", "created_at"],
  commissions: ["status", "amount", "paid_at", "created_at"],
};
const STATUS_CHOICES: Record<Template["source"], string[]> = {
  deals: ["new", "qualified", "proposal", "negotiation", "won", "lost"],
  expense_claims: ["draft", "submitted", "in_review", "approved", "rejected"],
  contracts: ["draft", "active", "ended", "cancelled"],
  commissions: ["pending", "paid", "cancelled"],
};

function parseWhere(w?: string): ((r: Row) => boolean) | null {
  if (!w) return null;
  const neq = w.split("<>");
  if (neq.length === 2) return (r) => String(r[neq[0].trim()] ?? "") !== neq[1].trim();
  const eq = w.split("=");
  if (eq.length === 2) return (r) => String(r[eq[0].trim()] ?? "") === eq[1].trim();
  return null;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function computeSummary(rows: Row[], s: Summary): number {
  const pred = parseWhere(s.where);
  const filtered = pred ? rows.filter(pred) : rows;
  if (s.agg === "count") return filtered.length;
  return filtered.reduce((acc, r) => acc + toNum(r[s.field]), 0);
}

function monthKey(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function segmentBy(rows: Row[], seg: string, dateField?: string) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = seg === "month" ? monthKey(r[dateField ?? "created_at"]) : String(r[seg] ?? "—");
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map, ([key, value]) => ({ key, value })).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

function download(name: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function PreviewPage() {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides | null>(null);
  const bg = useBackgroundExport();

  const tq = useQuery({
    queryKey: ["report_templates", "preview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("id,org_id,name,description,source,config")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Template[];
    },
  });

  const templates = tq.data ?? [];
  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  // Auto-select first template on load
  useEffect(() => {
    if (!templateId && templates.length > 0) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  // Reset overrides when template changes
  useEffect(() => {
    if (!template) {
      setOverrides(null);
      return;
    }
    setOverrides({
      columns: [...(template.config.columns ?? [])],
      segments: [...(template.config.segments ?? [])],
      lastDays: template.config.filters?.last_days ?? null,
      statusIn: [...(template.config.filters?.status_in ?? [])],
    });
  }, [template]);

  function resetOverrides() {
    if (!template) return;
    setOverrides({
      columns: [...(template.config.columns ?? [])],
      segments: [...(template.config.segments ?? [])],
      lastDays: template.config.filters?.last_days ?? null,
      statusIn: [...(template.config.filters?.status_in ?? [])],
    });
  }

  const effectiveColumns = overrides?.columns ?? template?.config.columns ?? [];
  const effectiveSegments = overrides?.segments ?? template?.config.segments ?? [];
  const effectiveLastDays = overrides?.lastDays ?? template?.config.filters?.last_days ?? null;
  const effectiveStatusIn = overrides?.statusIn ?? template?.config.filters?.status_in ?? [];

  const rq = useQuery({
    queryKey: [
      "report_preview_rows",
      template?.id,
      effectiveLastDays,
      effectiveStatusIn.join(","),
      effectiveColumns.join(","),
    ],
    enabled: !!template && !!overrides,
    queryFn: async (): Promise<Row[]> => {
      if (!template) return [];
      const cols = new Set<string>(effectiveColumns);
      cols.add("id");
      if (template.config.filters?.date_field) cols.add(template.config.filters.date_field);
      effectiveSegments.forEach((s) => s !== "month" && cols.add(s));
      (template.config.summaries ?? []).forEach((s) => s.field !== "id" && cols.add(s.field));

      let q = supabase
        .from(template.source)
        .select(Array.from(cols).join(","))
        .eq("org_id", template.org_id)
        .limit(500);

      const f = template.config.filters ?? {};
      if (effectiveStatusIn.length) q = q.in("status", effectiveStatusIn);
      if (f.date_field && effectiveLastDays) {
        const since = new Date(Date.now() - effectiveLastDays * 86_400_000).toISOString();
        q = q.gte(f.date_field, since);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = rq.data ?? [];
  const summaries = template?.config.summaries ?? [];
  const segments = effectiveSegments;
  const dateField = template?.config.filters?.date_field;

  const summaryValues = summaries.map((s) => ({ ...s, value: computeSummary(rows, s) }));
  const segmentData = segments.map((seg) => ({ seg, data: segmentBy(rows, seg, dateField) }));

  function exportCsv() {
    if (!template) return;
    const cols = effectiveColumns.length ? effectiveColumns : Object.keys(rows[0] ?? {});
    const csv = [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(",")),
    ].join("\n");
    download(`${template.name.replace(/\s+/g, "_")}_data.csv`, "text/csv", "\uFEFF" + csv);
  }
  function exportJson() {
    if (!template) return;
    const payload = {
      template: template.name,
      source: template.source,
      generated_at: new Date().toISOString(),
      settings: {
        columns: effectiveColumns,
        segments: effectiveSegments,
        filters: {
          date_field: template.config.filters?.date_field,
          last_days: effectiveLastDays,
          status_in: effectiveStatusIn,
        },
      },
      summaries: summaryValues,
      segments: segmentData,
      rows,
    };
    download(
      `${template.name.replace(/\s+/g, "_")}_report.json`,
      "application/json",
      JSON.stringify(payload, null, 2),
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <PlayCircle className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Report Preview</h1>
            <p className="text-sm text-muted-foreground">
              Choose a template — the report is generated automatically from live demo data.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <FileSpreadsheet className="size-4 me-1.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportJson} disabled={!rows.length}>
            <FileJson className="size-4 me-1.5" /> JSON
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!template) return;
              bg.start({
                orgId: template.org_id,
                templateId: template.id,
                format: "csv",
              });
            }}
            disabled={!template || !!bg.isRunning}
          >
            {bg.isRunning ? (
              <Loader2 className="size-4 me-1.5 animate-spin" />
            ) : (
              <Rocket className="size-4 me-1.5" />
            )}
            Run in background
          </Button>
        </div>
      </div>

      {bg.job && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {bg.job.status === "completed" ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : bg.job.status === "failed" ? (
                  <XCircle className="size-4 text-destructive" />
                ) : (
                  <Loader2 className="size-4 animate-spin text-primary" />
                )}
                <span className="font-medium">
                  Background export · {bg.job.format?.toUpperCase()}
                </span>
                <span className="text-muted-foreground">{bg.job.step ?? bg.job.status}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {typeof bg.job.row_count === "number" && <span>{bg.job.row_count} rows</span>}
                <Button variant="ghost" size="sm" onClick={bg.reset}>
                  Dismiss
                </Button>
              </div>
            </div>
            <Progress value={bg.job.progress ?? 0} />
            {bg.job.error && <p className="text-xs text-destructive">{bg.job.error}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tq.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates yet. Run <b>Seed report templates</b> in Admin → Seed.
            </p>
          ) : (
            <>
              <Select value={templateId ?? undefined} onValueChange={(v) => setTemplateId(v)}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} <span className="text-muted-foreground">· {t.source}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {template && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{template.source}</Badge>
                  {template.description}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {template && overrides && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Settings</CardTitle>
            <Button size="sm" variant="ghost" onClick={resetOverrides}>
              <RotateCcw className="size-4 me-1.5" /> Reset
            </Button>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Columns</Label>
              <div className="flex flex-col gap-1.5">
                {CANDIDATE_COLUMNS[template.source].map((c) => {
                  const on = effectiveColumns.includes(c);
                  return (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) =>
                          setOverrides(
                            (o) =>
                              o && {
                                ...o,
                                columns: v ? [...o.columns, c] : o.columns.filter((x) => x !== c),
                              },
                          )
                        }
                      />
                      <span className="font-mono text-xs">{c}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Segments</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SEGMENT_CHOICES.map((s) => {
                    const on = effectiveSegments.includes(s);
                    return (
                      <Toggle
                        key={s}
                        size="sm"
                        pressed={on}
                        onPressedChange={(v) =>
                          setOverrides(
                            (o) =>
                              o && {
                                ...o,
                                segments: v
                                  ? [...o.segments, s]
                                  : o.segments.filter((x) => x !== s),
                              },
                          )
                        }
                      >
                        {s}
                      </Toggle>
                    );
                  })}
                </div>
              </div>
              {template.config.filters?.date_field && (
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    Last N days ({template.config.filters.date_field})
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    className="mt-2 max-w-[160px]"
                    value={effectiveLastDays ?? ""}
                    placeholder="all"
                    onChange={(e) =>
                      setOverrides(
                        (o) =>
                          o && {
                            ...o,
                            lastDays: e.target.value ? Number(e.target.value) : null,
                          },
                      )
                    }
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Status filter</Label>
              <div className="flex flex-col gap-1.5">
                {STATUS_CHOICES[template.source].map((s) => {
                  const on = effectiveStatusIn.includes(s);
                  return (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) =>
                          setOverrides(
                            (o) =>
                              o && {
                                ...o,
                                statusIn: v
                                  ? [...o.statusIn, s]
                                  : o.statusIn.filter((x) => x !== s),
                              },
                          )
                        }
                      />
                      <span className="text-xs">{s}</span>
                    </label>
                  );
                })}
                <p className="text-[11px] text-muted-foreground">Leave empty to include all.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {template &&
        (rq.isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : rq.error ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">
              Failed to load data: {(rq.error as Error).message}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summaryValues.map((s, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt(s.value)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {s.agg}({s.field}){s.where ? ` · ${s.where}` : ""}
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Rows</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt(rows.length)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="me-1 inline size-3" /> auto-generated
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {segmentData.map(({ seg, data }) => (
                <Card key={seg}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">By {seg}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {data.length === 0 ? (
                      <p className="py-8 text-center text-xs text-muted-foreground">No data</p>
                    ) : (
                      <div className="h-56">
                        <MotionBarChart
                          data={data}
                          index="key"
                          categories={["value"]}
                          colors={["emerald"]}
                          showLegend={false}
                          className="h-56 mt-2"
                        />
                      </div>

                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Preview rows (first 20)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No rows match this template's filters.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {(effectiveColumns.length ? effectiveColumns : Object.keys(rows[0])).map(
                          (c) => (
                            <TableHead key={c}>{c}</TableHead>
                          ),
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 20).map((r, i) => (
                        <TableRow key={i}>
                          {(effectiveColumns.length ? effectiveColumns : Object.keys(rows[0])).map(
                            (c) => (
                              <TableCell key={c} className="whitespace-nowrap text-xs">
                                {r[c] === null || r[c] === undefined ? "—" : String(r[c])}
                              </TableCell>
                            ),
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        ))}
    </div>
  );
}
