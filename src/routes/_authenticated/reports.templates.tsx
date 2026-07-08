import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Loader2, Download, FileJson, FileSpreadsheet, LayoutTemplate } from "lucide-react";
import { FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/reports/templates")({
  head: () => ({ meta: [{ title: "Report Templates" }] }),
  component: TemplatesPage,
});

type Template = {
  id: string;
  name: string;
  description: string | null;
  source: string;
  export_formats: string[];
  config: {
    columns?: string[];
    segments?: string[];
    group_by?: string[];
    filters?: Record<string, unknown>;
    summaries?: { label: string; field: string; agg: string; where?: string }[];
  };
};

function download(name: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTemplate(t: Template, fmt: "csv" | "json") {
  if (fmt === "json") {
    download(`${t.name.replace(/\s+/g, "_")}.json`, "application/json", JSON.stringify(t, null, 2));
    return;
  }
  const rows = (t.config.summaries ?? []).map((s) => ({
    template: t.name,
    source: t.source,
    summary: s.label,
    field: s.field,
    agg: s.agg,
    where: s.where ?? "",
  }));
  const headers = ["template", "source", "summary", "field", "agg", "where"];
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? "")).join(","),
    ),
  ].join("\n");
  download(`${t.name.replace(/\s+/g, "_")}.csv`, "text/csv", "\uFEFF" + csv);
}

type PdfLayout = {
  format: "a4" | "letter";
  orientation: "portrait" | "landscape";
  headerText: string;
  logoDataUrl?: string | null;
};

const DEFAULT_LAYOUT: PdfLayout = {
  format: "a4",
  orientation: "portrait",
  headerText: "",
  logoDataUrl: null,
};

