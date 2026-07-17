import { t } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLog, type AuditLogRow } from "@/lib/audit-log.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/audit")({
  head: () => sectionHead({ section: "dashboard", entityAr: "سجل التدقيق", entityEn: "Audit Log", path: "/dashboard/audit" }),
  component: GlobalAuditPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{String(error?.message ?? error)}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">{t("common.notFound")}</div>
  ),
});

const ENTITY_OPTIONS = [
  { value: "auctions", label: "المزادات" },
  { value: "auction_bids", label: "مزايدات" },
  { value: "contracts", label: "العقود" },
  { value: "payments", label: "الدفعات" },
  { value: "invoices", label: "الفواتير" },
  { value: "expenses", label: "المصاريف" },
  { value: "maintenance_tickets", label: "الصيانة" },
  { value: "properties", label: "العقارات" },
  { value: "units", label: "الوحدات" },
  { value: "tenants", label: "المستأجرين" },
  { value: "owners", label: "الملاك" },
  { value: "documents", label: "المستندات" },
  { value: "tasks", label: "المهام" },
  { value: "leads", label: "العملاء المحتملون" },
  { value: "deals", label: "الصفقات" },
];

const ACTION_LABEL: Record<string, string> = {
  insert: "إنشاء",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  archive: "أرشفة",
  restore: "استعادة",
  publish: "نشر",
  cancel: "إلغاء",
  bid: "مزايدة",
  finalize: "إنهاء",
  win: "فوز",
};

function actionVariant(a: string): "default" | "secondary" | "destructive" | "outline" {
  if (a === "create" || a === "insert" || a === "restore") return "default";
  if (a === "delete" || a === "cancel" || a === "archive") return "destructive";
  if (a === "update") return "secondary";
  return "outline";
}

function GlobalAuditPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const list = useServerFn(listAuditLog);
  const [entity, setEntity] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [actor, setActor] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const q = useQuery({
    queryKey: ["global-audit", entity, action, actor, search, from, to, page],
    queryFn: () =>
      list({
        data: {
          entity: entity || undefined,
          action: action || undefined,
          actor: actor || undefined,
          search: search || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
          page,
          pageSize,
        },
      }),
  });

  const rows = q.data?.rows ?? [];

  async function fetchAllForExport(): Promise<AuditLogRow[]> {
    const MAX_ROWS = 5000;
    const EXPORT_PAGE_SIZE = 200;
    const filters = {
      entity: entity || undefined,
      action: action || undefined,
      actor: actor || undefined,
      search: search || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    };
    const all: AuditLogRow[] = [];
    let p = 1;
    while (all.length < MAX_ROWS) {
      const res = await list({ data: { ...filters, page: p, pageSize: EXPORT_PAGE_SIZE } });
      all.push(...res.rows);
      if (!res.hasMore) break;
      p += 1;
    }
    return all.slice(0, MAX_ROWS);
  }

  async function exportCSV() {
    try {
      setExporting("csv");
      const data = await fetchAllForExport();
      if (data.length === 0) {
        toast.info(isAr ? "لا توجد بيانات للتصدير" : "No data to export");
        return;
      }
      const rowsForCsv = data.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        entity: r.entity,
        entity_id: r.entity_id,
        action: r.action,
        actor: r.actor ?? "",
        diff: r.diff ? JSON.stringify(r.diff) : "",
      }));
      const csv = Papa.unparse(rowsForCsv);
      // BOM for Excel Arabic support
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        isAr ? `تم تصدير ${data.length} سجل إلى CSV` : `Exported ${data.length} rows to CSV`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isAr ? "فشل التصدير" : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  async function exportPDF() {
    try {
      setExporting("pdf");
      const data = await fetchAllForExport();
      if (data.length === 0) {
        toast.info(isAr ? "لا توجد بيانات للتصدير" : "No data to export");
        return;
      }
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("Audit Log Export", 14, 14);
      doc.setFontSize(9);
      const filterLine =
        [
          entity && `entity=${entity}`,
          action && `action=${action}`,
          actor && `actor=${actor.slice(0, 8)}`,
          from && `from=${from}`,
          to && `to=${to}`,
          search && `search=${search}`,
        ]
          .filter(Boolean)
          .join("  |  ") || "no filters";
      doc.text(`Filters: ${filterLine}`, 14, 20);
      doc.text(`Rows: ${data.length}  |  Generated: ${new Date().toISOString()}`, 14, 25);
      autoTable(doc, {
        startY: 30,
        styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
        headStyles: { fillColor: [37, 99, 235] },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 24 },
          2: { cellWidth: 20 },
          3: { cellWidth: 40 },
          4: { cellWidth: 24 },
          5: { cellWidth: 130 },
        },
        head: [["When", "Entity", "Action", "Entity ID", "Actor", "Diff"]],
        body: data.map((r) => [
          new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19),
          r.entity,
          r.action,
          r.entity_id,
          r.actor ?? "system",
          r.diff ? JSON.stringify(r.diff).slice(0, 400) : "",
        ]),
      });
      doc.save(`audit-log-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(
        isAr ? `تم تصدير ${data.length} سجل إلى PDF` : `Exported ${data.length} rows to PDF`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isAr ? "فشل التصدير" : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
          <ScrollText className="size-6 text-primary" />{" "}
          {isAr ? "سجل التدقيق العام" : "Global audit log"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAr
            ? "جميع الإجراءات المُسجّلة على جميع الوحدات ضمن صلاحيتك."
            : "Every recorded action across every module within your permissions."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isAr ? "الفلاتر" : "Filters"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <Label>{isAr ? "الكيان" : "Entity"}</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={entity}
                onChange={(e) => {
                  setEntity(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {ENTITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{isAr ? "الإجراء" : "Action"}</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{isAr ? "الكل" : "All"}</option>
                {Object.entries(ACTION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{isAr ? "الفاعل (UUID)" : "Actor (UUID)"}</Label>
              <Input
                dir="ltr"
                value={actor}
                onChange={(e) => {
                  setActor(e.target.value.trim());
                  setPage(1);
                }}
                placeholder={isAr ? "اختياري" : "Optional"}
              />
            </div>
            <div>
              <Label>{isAr ? "من تاريخ" : "From date"}</Label>
              <Input
                type="date"
                dir="ltr"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <Label>{isAr ? "إلى تاريخ" : "To date"}</Label>
              <Input
                type="date"
                dir="ltr"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <Label>{isAr ? "بحث JSON" : "JSON search"}</Label>
              <div className="relative">
                <Search className="absolute end-2 top-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pe-8"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder={isAr ? "نص داخل السجل" : "Text inside the entry"}
                />
                {search && (
                  <button
                    type="button"
                    className="absolute start-2 top-2.5"
                    onClick={() => setSearch("")}
                  >
                    <X className="size-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{isAr ? "النتائج" : "Results"}</CardTitle>
              <CardDescription>
                {q.data
                  ? isAr
                    ? `${q.data.total.toLocaleString("ar")} سجل — صفحة ${page}`
                    : `${q.data.total.toLocaleString("en")} entries — page ${page}`
                  : "…"}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={exportCSV}
                disabled={exporting !== null || (q.data?.total ?? 0) === 0}
                title="CSV"
                aria-label="تصدير جدول CSV"
              >
                {exporting === "csv" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileDown className="size-4" />
                )}
                <span className="ms-1 hidden sm:inline">جدول</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportPDF}
                disabled={exporting !== null || (q.data?.total ?? 0) === 0}
                title="PDF"
                aria-label="تصدير مستند PDF"
              >
                {exporting === "pdf" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}
                <span className="ms-1 hidden sm:inline">مستند</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label={isAr ? "الصفحة السابقة" : "Previous page"}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!q.data?.hasMore}
                onClick={() => setPage((p) => p + 1)}
                aria-label={isAr ? "الصفحة التالية" : "Next page"}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد نتائج" : "No results"}
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((r: AuditLogRow) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Badge variant={actionVariant(r.action)}>
                    {ACTION_LABEL[r.action] ?? r.action}
                  </Badge>
                  <span className="font-medium">
                    {ENTITY_OPTIONS.find((o) => o.value === r.entity)?.label ?? r.entity}
                  </span>
                  <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                    {r.entity_id.slice(0, 8)}…
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString(isAr ? "ar" : "en")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isAr ? "فاعل:" : "Actor:"}{" "}
                    <span dir="ltr" className="font-mono">
                      {r.actor ? r.actor.slice(0, 8) + "…" : isAr ? "نظام" : "system"}
                    </span>
                  </span>
                  <Button
                    asChild
                    variant="link"
                    size="sm"
                    className="ms-auto h-auto gap-1 p-0 text-xs"
                  >
                    <Link to="/dashboard/audit/$id" params={{ id: r.id }}>
                      <ExternalLink className="size-3" /> {isAr ? "التفاصيل" : "Details"}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
