import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type DTColumn<T> = {
  id: string;
  header: string;
  accessor: (row: T) => string | number | null | undefined;
  cell?: (row: T) => ReactNode;
  width?: number; // initial px
  align?: "start" | "end" | "center";
  sortable?: boolean; // default true
  filterable?: boolean; // default true (text contains)
  exportOnly?: boolean; // included in export, hidden in UI
};

export type BulkAction<T> = {
  id: string;
  label: string;
  icon?: typeof Download;
  variant?: "default" | "outline" | "destructive" | "secondary";
  onRun: (rows: T[]) => void | Promise<void>;
};

type Props<T> = {
  data: T[];
  columns: DTColumn<T>[];
  rowKey: (row: T) => string;
  isAr?: boolean;
  loading?: boolean;
  emptyLabel?: string;
  searchPlaceholder?: string;
  exportFileName?: string;
  bulkActions?: BulkAction<T>[];
  onRowClick?: (row: T) => void;
  maxHeight?: string; // e.g. "70vh"
  toolbarExtra?: ReactNode;
};

type SortState = { id: string; dir: "asc" | "desc" } | null;

function toText(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

export function EnterpriseDataTable<T>({
  data,
  columns,
  rowKey,
  isAr = false,
  loading = false,
  emptyLabel,
  searchPlaceholder,
  exportFileName = "export",
  bulkActions = [],
  onRowClick,
  maxHeight = "70vh",
  toolbarExtra,
}: Props<T>) {
  const visibleCols = useMemo(() => columns.filter((c) => !c.exportOnly), [columns]);
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(visibleCols.map((c) => [c.id, c.width ?? 160])),
  );
  const [sort, setSort] = useState<SortState>(null);
  const [globalQ, setGlobalQ] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rowsFiltered = useMemo(() => {
    const needle = globalQ.trim().toLowerCase();
    return data.filter((row) => {
      if (needle) {
        const hay = visibleCols
          .map((c) => toText(c.accessor(row)))
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      for (const [colId, val] of Object.entries(colFilters)) {
        if (!val) continue;
        const col = columns.find((c) => c.id === colId);
        if (!col) continue;
        const v = toText(col.accessor(row)).toLowerCase();
        if (!v.includes(val.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, globalQ, colFilters, visibleCols, columns]);

  const rowsSorted = useMemo(() => {
    if (!sort) return rowsFiltered;
    const col = columns.find((c) => c.id === sort.id);
    if (!col) return rowsFiltered;
    const arr = [...rowsFiltered];
    arr.sort((a, b) => {
      const av = col.accessor(a);
      const bv = col.accessor(b);
      const an = typeof av === "number" ? av : Number(av);
      const bn = typeof bv === "number" ? bv : Number(bv);
      const bothNum = !Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "";
      const cmp = bothNum ? an - bn : toText(av).localeCompare(toText(bv), isAr ? "ar" : "en");
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rowsFiltered, sort, columns, isAr]);

  const allChecked = rowsSorted.length > 0 && rowsSorted.every((r) => selected.has(rowKey(r)));
  const someChecked = !allChecked && rowsSorted.some((r) => selected.has(rowKey(r)));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) rowsSorted.forEach((r) => next.delete(rowKey(r)));
    else rowsSorted.forEach((r) => next.add(rowKey(r)));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectedRows = useMemo(
    () => data.filter((r) => selected.has(rowKey(r))),
    [data, selected, rowKey],
  );

  const cycleSort = (id: string) => {
    setSort((s) => {
      if (!s || s.id !== id) return { id, dir: "asc" };
      if (s.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  };

  const exportRows = () => (selectedRows.length > 0 ? selectedRows : rowsSorted);
  const exportMatrix = () => {
    const rows = exportRows();
    const cols = columns; // include exportOnly
    const header = cols.map((c) => c.header);
    const body = rows.map((r) => cols.map((c) => toText(c.accessor(r))));
    return { header, body };
  };

  const exportCSV = () => {
    const { header, body } = exportMatrix();
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv =
      "\uFEFF" + [header.map(esc).join(","), ...body.map((r) => r.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    // Emit Microsoft Excel 2003 XML Spreadsheet — opens natively in Excel,
    // no runtime dep, tiny bundle footprint.
    const { header, body } = exportMatrix();
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const cell = (v: string) => {
      const num = v !== "" && !Number.isNaN(Number(v));
      return num
        ? `<Cell><Data ss:Type="Number">${esc(v)}</Data></Cell>`
        : `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
    };
    const row = (cells: string[]) => `<Row>${cells.map(cell).join("")}</Row>`;
    const xml =
      `<?xml version="1.0"?>\n` +
      `<?mso-application progid="Excel.Sheet"?>\n` +
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
      `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
      `<Worksheet ss:Name="Data"><Table>` +
      row(header) +
      body.map(row).join("") +
      `</Table></Worksheet></Workbook>`;
    const blob = new Blob(["\uFEFF" + xml], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileName}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const { header, body } = exportMatrix();
    const [{ default: jsPDF }, autoTable] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable").then((m) => m.default),
    ]);
    const doc = new jsPDF({ orientation: "landscape", unit: "pt" });
    doc.setFontSize(14);
    doc.text(exportFileName, 40, 40);
    autoTable(doc, {
      head: [header],
      body,
      startY: 60,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [212, 175, 55], textColor: 20 },
    });
    doc.save(`${exportFileName}.pdf`);
  };

  // Column resize
  const resizingRef = useRef<{ id: string; startX: number; startW: number } | null>(null);
  const onResizeStart = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { id, startX: e.clientX, startW: widths[id] ?? 160 };
    const move = (ev: PointerEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = (ev.clientX - r.startX) * (isAr ? -1 : 1);
      const w = Math.max(80, r.startW + delta);
      setWidths((prev) => ({ ...prev, [r.id]: w }));
    };
    const up = () => {
      resizingRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const totalWidth = 44 + visibleCols.reduce((s, c) => s + (widths[c.id] ?? 160), 0);

  const emptyText = emptyLabel ?? (isAr ? "لا توجد سجلات" : "No records");
  const searchText = searchPlaceholder ?? (isAr ? "بحث…" : "Search…");

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Input
            value={globalQ}
            onChange={(e) => setGlobalQ(e.target.value)}
            placeholder={searchText}
            className="h-9"
          />
        </div>
        {toolbarExtra}
        {selected.size > 0 && (
          <>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              {selected.size} {isAr ? "محدّد" : "selected"}
            </span>
            {bulkActions.map((a) => {
              const Icon = a.icon;
              return (
                <Button
                  key={a.id}
                  size="sm"
                  variant={a.variant ?? "outline"}
                  onClick={() => a.onRun(selectedRows)}
                  className="h-9"
                >
                  {Icon ? <Icon className="me-1.5 size-4" /> : null}
                  {a.label}
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              className="h-9"
            >
              <X className="me-1 size-4" />
              {isAr ? "إلغاء" : "Clear"}
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-9 gap-1.5">
              <Download className="size-4" />
              {isAr ? "تصدير" : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {selected.size > 0
                ? isAr
                  ? `تصدير ${selected.size} صف`
                  : `Export ${selected.size} rows`
                : isAr
                  ? "تصدير الكل"
                  : "Export all"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={exportExcel}>
              <FileSpreadsheet className="me-2 size-4" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportPDF}>
              <FileText className="me-2 size-4" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportCSV}>
              <Download className="me-2 size-4" /> CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Scroll container with sticky header */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: totalWidth, tableLayout: "fixed" }}
        >
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
            <tr className="border-b border-border/60">
              <th style={{ width: 44 }} className="px-3 py-2.5 text-start">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              {visibleCols.map((c) => {
                const active = sort?.id === c.id;
                const filterVal = colFilters[c.id] ?? "";
                const w = widths[c.id] ?? 160;
                const align = c.align ?? "start";
                const alignCls =
                  align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start";
                return (
                  <th
                    key={c.id}
                    style={{ width: w, minWidth: w } as CSSProperties}
                    className={cn(
                      "relative select-none px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                      alignCls,
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1",
                        align === "end" && "justify-end",
                        align === "center" && "justify-center",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => (c.sortable !== false ? cycleSort(c.id) : undefined)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1 py-0.5",
                          c.sortable !== false && "hover:bg-muted",
                        )}
                      >
                        <span>{c.header}</span>
                        {c.sortable !== false &&
                          (active ? (
                            sort!.dir === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : (
                              <ArrowDown className="size-3" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" />
                          ))}
                      </button>
                      {c.filterable !== false && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "grid size-6 place-items-center rounded hover:bg-muted",
                                filterVal && "text-primary",
                              )}
                              aria-label="Filter"
                            >
                              <Filter className="size-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-56 space-y-2">
                            <div className="text-xs font-medium">
                              {isAr ? `تصفية ${c.header}` : `Filter ${c.header}`}
                            </div>
                            <Input
                              autoFocus
                              value={filterVal}
                              onChange={(e) =>
                                setColFilters((prev) => ({ ...prev, [c.id]: e.target.value }))
                              }
                              placeholder={isAr ? "يحتوي على…" : "contains…"}
                            />
                            {filterVal && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-full"
                                onClick={() =>
                                  setColFilters((prev) => {
                                    const n = { ...prev };
                                    delete n[c.id];
                                    return n;
                                  })
                                }
                              >
                                <X className="me-1 size-3" />
                                {isAr ? "مسح" : "Clear"}
                              </Button>
                            )}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    {/* Resize handle */}
                    <span
                      onPointerDown={(e) => onResizeStart(c.id, e)}
                      className={cn(
                        "absolute top-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none",
                        "opacity-0 hover:opacity-100",
                        "bg-primary/40",
                        isAr ? "start-0" : "end-0",
                      )}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={visibleCols.length + 1}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {isAr ? "جارٍ التحميل…" : "Loading…"}
                </td>
              </tr>
            ) : rowsSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleCols.length + 1}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rowsSorted.map((row) => {
                const id = rowKey(row);
                const checked = selected.has(id);
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-border/40 transition",
                      checked ? "bg-primary/5" : "hover:bg-muted/40",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleOne(id)}
                        aria-label="Select row"
                      />
                    </td>
                    {visibleCols.map((c) => {
                      const align = c.align ?? "start";
                      const alignCls =
                        align === "end"
                          ? "text-end"
                          : align === "center"
                            ? "text-center"
                            : "text-start";
                      return (
                        <td
                          key={c.id}
                          style={{ width: widths[c.id], minWidth: widths[c.id] }}
                          className={cn("truncate px-3 py-2.5 align-middle", alignCls)}
                        >
                          {c.cell ? c.cell(row) : toText(c.accessor(row))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {isAr
            ? `${rowsSorted.length} من ${data.length} سجل`
            : `${rowsSorted.length} of ${data.length} rows`}
        </span>
        {selected.size > 0 && (
          <span>{isAr ? `تم تحديد ${selected.size}` : `${selected.size} selected`}</span>
        )}
      </div>
    </div>
  );
}

export default EnterpriseDataTable;
