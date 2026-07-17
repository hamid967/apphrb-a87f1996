import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import { Upload, FileText, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type ImportResult = {
  created: number;
  updated?: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  templateHeaders: string[];
  sampleRow: Record<string, string>;
  onImport: (rows: Record<string, string>[]) => Promise<ImportResult>;
  onDone?: () => void;
  header?: React.ReactNode;
  canImport?: boolean;
  /** Optional client-side validator; return an array of error messages (empty = valid). */
  validateRow?: (row: Record<string, string>, index: number) => string[];
};

export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  templateHeaders,
  sampleRow,
  onImport,
  onDone,
  header,
  canImport = true,
  validateRow,
}: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  // Map: index in submitted (valid) rows -> original file row index (0-based)
  const sentIndexMapRef = useRef<number[]>([]);
  const sentRowsRef = useRef<Record<string, string>[]>([]);

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    setProgress(0);
    sentIndexMapRef.current = [];
    sentRowsRef.current = [];
  };

  // Keep the small progress bar visible for a beat after completion, then clear.
  useEffect(() => {
    if (progress !== 100) return;
    const t = window.setTimeout(() => setProgress(0), 1500);
    return () => window.clearTimeout(t);
  }, [progress]);

  const normalizeHeader = (h: string) =>
    String(h ?? "").trim().toLowerCase().replace(/\s+/g, "_");

  const parseXlsx = async (f: File) => {
    const XLSX = await import("xlsx");
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [] as Record<string, string>[];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
      raw: false,
    });
    return raw
      .map((r) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
          out[normalizeHeader(k)] = v == null ? "" : String(v);
        }
        return out;
      })
      .filter((r) => Object.values(r).some((v) => v && v.trim() !== ""));
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    const name = f.name.toLowerCase();
    const isXlsx =
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      f.type.includes("spreadsheetml") ||
      f.type.includes("ms-excel");
    const parseId = toast.loading(t("csv.parsing", { name: f.name }));
    if (isXlsx) {
      try {
        const clean = await parseXlsx(f);
        setRows(clean);
        if (!clean.length) toast.error(t("csv.emptyFile"), { id: parseId });
        else toast.success(t("csv.parsed", { count: clean.length }), { id: parseId });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to parse Excel file", { id: parseId });
      }
      return;
    }
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => normalizeHeader(h),
      complete: (res) => {
        const clean = (res.data || []).filter((r) =>
          Object.values(r).some((v) => v && String(v).trim() !== ""),
        );
        setRows(clean);
        if (!clean.length) toast.error(t("csv.emptyFile"), { id: parseId });
        else toast.success(t("csv.parsed", { count: clean.length }), { id: parseId });
      },
      error: (err) => toast.error(err.message, { id: parseId }),
    });
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse([sampleRow], { columns: templateHeaders });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const validations = validateRow
    ? rows.map((r, i) => validateRow(r, i))
    : rows.map(() => [] as string[]);
  const validCount = validations.filter((e) => e.length === 0).length;
  const invalidCount = validations.length - validCount;
  const validRows = rows.filter((_, i) => validations[i].length === 0);
  const validIndexMap = rows
    .map((_, i) => i)
    .filter((i) => validations[i].length === 0);

  const submit = async () => {
    if (!validRows.length) return;
    setBusy(true);
    setProgress(5);
    sentIndexMapRef.current = validIndexMap;
    sentRowsRef.current = validRows;
    const toastId = toast.loading(
      t("csv.importingRows", { count: validRows.length }),
    );
    // Simulated progress ticker — the RPC is a single call, so we ease toward 90%
    // and jump to 100% on completion. Gives real feedback on slow mobile networks.
    let pct = 5;
    const timer = window.setInterval(() => {
      pct = Math.min(90, pct + Math.max(1, Math.round((90 - pct) * 0.12)));
      setProgress(pct);
    }, 300);
    try {
      const r = await onImport(validRows);
      setResult(r);
      setProgress(100);
      const okCount = r.created + (r.updated ?? 0);
      const errCount = r.errors.length + invalidCount;
      const summary = t("csv.doneDetail", {
        created: r.created,
        updated: r.updated ?? 0,
        skipped: r.skipped,
        errors: errCount,
      });
      if (errCount > 0 && okCount > 0) {
        toast.warning(summary, { id: toastId, duration: 6000 });
      } else if (errCount > 0 && okCount === 0) {
        toast.error(summary, { id: toastId, duration: 6000 });
      } else {
        toast.success(summary, { id: toastId, duration: 4000 });
      }
      onDone?.();
    } catch (e: any) {
      toast.error(e.message ?? "Failed", { id: toastId });
    } finally {
      window.clearInterval(timer);
      setBusy(false);
    }
  };

  const downloadErrorReport = () => {
    // Collect: client-side invalid rows (from current `rows` + validations)
    // plus server-side errors mapped back to original file rows.
    type ReportRow = { file_row: number; errors: string; data: Record<string, string> };
    const out: ReportRow[] = [];
    validations.forEach((errs, i) => {
      if (errs.length > 0) {
        out.push({ file_row: i + 1, errors: errs.join("; "), data: rows[i] ?? {} });
      }
    });
    for (const e of result?.errors ?? []) {
      // Server row 0 = batch-level (no specific row); include with empty data.
      if (!e.row) {
        out.push({ file_row: 0, errors: e.message, data: {} });
        continue;
      }
      const origIdx = sentIndexMapRef.current[e.row - 1];
      const data = sentRowsRef.current[e.row - 1] ?? {};
      out.push({
        file_row: typeof origIdx === "number" ? origIdx + 1 : e.row,
        errors: e.message,
        data,
      });
    }
    if (!out.length) return;
    const extraCols = Array.from(
      new Set(out.flatMap((r) => Object.keys(r.data))),
    ).filter((c) => !templateHeaders.includes(c));
    const columns = ["file_row", "errors", ...templateHeaders, ...extraCols];
    const csv = Papa.unparse(
      out.map((r) => ({ file_row: r.file_row, errors: r.errors, ...r.data })),
      { columns },
    );
    // Prepend UTF-8 BOM so Excel opens Arabic correctly.
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = (fileName || "import").replace(/\.(csv|xlsx|xls)$/i, "");
    a.href = url;
    a.download = `${base}-errors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("csv.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {header}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileText className="me-2 size-4" /> {t("csv.downloadTemplate")}
            </Button>
            <div className="text-xs text-muted-foreground">
              {t("csv.headers")}:{" "}
              <code className="rounded bg-muted px-1">{templateHeaders.join(", ")}</code>
            </div>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 hover:bg-muted/40">
            <Upload className="size-6 text-muted-foreground" />
            <div className="text-sm">{fileName || t("csv.chooseFile")}</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {rows.length > 0 && !result && (
            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{t("csv.previewTitle")}</div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="size-3.5" />
                    {t("csv.previewValid", { count: validCount })}
                  </span>
                  {invalidCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="size-3.5" />
                      {t("csv.previewInvalid", { count: invalidCount })}
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-64 overflow-auto rounded border bg-background">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      <th className="px-2 py-1 text-start">{t("csv.previewRow")}</th>
                      {templateHeaders.slice(0, 5).map((h) => (
                        <th key={h} className="px-2 py-1 text-start font-medium">{h}</th>
                      ))}
                      <th className="px-2 py-1 text-start">{t("csv.previewStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r, i) => {
                      const errs = validations[i];
                      const ok = errs.length === 0;
                      return (
                        <tr key={i} className={ok ? "" : "bg-amber-500/10"}>
                          <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                          {templateHeaders.slice(0, 5).map((h) => (
                            <td key={h} className="px-2 py-1 max-w-[10rem] truncate">
                              {String(r[h] ?? "")}
                            </td>
                          ))}
                          <td className="px-2 py-1">
                            {ok ? (
                              <span className="text-emerald-600">{t("csv.previewOk")}</span>
                            ) : (
                              <span className="text-amber-700" title={errs.join("; ")}>
                                {errs[0]}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {invalidCount > 0 && (
                <p className="text-xs text-muted-foreground">{t("csv.previewSkipInvalid")}</p>
              )}
              {validCount === 0 && (
                <p className="text-xs text-amber-600">{t("csv.previewNoValid")}</p>
              )}
            </div>
          )}

          {(busy || (progress > 0 && progress < 100)) && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("csv.importingRows", { count: validRows.length })}
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}


          {result && (
            <div className="grid gap-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="size-4" /> {t("csv.created")}:{" "}
                <strong>{result.created}</strong>
              </div>
              {typeof result.updated === "number" && (
                <div className="text-muted-foreground">
                  {t("csv.updated")}: {result.updated}
                </div>
              )}
              <div className="text-muted-foreground">
                {t("csv.skipped")}: {result.skipped}
              </div>
              {(result.errors.length > 0 || invalidCount > 0) && (
                <div className="mt-1 grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="size-4" /> {t("csv.errors")}:{" "}
                      {result.errors.length + invalidCount}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadErrorReport}
                      disabled={result.errors.length + invalidCount === 0}
                    >
                      <FileText className="me-2 size-4" /> {t("csv.downloadErrors")}
                    </Button>
                  </div>
                  {result.errors.length > 0 && (
                    <ul className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                      {result.errors.slice(0, 50).map((e, i) => (
                        <li key={i}>
                          #{e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close") ?? "Close"}
          </Button>
          <Button
            onClick={submit}
            disabled={!validRows.length || busy || !!result || !canImport}
          >
            {busy ? (
              <>
                <Loader2 className="me-2 size-4 animate-spin" />
                {t("csv.importing")}
              </>
            ) : validRows.length && rows.length ? (
              t("csv.confirmImport", { count: validRows.length })
            ) : (
              t("csv.import")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
