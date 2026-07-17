import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  FileSpreadsheet,
  FileJson,
  FileText,
  Sheet as SheetIcon,
  Save,
  Play,
  Sigma,
  Filter,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  FINANCE_SOURCES,
  findSource,
  type SourceKey,
  type ColumnDef,
} from "@/lib/finance-report-sources";
import { can } from "@/lib/permissions";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/reports/builder")({
  head: () => ({
    meta: [
      { title: "Report Builder — Finance" },
      {
        name: "description",
        content:
          "Configure finance reports with custom columns, filters and CSV/XLSX/JSON/PDF exports.",
      },
    ],
  }),
  component: BuilderPage,
});

type BuilderState = {
  source: SourceKey;
  columns: string[];
  fromDate: string;
  toDate: string;
  statusIn: string[];
  search: string;
  groupBy: string;
  limit: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(d: number) {
  return new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
}

function defaultState(key: SourceKey): BuilderState {
  const src = findSource(key)!;
  return {
    source: key,
    columns: src.columns.slice(0, 6).map((c) => c.key),
    fromDate: daysAgoISO(90),
    toDate: todayISO(),
    statusIn: [],
    search: "",
    groupBy: "",
    limit: 500,
  };
}

type SavedTemplate = {
  id: string;
  name: string;
  description: string | null;
  source: string;
  export_formats: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
};

function BuilderPage() {
  const { orgId, ready, role } = useCurrentOrg();
  const canView = can.viewReports(role);
  const canSave = can.saveReportTemplate(role);
  const canExport = can.exportReport(role);
  const qc = useQueryClient();
  const [state, setState] = useState<BuilderState>(() => defaultState("invoices"));
  const src = findSource(state.source)!;

  const templatesQ = useQuery({
    queryKey: ["report_templates", "builder", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("id, name, description, source, export_formats, config")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedTemplate[];
    },
  });

  const preview = useQuery({
    queryKey: ["report_builder_preview", orgId, state],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: () => runQuery(orgId!, state, 25),
  });

  function setSource(next: SourceKey) {
    setState(defaultState(next));
  }

  function toggleColumn(key: string) {
    setState((s) => ({
      ...s,
      columns: s.columns.includes(key) ? s.columns.filter((c) => c !== key) : [...s.columns, key],
    }));
  }

  function toggleStatus(v: string) {
    setState((s) => ({
      ...s,
      statusIn: s.statusIn.includes(v) ? s.statusIn.filter((x) => x !== v) : [...s.statusIn, v],
    }));
  }

  const cols: ColumnDef[] = useMemo(
    () => src.columns.filter((c) => state.columns.includes(c.key)),
    [src, state.columns],
  );

  const [exporting, setExporting] = useState<null | "csv" | "json" | "xlsx" | "pdf">(null);

  async function runExport(fmt: "csv" | "json" | "xlsx" | "pdf") {
    if (!orgId) return;
    if (!canExport) {
      toast.error("You don't have permission to export reports.");
      return;
    }
    setExporting(fmt);
    try {
      const rows = await runQuery(orgId, state, state.limit);
      const filename = `${state.source}-${todayISO()}`;
      if (fmt === "json") {
        download(
          `${filename}.json`,
          "application/json",
          JSON.stringify(
            { source: state.source, generated_at: new Date().toISOString(), rows },
            null,
            2,
          ),
        );
      } else if (fmt === "csv") {
        download(`${filename}.csv`, "text/csv;charset=utf-8", "\uFEFF" + toCsv(rows, cols));
      } else if (fmt === "xlsx") {
        exportXlsx(filename, rows, cols, state, summaries(rows));
      } else {
        exportPdf(filename, rows, cols, state, summaries(rows));
      }
      toast.success(
        `Exported ${rows.length} row${rows.length === 1 ? "" : "s"} as ${fmt.toUpperCase()}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const summaries = (rows: Record<string, unknown>[]) => {
    const numericCols = cols.filter((c) => c.kind === "number");
    return numericCols.map((c) => {
      const total = rows.reduce((acc, r) => acc + toNumber(r[c.key]), 0);
      const avg = rows.length ? total / rows.length : 0;
      return { key: c.key, label: c.label, total, avg, count: rows.length };
    });
  };

  const saveTemplate = useMutation({
    mutationFn: async ({
      name,
      description,
      formats,
    }: {
      name: string;
      description: string;
      formats: string[];
    }) => {
      if (!orgId) throw new Error("No organization");
      const config = {
        columns: state.columns,
        filters: {
          date_field: src.dateField,
          from: state.fromDate || null,
          to: state.toDate || null,
          status_in: state.statusIn,
          search: state.search || null,
        },
        segments: state.groupBy ? [state.groupBy] : [],
        summaries: cols
          .filter((c) => c.kind === "number")
          .map((c) => ({ label: `Sum of ${c.label}`, field: c.key, agg: "sum" })),
      };
      const { error } = await supabase.from("report_templates").insert({
        org_id: orgId,
        name,
        description: description || null,
        source: state.source,
        export_formats: formats,
        config,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["report_templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  function loadTemplate(t: SavedTemplate) {
    const src2 = findSource(t.source);
    if (!src2) return toast.error(`Source "${t.source}" not available in the builder`);
    const cfg = t.config ?? {};
    setState({
      source: t.source as SourceKey,
      columns:
        Array.isArray(cfg.columns) && cfg.columns.length
          ? cfg.columns.filter((c: string) => src2.columns.some((x) => x.key === c))
          : src2.columns.slice(0, 6).map((c) => c.key),
      fromDate: cfg.filters?.from ?? daysAgoISO(90),
      toDate: cfg.filters?.to ?? todayISO(),
      statusIn: Array.isArray(cfg.filters?.status_in) ? cfg.filters.status_in : [],
      search: cfg.filters?.search ?? "",
      groupBy: Array.isArray(cfg.segments) && cfg.segments[0] ? cfg.segments[0] : "",
      limit: 500,
    });
    toast.success(`Loaded "${t.name}"`);
  }

  if (!ready) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="size-8 text-muted-foreground" />
            <div className="text-lg font-semibold">Access restricted</div>
            <p className="text-sm text-muted-foreground">
              Your role doesn't include access to the report builder.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Sigma className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Finance Report Builder</h1>
            <p className="text-sm text-muted-foreground">
              Pick a source, choose columns and filters, then export as CSV, XLSX, JSON or PDF.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(templatesQ.data ?? []).length > 0 && (
            <Select
              onValueChange={(id) => {
                const t = templatesQ.data?.find((x) => x.id === id);
                if (t) loadTemplate(t);
              }}
            >
              <SelectTrigger className="w-56 gap-2">
                <BookOpen className="size-3.5 opacity-70" />
                <SelectValue placeholder="Load template…" />
              </SelectTrigger>
              <SelectContent>
                {(templatesQ.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="text-muted-foreground">· {t.source}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canSave ? (
            <SaveTemplateDialog
              defaultName={`${src.label} — ${todayISO()}`}
              onSave={(v) => saveTemplate.mutate(v)}
              saving={saveTemplate.isPending}
            />
          ) : (
            <Badge variant="outline" className="gap-1">
              <ShieldAlert className="size-3" /> View-only
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Data source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={state.source} onValueChange={(v) => setSource(v as SourceKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINANCE_SOURCES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. Columns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-auto">
              {src.columns.map((c) => (
                <label
                  key={c.key}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5"
                >
                  <Checkbox
                    checked={state.columns.includes(c.key)}
                    onCheckedChange={() => toggleColumn(c.key)}
                  />
                  <span className="flex-1">{c.label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {c.kind}
                  </Badge>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="size-4" /> 3. Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">From ({src.dateField})</Label>
                  <Input
                    type="date"
                    value={state.fromDate}
                    onChange={(e) => setState({ ...state, fromDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={state.toDate}
                    onChange={(e) => setState({ ...state, toDate: e.target.value })}
                  />
                </div>
              </div>
              {src.statusOptions && src.statusField && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {src.statusOptions.map((v) => {
                      const active = state.statusIn.includes(v);
                      return (
                        <Badge
                          key={v}
                          variant={active ? "default" : "outline"}
                          className="cursor-pointer capitalize"
                          onClick={() => toggleStatus(v)}
                        >
                          {v}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Text search (in visible text columns)</Label>
                <Input
                  value={state.search}
                  onChange={(e) => setState({ ...state, search: e.target.value })}
                  placeholder="e.g. INV-2025"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Group by</Label>
                  <Select
                    value={state.groupBy || "__none__"}
                    onValueChange={(v) =>
                      setState({ ...state, groupBy: v === "__none__" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {src.columns
                        .filter((c) => c.kind !== "number")
                        .map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Row limit</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10000"
                    value={state.limit}
                    onChange={(e) =>
                      setState({
                        ...state,
                        limit: Math.min(10000, Math.max(1, Number(e.target.value) || 500)),
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="size-4" /> Live preview
                {preview.isFetching && (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                )}
                <Badge variant="secondary" className="ml-2">
                  {(preview.data ?? []).length} rows · showing up to 25
                </Badge>
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!exporting || !canExport}
                  title={!canExport ? "No export permission" : undefined}
                  onClick={() => runExport("csv")}
                >
                  {exporting === "csv" ? (
                    <Loader2 className="size-4 me-1.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="size-4 me-1.5" />
                  )}
                  CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!exporting || !canExport}
                  title={!canExport ? "No export permission" : undefined}
                  onClick={() => runExport("xlsx")}
                >
                  {exporting === "xlsx" ? (
                    <Loader2 className="size-4 me-1.5 animate-spin" />
                  ) : (
                    <SheetIcon className="size-4 me-1.5" />
                  )}
                  XLSX
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!exporting || !canExport}
                  title={!canExport ? "No export permission" : undefined}
                  onClick={() => runExport("json")}
                >
                  {exporting === "json" ? (
                    <Loader2 className="size-4 me-1.5 animate-spin" />
                  ) : (
                    <FileJson className="size-4 me-1.5" />
                  )}
                  JSON
                </Button>
                <Button
                  size="sm"
                  disabled={!!exporting || !canExport}
                  title={!canExport ? "No export permission" : undefined}
                  onClick={() => runExport("pdf")}
                >
                  {exporting === "pdf" ? (
                    <Loader2 className="size-4 me-1.5 animate-spin" />
                  ) : (
                    <FileText className="size-4 me-1.5" />
                  )}
                  PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[520px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      {cols.map((c) => (
                        <TableHead key={c.key} className={c.kind === "number" ? "text-right" : ""}>
                          {c.label}
                        </TableHead>
                      ))}
                      {cols.length === 0 && <TableHead>No columns selected</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.isError && (
                      <TableRow>
                        <TableCell
                          colSpan={Math.max(cols.length, 1)}
                          className="text-destructive text-sm"
                        >
                          {(preview.error as Error)?.message ?? "Query failed"}
                        </TableCell>
                      </TableRow>
                    )}
                    {!preview.isError &&
                      (preview.data ?? []).length === 0 &&
                      !preview.isFetching && (
                        <TableRow>
                          <TableCell
                            colSpan={Math.max(cols.length, 1)}
                            className="text-muted-foreground text-sm text-center py-8"
                          >
                            No rows match the current filters.
                          </TableCell>
                        </TableRow>
                      )}
                    {(preview.data ?? []).map((r, i) => (
                      <TableRow key={i}>
                        {cols.map((c) => (
                          <TableCell
                            key={c.key}
                            className={c.kind === "number" ? "text-right tabular-nums" : ""}
                          >
                            {formatCell(r[c.key], c)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {cols.some((c) => c.kind === "number") && (preview.data?.length ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Summary (preview rows)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {summaries(preview.data ?? []).map((s) => (
                  <div key={s.key} className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-lg font-semibold tabular-nums">
                      {formatNumber(s.total)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      avg {formatNumber(s.avg)} · {s.count} rows
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// -------- data + formatting --------

async function runQuery(orgId: string, s: BuilderState, limit: number) {
  const src = findSource(s.source)!;
  const selectCols = Array.from(new Set([...s.columns, src.dateField, "id"])).join(",");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase.from(s.source as any) as any).select(selectCols).eq("org_id", orgId);
  if (s.fromDate) q = q.gte(src.dateField, s.fromDate);
  if (s.toDate) q = q.lte(src.dateField, s.toDate + "T23:59:59");
  if (src.statusField && s.statusIn.length > 0) q = q.in(src.statusField, s.statusIn);
  if (s.search.trim()) {
    const textCols = src.columns.filter((c) => c.kind === "text").map((c) => c.key);
    if (textCols.length) {
      const pattern = `%${s.search.trim().replace(/[%_]/g, "")}%`;
      q = q.or(textCols.map((c) => `${c}.ilike.${pattern}`).join(","));
    }
  }
  q = q.order(src.dateField, { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function formatNumber(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

function formatCell(v: unknown, c: ColumnDef): string {
  if (v === null || v === undefined || v === "") return "—";
  if (c.kind === "number") return formatNumber(toNumber(v));
  if (c.kind === "date") {
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  }
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function toCsv(rows: Record<string, unknown>[], cols: ColumnDef[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(",")).join("\n");
  return header + "\n" + body;
}

function download(name: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function exportXlsx(
  name: string,
  rows: Record<string, unknown>[],
  cols: ColumnDef[],
  state: BuilderState,
  summ: { label: string; total: number; count: number; avg: number }[],
) {
  const wb = XLSX.utils.book_new();
  const header = cols.map((c) => c.label);
  const body = rows.map((r) =>
    cols.map((c) => {
      const v = r[c.key];
      if (v === null || v === undefined) return "";
      if (c.kind === "number") return toNumber(v);
      return typeof v === "object" ? JSON.stringify(v) : v;
    }),
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = cols.map((c) => ({
    wch: c.kind === "number" ? 14 : Math.max(12, c.label.length + 4),
  }));
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  const meta = [
    ["Report", name],
    ["Source", state.source],
    ["Generated at", new Date().toISOString()],
    ["Date range", `${state.fromDate || "—"} to ${state.toDate || "—"}`],
    ["Status filter", state.statusIn.join(", ") || "All"],
    ["Search", state.search || "—"],
    ["Group by", state.groupBy || "—"],
    ["Row count", rows.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "Meta");

  if (summ.length) {
    const sHeader = ["Column", "Sum", "Average", "Count"];
    const sBody = summ.map((s) => [s.label, s.total, s.avg, s.count]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sHeader, ...sBody]), "Summary");
  }
  XLSX.writeFile(wb, `${name}.xlsx`);
}

function exportPdf(
  name: string,
  rows: Record<string, unknown>[],
  cols: ColumnDef[],
  state: BuilderState,
  summ: { label: string; total: number; count: number; avg: number }[],
) {
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
    orientation: cols.length > 6 ? "landscape" : "portrait",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(16);
  doc.text(`Finance report — ${state.source}`, 40, 48);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    [
      `Generated: ${new Date().toLocaleString()}`,
      `Range: ${state.fromDate || "—"} → ${state.toDate || "—"}`,
      state.statusIn.length ? `Status: ${state.statusIn.join(", ")}` : null,
      state.search ? `Search: "${state.search}"` : null,
      `Rows: ${rows.length}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    40,
    64,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 82,
    head: [cols.map((c) => c.label)],
    body: rows.map((r) => cols.map((c) => formatCell(r[c.key], c))),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: cols.reduce(
      (acc, c, i) => {
        if (c.kind === "number") acc[i] = { halign: "right" };
        return acc;
      },
      {} as Record<number, { halign: "right" }>,
    ),
    margin: { left: 40, right: 40, top: 82, bottom: 60 },
    showHead: "everyPage",
  });

  if (summ.length) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
    autoTable(doc, {
      startY: finalY + 16,
      head: [["Column", "Sum", "Average", "Count"]],
      body: summ.map((s) => [s.label, formatNumber(s.total), formatNumber(s.avg), String(s.count)]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      margin: { left: 40, right: 40 },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} / ${pages}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, {
      align: "right",
    });
  }

  doc.save(`${name}.pdf`);
}

function SaveTemplateDialog({
  defaultName,
  onSave,
  saving,
}: {
  defaultName: string;
  onSave: (v: { name: string; description: string; formats: string[] }) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [desc, setDesc] = useState("");
  const [fmts, setFmts] = useState<string[]>(["csv", "xlsx", "pdf"]);
  const ALL = ["csv", "xlsx", "json", "pdf"];
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setName(defaultName);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2">
          <Save className="size-4" /> Save as template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save report template</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Available formats</Label>
            <div className="flex flex-wrap gap-2">
              {ALL.map((f) => (
                <Badge
                  key={f}
                  variant={fmts.includes(f) ? "default" : "outline"}
                  className="cursor-pointer uppercase"
                  onClick={() =>
                    setFmts((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]))
                  }
                >
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || fmts.length === 0 || saving}
            onClick={() => {
              onSave({ name: name.trim(), description: desc.trim(), formats: fmts });
              setOpen(false);
            }}
          >
            {saving ? (
              <Loader2 className="size-4 me-1.5 animate-spin" />
            ) : (
              <Save className="size-4 me-1.5" />
            )}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