function buildTemplatePdf(t: Template, layout: PdfLayout = DEFAULT_LAYOUT): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: layout.format, orientation: layout.orientation });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const marginTop = 48;
  const marginBottom = 48;
  const contentWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };
  const lastTableY = (): number => {
    const at = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    return at?.finalY ?? y;
  };

  if (layout.logoDataUrl) {
    try {
      const fmt = layout.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(layout.logoDataUrl, fmt, marginX, y - 10, 60, 40);
    } catch {
      /* ignore invalid image */
    }
  }
  if (layout.headerText) {
    doc.setFontSize(11);
    doc.setTextColor(90);
    doc.text(layout.headerText, pageWidth - marginX, y, { align: "right" });
    doc.setTextColor(0);
  }
  if (layout.logoDataUrl || layout.headerText) {
    y += 38;
    doc.setDrawColor(220);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 14;
  }

  ensureSpace(60);
  doc.setFontSize(16);
  doc.text(t.name, marginX, y);
  y += 18;
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Source: ${t.source}`, marginX, y);
  y += 14;
  if (t.description) {
    const lines = doc.splitTextToSize(t.description, contentWidth);
    ensureSpace(lines.length * 12 + 4);
    doc.text(lines, marginX, y);
    y += lines.length * 12 + 4;
  }
  doc.setTextColor(0);

  const summaries = t.config.summaries ?? [];
  if (summaries.length) {
    autoTable(doc, {
      startY: y + 6,
      head: [["Summary", "Field", "Aggregation", "Filter"]],
      body: summaries.map((s) => [s.label, s.field, s.agg, s.where ?? "—"]),
      styles: { fontSize: 9, cellPadding: 6, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      margin: { left: marginX, right: marginX, top: marginTop, bottom: marginBottom },
      rowPageBreak: "avoid",
      showHead: "everyPage",
    });
    y = lastTableY() + 12;
  }

  const segments = t.config.segments ?? [];
  const groupBy = t.config.group_by ?? [];
  const columns = t.config.columns ?? [];
  autoTable(doc, {
    startY: y + 6,
    head: [["Section", "Values"]],
    body: [
      ["Segments", segments.length ? segments.join(", ") : "—"],
      ["Group by", groupBy.length ? groupBy.join(", ") : "—"],
      ["Columns", columns.length ? columns.join(", ") : "—"],
      ["Filters", JSON.stringify(t.config.filters ?? {}, null, 0)],
    ],
    styles: { fontSize: 9, cellPadding: 6, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    columnStyles: { 0: { cellWidth: 100, fontStyle: "bold" } },
    margin: { left: marginX, right: marginX, top: marginTop, bottom: marginBottom },
    rowPageBreak: "auto",
    showHead: "everyPage",
  });

  return doc;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function TemplatesPage() {
  const q = useQuery({
    queryKey: ["report_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("id,name,description,source,export_formats,config")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Template[];
    },
  });

  const templates = useMemo(() => q.data ?? [], [q.data]);
  const [previewT, setPreviewT] = useState<Template | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [layout, setLayout] = useState<PdfLayout>(DEFAULT_LAYOUT);
  const [busy, setBusy] = useState<{ id: string; fmt: "csv" | "json" | "pdf" } | null>(null);
  const [progress, setProgress] = useState<{ pct: number; step: string } | null>(null);

  const tick = (pct: number, step: string) =>
    new Promise<void>((r) => {
      setProgress({ pct, step });
      setTimeout(r, 60);
    });

  useEffect(() => {
    if (!previewT) {
      setPreviewUrl(null);
      setPreviewError(null);
      return;
    }
    setPreviewError(null);
    setPreviewUrl(null);
    try {
      const doc = buildTemplatePdf(previewT, layout);
      const url = doc.output("bloburl").toString();
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to render PDF preview";
      setPreviewError(msg);
      toast.error("PDF preview failed", { description: msg });
    }
  }, [previewT, layout]);

  const runExport = async (t: Template, fmt: "csv" | "json") => {
    setBusy({ id: t.id, fmt });
    try {
      await tick(15, "Preparing data…");
      await tick(55, `Serializing ${fmt.toUpperCase()}…`);
      exportTemplate(t, fmt);
      await tick(100, "Downloading file…");
      toast.success(`Exported ${fmt.toUpperCase()}`, { description: t.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`${fmt.toUpperCase()} export failed`, { description: msg });
    } finally {
      setTimeout(() => {
        setBusy(null);
        setProgress(null);
      }, 250);
    }
  };

  const runPdfDownload = async () => {
    if (!previewT) return;
    setBusy({ id: previewT.id, fmt: "pdf" });
    try {
      await tick(20, "Applying layout…");
      await tick(50, "Rendering tables…");
      const doc = buildTemplatePdf(previewT, layout);
      await tick(85, "Encoding PDF…");
      doc.save(`${previewT.name.replace(/\s+/g, "_")}.pdf`);
      await tick(100, "Saved");
      toast.success("Downloaded PDF", { description: previewT.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("PDF download failed", { description: msg });
    } finally {
      setTimeout(() => {
        setBusy(null);
        setProgress(null);
      }, 250);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <LayoutTemplate className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Report Templates</h1>
          <p className="text-sm text-muted-foreground">
            Preview summaries, segments, and export in CSV or JSON.
          </p>
        </div>
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No templates yet. Run <b>Seed report templates</b> in Admin → Seed.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <Badge variant="secondary">{t.source}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Summaries</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(t.config.summaries ?? []).map((s, i) => (
                      <Badge key={i} variant="outline" className="font-normal">
                        {s.label}:{" "}
                        <span className="ms-1 opacity-70">
                          {s.agg}({s.field})
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Segments</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(t.config.segments ?? []).map((s) => (
                      <Badge key={s} variant="secondary" className="font-normal">
                        {s}
                      </Badge>
                    ))}
                    {(t.config.segments ?? []).length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy?.id === t.id && busy.fmt === "csv"}
                    onClick={() => runExport(t, "csv")}
                  >
                    {busy?.id === t.id && busy.fmt === "csv" ? (
                      <Loader2 className="size-4 me-1.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="size-4 me-1.5" />
                    )}
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy?.id === t.id && busy.fmt === "json"}
                    onClick={() => runExport(t, "json")}
                  >
                    {busy?.id === t.id && busy.fmt === "json" ? (
                      <Loader2 className="size-4 me-1.5 animate-spin" />
                    ) : (
                      <FileJson className="size-4 me-1.5" />
                    )}
                    Export JSON
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPreviewT(t)}>
                    <FileText className="size-4 me-1.5" /> Export PDF
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a
                      href={`data:application/json,${encodeURIComponent(JSON.stringify(t.config, null, 2))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="size-4 me-1.5" /> View config
                    </a>
                  </Button>
                </div>
                {busy?.id === t.id && busy.fmt !== "pdf" && progress && (
                  <div className="space-y-1 pt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{progress.step}</span>
                      <span>{progress.pct}%</span>
                    </div>
                    <Progress value={progress.pct} className="h-1.5" />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewT} onOpenChange={(o) => !o && setPreviewT(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>PDF preview — {previewT?.name}</DialogTitle>
            <DialogDescription>
              Review formatting and tables, then download the PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-md border bg-card/40 p-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Page size</Label>
              <Select
                value={layout.format}
                onValueChange={(v) => setLayout({ ...layout, format: v as PdfLayout["format"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Orientation</Label>
              <Select
                value={layout.orientation}
                onValueChange={(v) =>
                  setLayout({ ...layout, orientation: v as PdfLayout["orientation"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Header text</Label>
              <Input
                value={layout.headerText}
                onChange={(e) => setLayout({ ...layout, headerText: e.target.value })}
                placeholder="Company name"
              />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label className="text-xs">Logo (PNG/JPEG)</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setLayout({ ...layout, logoDataUrl: await fileToDataUrl(f) });
                }}
              />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => setLayout(DEFAULT_LAYOUT)}>
                Reset
              </Button>
            </div>
          </div>
          <div className="h-[70vh] w-full overflow-hidden rounded-md border bg-muted">
            {previewError ? (
              <div className="grid h-full place-items-center p-6 text-center text-sm text-destructive">
                <div>
                  <div className="font-medium">PDF preview failed</div>
                  <div className="mt-1 text-xs opacity-80">{previewError}</div>
                </div>
              </div>
            ) : previewUrl ? (
              <iframe title="PDF preview" src={previewUrl} className="h-full w-full" />
            ) : (
              <div className="grid h-full place-items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                <span>Generating preview…</span>
              </div>
            )}
          </div>
          <DialogFooter>
            {busy?.fmt === "pdf" && progress && (
              <div className="me-auto w-full max-w-xs space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progress.step}</span>
                  <span>{progress.pct}%</span>
                </div>
                <Progress value={progress.pct} className="h-1.5" />
              </div>
            )}
            <Button variant="ghost" onClick={() => setPreviewT(null)}>
              Cancel
            </Button>
            <Button
              onClick={runPdfDownload}
              disabled={!previewUrl || !!previewError || busy?.fmt === "pdf"}
            >
              {busy?.fmt === "pdf" ? (
                <Loader2 className="size-4 me-1.5 animate-spin" />
              ) : (
                <Download className="size-4 me-1.5" />
              )}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
