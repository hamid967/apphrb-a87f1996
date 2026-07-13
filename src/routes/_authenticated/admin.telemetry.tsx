import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  KeyRound,
  Timer,
  Download,
  X,
  Search,
  Columns3,
  ChevronDown,
  Percent,
  Users,
  Gauge,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import {
  listAdminEvents,
  getAdminEventStats,
  fetchAdminEventsBulk,
  fetchAdminEventsPage,
  countAdminEvents,
  type AdminEventExportRow,
} from "@/lib/admin-telemetry-read.functions";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { MotionAreaChart, MotionBarChart } from "@/components/charts/motion-tremor";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/telemetry")({
  head: () => sectionHead({ section: "admin", entityAr: "التليمتري", entityEn: "Telemetry", path: "/admin/telemetry" }),
  component: TelemetryPage,
});

const KIND_OPTIONS = [
  { value: "__all", ar: "الكل", en: "All" },
  { value: "nav", ar: "تنقّل", en: "Navigation" },
  { value: "render_error", ar: "خطأ عرض", en: "Render error" },
  { value: "window_error", ar: "خطأ JS", en: "Window error" },
  { value: "unhandled_rejection", ar: "Promise غير معالج", en: "Unhandled rejection" },
  { value: "route_error", ar: "خطأ مسار", en: "Route error" },
  { value: "aal2_bypass", ar: "تجاوز AAL2", en: "AAL2 bypass" },
];

const RANGE_OPTIONS = [
  { value: "1", ar: "آخر ساعة", en: "Last hour" },
  { value: "24", ar: "آخر 24 ساعة", en: "Last 24h" },
  { value: "72", ar: "آخر 3 أيام", en: "Last 3 days" },
  { value: "168", ar: "آخر أسبوع", en: "Last week" },
];

const SEVERITY_OPTIONS = [
  { value: "__all", ar: "كل الحالات", en: "Any severity" },
  { value: "error", ar: "خطأ", en: "Error" },
  { value: "warning", ar: "تحذير", en: "Warning" },
  { value: "info", ar: "معلومة", en: "Info" },
];

const STORAGE_KEY = "admin.telemetry.filters.v1";
const COLUMNS_KEY = "admin.telemetry.exportColumns.v1";

type ColumnKey =
  | "time"
  | "kind"
  | "event_type"
  | "path"
  | "message"
  | "duration_ms"
  | "actor_id"
  | "id"
  | "payload_json";

