import { useRef, useState } from "react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import { Upload, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    setResult(null);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => {
        const clean = (res.data || []).filter((r) =>
          Object.values(r).some((v) => v && String(v).trim() !== ""),
        );
        setRows(clean);
        if (!clean.length) toast.error(t("csv.emptyFile"));
      },
      error: (err) => toast.error(err.message),
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

  const submit = async () => {
    if (!validRows.length) return;
    setBusy(true);
    try {
      const r = await onImport(validRows);
      setResult(r);
      toast.success(t("csv.done", { created: r.created, skipped: r.skipped }));
      onDone?.();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
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
              accept=".csv,text/csv"
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
              {result.errors.length > 0 && (
                <div className="mt-1">
                  <div className="mb-1 flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="size-4" /> {t("csv.errors")}: {result.errors.length}
                  </div>
                  <ul className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                    {result.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        #{e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close") ?? "Close"}
          </Button>
          <Button onClick={submit} disabled={!rows.length || busy || !!result || !canImport}>
            {busy ? t("csv.importing") : t("csv.import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
