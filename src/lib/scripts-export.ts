import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function stringifyCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "✓" : "✗";
  return String(v);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 60) || "script";
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export type ExportInput = {
  scriptName: string;
  title?: string;
  columns: string[];
  rows: Record<string, unknown>[];
  summary?: Array<[string, unknown]>;
};

export function exportRowsToCsv({ scriptName, columns, rows, summary }: ExportInput) {
  const lines: string[] = [];
  if (summary && summary.length) {
    for (const [k, v] of summary) lines.push(`${csvEscape(k)},${csvEscape(stringifyCell(v))}`);
    lines.push("");
  }
  lines.push(columns.map(csvEscape).join(","));
  for (const r of rows) {
    lines.push(columns.map((c) => csvEscape(stringifyCell(r[c]))).join(","));
  }
  // BOM for Excel Arabic support
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  download(blob, `${safeName(scriptName)}-${timestamp()}.csv`);
}

export function exportRowsToPdf({ scriptName, title, columns, rows, summary }: ExportInput) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text(title || scriptName, 14, 14);
  doc.setFontSize(9);
  doc.text(`${scriptName} — ${new Date().toLocaleString()}`, 14, 20);

  let y = 26;
  if (summary && summary.length) {
    autoTable(doc, {
      startY: y,
      head: [["Field", "Value"]],
      body: summary.map(([k, v]) => [k, stringifyCell(v)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;
  }

  if (rows.length) {
    autoTable(doc, {
      startY: y,
      head: [columns],
      body: rows.map((r) => columns.map((c) => stringifyCell(r[c]))),
      styles: { fontSize: 7, overflow: "linebreak" },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  doc.save(`${safeName(scriptName)}-${timestamp()}.pdf`);
}