const COLUMN_DEFS: { key: ColumnKey; ar: string; en: string }[] = [
  { key: "time", ar: "الوقت", en: "Time" },
  { key: "kind", ar: "النوع", en: "Kind" },
  { key: "event_type", ar: "event_type", en: "event_type" },
  { key: "path", ar: "المسار", en: "Path" },
  { key: "message", ar: "الرسالة", en: "Message" },
  { key: "duration_ms", ar: "المدة (ms)", en: "Duration (ms)" },
  { key: "actor_id", ar: "معرّف الجهة", en: "Actor ID" },
  { key: "id", ar: "معرّف الحدث", en: "Event ID" },
  { key: "payload_json", ar: "الحمولة JSON", en: "Payload (JSON)" },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["time", "kind", "path", "message", "duration_ms", "actor_id"];

function loadColumns(): ColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  try {
    const raw = window.localStorage.getItem(COLUMNS_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw) as ColumnKey[];
    const valid = new Set(COLUMN_DEFS.map((c) => c.key));
    const filtered = parsed.filter((k) => valid.has(k));
    return filtered.length > 0 ? filtered : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

type ExportFormat = "csv" | "xlsx" | "json";

type SavedFilters = {
  kind: string;
  sinceHours: string;
  severity: string;
  actorId: string;
  search: string;
};

const DEFAULT_FILTERS: SavedFilters = {
  kind: "__all",
  sinceHours: "24",
  severity: "__all",
  actorId: "",
  search: "",
};

function loadFilters(): SavedFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<SavedFilters>;
    return { ...DEFAULT_FILTERS, ...parsed };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function TelemetryPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const initial = useMemo(() => loadFilters(), []);
  const [kind, setKind] = useState<string>(initial.kind);
  const [sinceHours, setSinceHours] = useState<string>(initial.sinceHours);
  const [severity, setSeverity] = useState<string>(initial.severity);
  const [actorId, setActorId] = useState<string>(initial.actorId);
  const [search, setSearch] = useState<string>(initial.search);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(initial.search);
  const [debouncedActor, setDebouncedActor] = useState<string>(initial.actorId);

  // Persist filters
  useEffect(() => {
    if (typeof window === "undefined") return;
    const snap: SavedFilters = { kind, sinceHours, severity, actorId, search };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch {
      /* noop */
    }
  }, [kind, sinceHours, severity, actorId, search]);

  // Debounce free-text inputs so we don't spam the server on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedActor(actorId.trim()), 300);
    return () => clearTimeout(t);
  }, [actorId]);

  const list = useServerFn(listAdminEvents);
  const stats = useServerFn(getAdminEventStats);
  const bulkFn = useServerFn(fetchAdminEventsBulk);
  const pageFn = useServerFn(fetchAdminEventsPage);
  const countFn = useServerFn(countAdminEvents);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{
    open: boolean;
    format: ExportFormat | null;
    fetched: number;
    total: number;
    page: number;
    phase: "idle" | "counting" | "fetching" | "formatting" | "done" | "error" | "cancelled";
    errors: { page: number; attempt: number; message: string; at: string }[];
  }>({ open: false, format: null, fetched: 0, total: 0, page: 0, phase: "idle", errors: [] });
  const cancelRef = useMemo(() => ({ current: false }), []);
  const [columns, setColumns] = useState<ColumnKey[]>(() => loadColumns());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns));
    } catch {
      /* noop */
    }
  }, [columns]);

  const toggleColumn = (key: ColumnKey) => {
    setColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const hours = Number(sinceHours) || 24;
  const sev = severity === "__all" ? null : severity;

  const eventsQ = useQuery({
    queryKey: ["admin", "telemetry", "events", kind, hours, sev, debouncedActor, debouncedSearch],
    queryFn: () =>
      list({
        data: {
          kind: kind === "__all" ? null : kind,
          sinceHours: hours,
          severity: sev,
          actorId: debouncedActor || null,
          search: debouncedSearch || null,
          limit: 200,
        },
      }),
  });
  const statsQ = useQuery({
    queryKey: ["admin", "telemetry", "stats", hours],
    queryFn: () => stats({ data: { sinceHours: hours } }),
    refetchInterval: 60_000,
  });

  const kindLabel = useMemo(() => {
    const map = new Map(KIND_OPTIONS.map((k) => [k.value, isAr ? k.ar : k.en]));
    return (v: string) => map.get(v) ?? v;
  }, [isAr]);

  const rangeLabel = useMemo(() => {
    const r = RANGE_OPTIONS.find((o) => o.value === sinceHours);
    return r ? (isAr ? r.ar : r.en) : `${hours}h`;
  }, [sinceHours, hours, isAr]);

  const activeFilterCount =
    (kind !== "__all" ? 1 : 0) +
    (severity !== "__all" ? 1 : 0) +
    (actorId.trim() ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const resetFilters = () => {
    setKind(DEFAULT_FILTERS.kind);
    setSinceHours(DEFAULT_FILTERS.sinceHours);
    setSeverity(DEFAULT_FILTERS.severity);
    setActorId(DEFAULT_FILTERS.actorId);
    setSearch(DEFAULT_FILTERS.search);
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const buildFilename = (ext: string) => {
    const kindSlug = kind === "__all" ? "all" : kind;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return `admin-events_${kindSlug}_${hours}h_${stamp}.${ext}`;
  };

  const projectRow = (r: AdminEventExportRow, cols: ColumnKey[]) => {
    const o: Record<string, unknown> = {};
    for (const c of cols) o[c] = r[c];
    return o;
  };

  const csvEscape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  };

  const exportAs = async (format: ExportFormat) => {
    if (columns.length === 0) {
      toast.error(isAr ? "اختر عمودًا واحدًا على الأقل" : "Select at least one column");
      return;
    }
    setExporting(true);
    cancelRef.current = false;
    const HARD_CAP = 50_000;
    const PAGE = 1000;
    const MAX_ATTEMPTS = 3;
    const filters = {
      kind: kind === "__all" ? null : kind,
      sinceHours: hours,
      severity: sev,
      actorId: debouncedActor || null,
      search: debouncedSearch || null,
    };
    setProgress({
      open: true,
      format,
      fetched: 0,
      total: 0,
      page: 0,
      phase: "counting",
      errors: [],
    });
    try {
      // 1. Count for progress denominator (search filter applied in-process,
      // so counts may over-estimate when a search term is used).
      const { count } = await countFn({ data: filters });
      const cappedTotal = Math.min(count, HARD_CAP);
      setProgress((s) => ({ ...s, total: cappedTotal, phase: "fetching" }));

      // 2. Page through with per-page retry.
      const all: AdminEventExportRow[] = [];
      let offset = 0;
      let pageIdx = 0;
      let truncated = false;
      while (offset < HARD_CAP) {
        if (cancelRef.current) {
          setProgress((s) => ({ ...s, phase: "cancelled" }));
          setExporting(false);
          return;
        }
        pageIdx += 1;
        let attempt = 0;
        let res: Awaited<ReturnType<typeof pageFn>> | null = null;
        // Retry with exponential backoff on transient failures.
        while (attempt < MAX_ATTEMPTS) {
          attempt += 1;
          try {
            res = await pageFn({ data: { ...filters, offset, limit: PAGE } });
            break;
          } catch (err) {
            const message = (err as Error).message || "unknown error";
            setProgress((s) => ({
              ...s,
              errors: [
                ...s.errors,
                { page: pageIdx, attempt, message, at: new Date().toISOString() },
              ],
            }));
            if (attempt >= MAX_ATTEMPTS) throw err;
            const backoff = 400 * Math.pow(2, attempt - 1); // 400, 800, 1600ms
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
        if (!res) throw new Error("no response");
        all.push(...res.rows);
        offset += PAGE;
        setProgress((s) => ({
          ...s,
          fetched: all.length,
          page: pageIdx,
          total: Math.max(s.total, all.length),
        }));
        if (!res.hasMore) break;
        if (all.length >= HARD_CAP) {
          truncated = true;
          break;
        }
      }

      // 3. Format + download.
      setProgress((s) => ({ ...s, phase: "formatting" }));
      const headers = columns.map((c) => COLUMN_DEFS.find((d) => d.key === c)?.en ?? c);
      if (format === "csv") {
        const lines = [columns.map((c) => csvEscape(c)).join(",")];
        for (const r of all) lines.push(columns.map((c) => csvEscape(r[c])).join(","));
        triggerDownload(
          new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
          buildFilename("csv"),
        );
      } else if (format === "json") {
        const projected = all.map((r) => projectRow(r, columns));
        triggerDownload(
          new Blob([JSON.stringify(projected, null, 2)], {
            type: "application/json;charset=utf-8",
          }),
          buildFilename("json"),
        );
      } else {
        const aoa: unknown[][] = [headers];
        for (const r of all) aoa.push(columns.map((c) => r[c] ?? ""));
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "admin_events");
        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        triggerDownload(
          new Blob([buf], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          buildFilename("xlsx"),
        );
      }

      setProgress((s) => ({ ...s, phase: "done", fetched: all.length }));
      toast.success(
        isAr
          ? `تم تصدير ${all.length} حدث بصيغة ${format.toUpperCase()}${truncated ? " (تم بلوغ الحد الأقصى)" : ""}`
          : `Exported ${all.length} events as ${format.toUpperCase()}${truncated ? " (hard cap reached)" : ""}`,
      );
    } catch (e) {
      setProgress((s) => ({ ...s, phase: "error" }));
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        icon={Activity}
        ar="التليمتري"
        en="Telemetry"
        descriptionAr="أحدث أحداث لوحة الإدارة (تنقّل، أخطاء، تجاوزات AAL2)."
        descriptionEn="Recent /admin/* events — navigation, errors, and AAL2 bypasses."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={sinceHours} onValueChange={setSinceHours}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {isAr ? r.ar : r.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {isAr ? k.ar : k.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {isAr ? s.ar : s.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              placeholder={isAr ? "معرّف المستخدم (UUID)" : "Actor user ID (UUID)"}
              className="h-9 w-[220px] font-mono text-xs"
            />
            <div className="relative">
              <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAr ? "بحث في المسار/الرسالة" : "Search path or message"}
                className="h-9 w-[220px] ps-7"
              />
            </div>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                title={isAr ? "مسح كل الفلاتر" : "Clear all filters"}
              >
                <X className="me-1 size-4" />
                {isAr ? `مسح (${activeFilterCount})` : `Clear (${activeFilterCount})`}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void eventsQ.refetch();
                void statsQ.refetch();
              }}
              disabled={eventsQ.isFetching || statsQ.isFetching}
            >
              {isAr ? "تحديث" : "Refresh"}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  title={isAr ? "اختيار الأعمدة للتصدير" : "Choose export columns"}
                >
                  <Columns3 className="me-2 size-4" />
                  {isAr ? `الأعمدة (${columns.length})` : `Columns (${columns.length})`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-1 p-2" align="end">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  {isAr ? "أعمدة التصدير" : "Export columns"}
                </div>
                {COLUMN_DEFS.map((c) => {
                  const checked = columns.includes(c.key);
                  const id = `col-${c.key}`;
                  return (
                    <label
                      key={c.key}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={() => toggleColumn(c.key)}
                      />
                      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                        {isAr ? c.ar : c.en}
                      </Label>
                    </label>
                  );
                })}
                <div className="flex justify-between border-t pt-2 mt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setColumns(DEFAULT_COLUMNS)}
                  >
                    {isAr ? "الافتراضي" : "Default"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setColumns(COLUMN_DEFS.map((c) => c.key))}
                  >
                    {isAr ? "الكل" : "All"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  disabled={exporting || (statsQ.data?.total ?? 0) === 0 || columns.length === 0}
                  title={
                    isAr
                      ? `تصدير من قاعدة البيانات (${kindLabel(kind === "__all" ? "__all" : kind)} • ${rangeLabel})`
                      : `Direct DB export (${kindLabel(kind === "__all" ? "__all" : kind)} • ${rangeLabel})`
                  }
                >
                  <Download className="me-2 size-4" />
                  {exporting ? (isAr ? "جاري التصدير…" : "Exporting…") : isAr ? "تصدير" : "Export"}
                  <ChevronDown className="ms-2 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    void exportAs("csv");
                  }}
                >
                  CSV (.csv)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void exportAs("xlsx");
                  }}
                >
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void exportAs("json");
                  }}
                >
                  JSON (.json)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Activity}
          label={isAr ? "إجمالي الأحداث" : "Total events"}
          value={statsQ.data?.total ?? "—"}
        />
        <KpiCard
          icon={AlertTriangle}
          label={isAr ? "الأخطاء" : "Errors"}
          value={statsQ.data?.errors ?? "—"}
          tone={statsQ.data && statsQ.data.errors > 0 ? "destructive" : "default"}
        />
        <KpiCard
          icon={KeyRound}
          label={isAr ? "تجاوز AAL2" : "AAL2 bypasses"}
          value={statsQ.data?.bypasses ?? "—"}
          tone={statsQ.data && statsQ.data.bypasses > 0 ? "warning" : "default"}
        />
        <KpiCard
          icon={Timer}
          label={isAr ? "متوسط زمن التنقّل" : "Avg nav duration"}
          value={statsQ.data?.avgNavDurationMs != null ? `${statsQ.data.avgNavDurationMs} ms` : "—"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Percent}
          label={isAr ? "نسبة الأخطاء" : "Error rate"}
          value={statsQ.data ? `${statsQ.data.errorRatePct}%` : "—"}
          tone={statsQ.data && statsQ.data.errorRatePct >= 5 ? "destructive" : "default"}
        />
        <KpiCard
          icon={Gauge}
          label={isAr ? "p95 زمن التنقّل" : "p95 nav duration"}
          value={statsQ.data?.p95NavDurationMs != null ? `${statsQ.data.p95NavDurationMs} ms` : "—"}
          tone={
            statsQ.data &&
            statsQ.data.p95NavDurationMs != null &&
            statsQ.data.p95NavDurationMs > 1500
              ? "warning"
              : "default"
          }
        />
        <KpiCard
          icon={Users}
          label={isAr ? "مستخدمون فرديون" : "Unique actors"}
          value={statsQ.data?.uniqueActors ?? "—"}
        />
        <KpiCard
          icon={AlertTriangle}
          label={isAr ? "أعلى تركيز أخطاء" : "Peak error slot"}
          value={statsQ.data ? peakSlotLabel(statsQ.data.heatmapErrors, isAr) : "—"}
          tone={statsQ.data && statsQ.data.errors > 0 ? "destructive" : "default"}
        />
      </div>

      <SummaryPanel isAr={isAr} data={statsQ.data} kindLabel={kindLabel} />

      <HeatmapCard isAr={isAr} data={statsQ.data} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {isAr ? "أحدث الأحداث" : "Recent events"} ({eventsQ.data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {eventsQ.isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {isAr ? "جاري التحميل…" : "Loading…"}
            </div>
          )}
          {eventsQ.isError && (
            <div className="py-8 text-center text-sm text-destructive">
              {(eventsQ.error as Error).message}
            </div>
          )}
          {eventsQ.data && eventsQ.data.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {isAr ? "لا توجد أحداث في هذا النطاق." : "No events in this range."}
            </div>
          )}
          {eventsQ.data && eventsQ.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">{isAr ? "الوقت" : "Time"}</TableHead>
                  <TableHead className="w-[140px]">{isAr ? "النوع" : "Kind"}</TableHead>
                  <TableHead>{isAr ? "المسار" : "Path"}</TableHead>
                  <TableHead>{isAr ? "الرسالة" : "Message"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsQ.data.map((r) => {
                  const k = r.event_type.replace(/^admin\./, "");
                  const p = (r.payload ?? {}) as {
                    path?: string;
                    message?: string;
                    duration_ms?: number;
                  };
                  const isErr = k.endsWith("_error") || k === "unhandled_rejection";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString(isAr ? "ar-SA" : "en-US")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            isErr ? "destructive" : k === "aal2_bypass" ? "outline" : "secondary"
                          }
                        >
                          {kindLabel(k)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate font-mono text-xs">
                        {p.path ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[420px] text-xs">
                        {p.message ?? (k === "nav" && p.duration_ms ? `${p.duration_ms} ms` : "—")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ExportProgressDialog
        isAr={isAr}
        state={progress}
        onOpenChange={(open) => setProgress((s) => ({ ...s, open }))}
        onCancel={() => {
          cancelRef.current = true;
        }}
        exporting={exporting}
      />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  tone?: "default" | "destructive" | "warning";
}) {
  const toneCls =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning dark:text-warning"
        : "text-primary";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`grid size-9 place-items-center rounded-md bg-muted ${toneCls}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

type StatsData = {
  total: number;
  errors: number;
  bypasses: number;
  avgNavDurationMs: number | null;
  p95NavDurationMs: number | null;
  errorRatePct: number;
  uniqueActors: number;
  heatmap: number[][];
  heatmapErrors: number[][];
  byKind: Record<string, number>;
  timeSeries: { bucket: string; total: number; errors: number; nav: number; bypass: number }[];
  bucket: "hour" | "day";
  topKinds: { kind: string; count: number }[];
  topPaths: { path: string; count: number }[];
  topActors: { actor_id: string; count: number }[];
};

const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function peakSlotLabel(matrix: number[][], isAr: boolean): string {
  let best = 0;
  let bestDay = -1;
  let bestHour = -1;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = matrix[d]?.[h] ?? 0;
      if (v > best) {
        best = v;
        bestDay = d;
        bestHour = h;
      }
    }
  }
  if (best === 0 || bestDay < 0) return isAr ? "لا شيء" : "None";
  const day = (isAr ? DAYS_AR : DAYS_EN)[bestDay];
  const hh = String(bestHour).padStart(2, "0");
  return `${day} · ${hh}:00 (${best})`;
}

function HeatmapCard({ isAr, data }: { isAr: boolean; data: StatsData | undefined }) {
  if (!data) return null;
  const max = Math.max(1, ...data.heatmap.flat());
  const maxErr = Math.max(1, ...data.heatmapErrors.flat());
  const [mode, setMode] = useState<"total" | "errors">("total");
  const matrix = mode === "errors" ? data.heatmapErrors : data.heatmap;
  const denom = mode === "errors" ? maxErr : max;
  const days = isAr ? DAYS_AR : DAYS_EN;
  const nothing = matrix.flat().every((v) => v === 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">
          {isAr ? "خريطة حرارية للأحداث (يوم × ساعة)" : "Event heatmap (day × hour)"}
        </CardTitle>
        <div className="flex gap-1">
          <Button
            variant={mode === "total" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("total")}
          >
            {isAr ? "الإجمالي" : "Total"}
          </Button>
          <Button
            variant={mode === "errors" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("errors")}
          >
            {isAr ? "الأخطاء" : "Errors"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {nothing ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {isAr ? "لا توجد بيانات كافية" : "Not enough data"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-[2px]">
              <thead>
                <tr>
                  <th className="w-10" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="text-[9px] font-normal text-muted-foreground">
                      {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((dayLabel, d) => (
                  <tr key={dayLabel}>
                    <td className="pe-2 text-[10px] text-muted-foreground">{dayLabel}</td>
                    {Array.from({ length: 24 }, (_, h) => {
                      const v = matrix[d]?.[h] ?? 0;
                      const intensity = v === 0 ? 0 : 0.15 + 0.85 * (v / denom);
                      const bg =
                        mode === "errors"
                          ? `hsl(var(--destructive) / ${intensity})`
                          : `hsl(var(--primary) / ${intensity})`;
                      return (
                        <td
                          key={h}
                          title={`${dayLabel} ${String(h).padStart(2, "0")}:00 · ${v}`}
                          className="h-5 rounded-sm border border-border/40"
                          style={{ background: v === 0 ? "hsl(var(--muted) / 0.4)" : bg }}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryPanel({
  isAr,
  data,
  kindLabel,
}: {
  isAr: boolean;
  data: StatsData | undefined;
  kindLabel: (v: string) => string;
}) {
  if (!data) return null;
  const fmtBucket = (iso: string) => {
    const d = new Date(iso);
    return data.bucket === "hour"
      ? d.toLocaleTimeString(isAr ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(isAr ? "ar-SA" : "en-US", { month: "short", day: "numeric" });
  };
  const series = data.timeSeries.map((r) => ({ ...r, label: fmtBucket(r.bucket) }));
  const kinds = data.topKinds.map((k) => ({ ...k, label: kindLabel(k.kind) }));
  const maxPath = Math.max(1, ...data.topPaths.map((p) => p.count));

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {isAr
              ? data.bucket === "hour"
                ? "الأحداث حسب الساعة"
                : "الأحداث حسب اليوم"
              : data.bucket === "hour"
                ? "Events by hour"
                : "Events by day"}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] pt-0">
          {series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {isAr ? "لا توجد بيانات" : "No data"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gErr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name={isAr ? "الإجمالي" : "Total"}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#gTotal)"
                />
                <Area
                  type="monotone"
                  dataKey="errors"
                  name={isAr ? "أخطاء" : "Errors"}
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  fill="url(#gErr)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {isAr ? "أكثر الأنواع تكرارًا" : "Top event kinds"}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[240px] pt-0">
          {kinds.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {isAr ? "لا توجد بيانات" : "No data"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={kinds}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                <XAxis
                  type="number"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  fontSize={11}
                  width={90}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {isAr ? "أكثر المسارات نشاطًا" : "Most active paths"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {data.topPaths.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {isAr ? "لا توجد بيانات" : "No data"}
            </div>
          ) : (
            data.topPaths.map((p) => (
              <div key={p.path} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-mono">{p.path}</span>
                  <span className="tabular-nums text-muted-foreground">{p.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(p.count / maxPath) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{isAr ? "أكثر الجهات الفاعلة" : "Top actors"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {data.topActors.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {isAr ? "لا توجد بيانات" : "No data"}
            </div>
          ) : (
            data.topActors.map((a) => (
              <div key={a.actor_id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono">
                  {a.actor_id.slice(0, 8)}…{a.actor_id.slice(-4)}
                </span>
                <Badge variant="secondary" className="tabular-nums">
                  {a.count}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type ExportProgressState = {
  open: boolean;
  format: ExportFormat | null;
  fetched: number;
  total: number;
  page: number;
  phase: "idle" | "counting" | "fetching" | "formatting" | "done" | "error" | "cancelled";
  errors: { page: number; attempt: number; message: string; at: string }[];
};

function ExportProgressDialog({
  isAr,
  state,
  onOpenChange,
  onCancel,
  exporting,
}: {
  isAr: boolean;
  state: ExportProgressState;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  exporting: boolean;
}) {
  const pct =
    state.total > 0
      ? Math.min(100, Math.round((state.fetched / state.total) * 100))
      : state.phase === "done"
        ? 100
        : 0;
  const phaseLabel: Record<ExportProgressState["phase"], { ar: string; en: string }> = {
    idle: { ar: "في الانتظار", en: "Idle" },
    counting: { ar: "احتساب الإجمالي…", en: "Counting rows…" },
    fetching: { ar: "جاري الجلب…", en: "Fetching…" },
    formatting: { ar: "تجهيز الملف…", en: "Formatting file…" },
    done: { ar: "اكتمل التصدير", en: "Export complete" },
    error: { ar: "فشل التصدير", en: "Export failed" },
    cancelled: { ar: "تم الإلغاء", en: "Cancelled" },
  };
  const canClose = !exporting;
  return (
    <Dialog
      open={state.open}
      onOpenChange={(o) => {
        if (!o && !canClose) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Download className="size-4" />
            {isAr ? "تصدير البيانات" : "Data export"}
            {state.format && (
              <Badge variant="secondary" className="text-[10px] uppercase">
                {state.format}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isAr ? phaseLabel[state.phase].ar : phaseLabel[state.phase].en}</span>
            <span className="tabular-nums">
              {state.fetched.toLocaleString(isAr ? "ar-SA" : "en-US")}
              {state.total > 0 ? ` / ${state.total.toLocaleString(isAr ? "ar-SA" : "en-US")}` : ""}
              {" · "}
              {pct}%
            </span>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="text-[11px] text-muted-foreground">
            {isAr
              ? `الصفحة ${state.page.toLocaleString("ar-SA")} · حجم الصفحة 1000 · حد أقصى 50,000`
              : `Page ${state.page.toLocaleString("en-US")} · page size 1000 · hard cap 50,000`}
          </div>

          {state.errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5">
              <div className="flex items-center justify-between border-b border-destructive/30 px-3 py-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <AlertTriangle className="size-3.5" />
                  {isAr
                    ? `سجل الأخطاء (${state.errors.length})`
                    : `Error log (${state.errors.length})`}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {isAr ? "إعادة محاولة تلقائية × 3" : "auto-retry × 3"}
                </span>
              </div>
              <ul className="max-h-32 space-y-1 overflow-y-auto p-2 text-[11px]">
                {state.errors.slice(-20).map((e, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 font-mono">
                    <span className="text-muted-foreground">
                      {new Date(e.at).toLocaleTimeString(isAr ? "ar-SA" : "en-US")}
                    </span>
                    <span className="text-muted-foreground">
                      p{e.page}·#{e.attempt}
                    </span>
                    <span className="flex-1 truncate text-destructive" title={e.message}>
                      {e.message}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {exporting ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="me-1 size-4" />
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant={state.phase === "error" ? "destructive" : "outline"}
            size="sm"
            disabled={exporting}
            onClick={() => onOpenChange(false)}
          >
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
