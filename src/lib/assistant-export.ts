import { jsPDF } from "jspdf";

export type AssistantMsg = { role: "user" | "assistant"; content: string };

function timestamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function csvEscape(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export function exportAssistantAsCsv(messages: AssistantMsg[]) {
  const header = "role,content,exported_at\n";
  const now = new Date().toISOString();
  const rows = messages.map((m) => `${m.role},${csvEscape(m.content)},${now}`).join("\n");
  const blob = new Blob(["\ufeff" + header + rows], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `assistant-report-${timestamp()}.csv`);
}

export function exportAssistantAsPdf(messages: AssistantMsg[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFontSize(16);
  doc.text("AQARY PRO — AI Assistant Report", margin, y);
  y += 20;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleString(), margin, y);
  doc.setTextColor(0);
  y += 20;

  for (const m of messages) {
    const label = m.role === "user" ? "User" : "Assistant";
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(`${label}:`, margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    // jsPDF built-in fonts don't render Arabic glyphs; preserve text as best-effort
    const lines = doc.splitTextToSize(m.content, maxWidth) as string[];
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 14;
    }
    y += 8;
  }

  doc.save(`assistant-report-${timestamp()}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
