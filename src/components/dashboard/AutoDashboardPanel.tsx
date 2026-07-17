import { t } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { recommendDashboard, runDashboardTool } from "@/lib/ai-assistant.functions";
import { getMyDashboardLayout, saveAutoDashboardLayout } from "@/lib/dashboard-layout.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Sparkles,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  GripVertical,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { useCanCreate } from "@/hooks/use-can-create";
import { UpgradeDialog } from "@/components/billing/upgrade-dialog";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "motion/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type Widget = {
  id: string;
  title: string;
  tool: string;
  args: Record<string, unknown>;
  displayField: string;
  size: "sm" | "md" | "lg";
  visible: boolean;
};

const STORAGE_KEY = "hbspro:auto-dashboard:v1";

function loadLocal(): Widget[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Widget[]) : null;
  } catch {
    return null;
  }
}

function saveLocal(widgets: Widget[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
}

function pickMetric(result: unknown, field: string): { label: string; value: string } {
  if (result == null || typeof result !== "object") {
    return { label: "قيمة", value: String(result ?? "—") };
  }
  const obj = result as Record<string, unknown>;
  const candidates = field
    ? [field]
    : ["total_paid", "total_overdue", "total", "occupancy_pct", "count", "monthly_projected"];
  for (const k of candidates) {
    if (k in obj && (typeof obj[k] === "number" || typeof obj[k] === "string")) {
      return { label: k, value: String(obj[k]) };
    }
  }
  const firstNumeric = Object.entries(obj).find(([, v]) => typeof v === "number");
  if (firstNumeric) return { label: firstNumeric[0], value: String(firstNumeric[1]) };
  return { label: "—", value: "—" };
}

function useWidgetMetric(widget: Widget) {
  const run = useServerFn(runDashboardTool);
  const q = useQuery({
    queryKey: ["dash-tool", widget.tool, widget.args],
    queryFn: () => run({ data: { name: widget.tool as any, args: widget.args } }),
    enabled: widget.visible,
    staleTime: 60_000,
  });
  const metric = q.data ? pickMetric((q.data as any).result, widget.displayField) : null;
  return { q, metric };
}

function spanClass(size: Widget["size"]) {
  return size === "lg" ? "md:col-span-3" : size === "md" ? "md:col-span-2" : "md:col-span-1";
}

function cycleSize(s: Widget["size"], dir: 1 | -1): Widget["size"] {
  const order: Widget["size"][] = ["sm", "md", "lg"];
  const i = order.indexOf(s);
  const j = Math.max(0, Math.min(order.length - 1, i + dir));
  return order[j];
}

function WidgetThumbnail({ widget }: { widget: Widget }) {
  const { metric } = useWidgetMetric(widget);
  return (
    <div className="pointer-events-none w-64 rotate-2 rounded-lg border bg-card/95 p-3 shadow-2xl ring-1 ring-primary/40 backdrop-blur">
      <div className="mb-1 flex items-center gap-2">
        <GripVertical className="h-3.5 w-3.5 text-primary" />
        <div className="truncate text-xs font-semibold">{widget.title}</div>
      </div>
      <div className="text-xl font-bold tabular-nums">{metric?.value ?? "…"}</div>
      <div className="truncate text-[10px] text-muted-foreground">
        {metric?.label ?? widget.tool}
      </div>
    </div>
  );
}

function WidgetCard({
  widget,
  onChange,
  onRemove,
  onToggle,
}: {
  widget: Widget;
  onChange: (w: Widget) => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const { q, metric } = useWidgetMetric(widget);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={`${spanClass(widget.size)} ${isDragging ? "z-10" : ""}`}
    >
      <Card
        className={`group h-full transition-all hover:shadow-lg hover:ring-1 hover:ring-primary/30 ${widget.visible ? "" : "opacity-60"}`}
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="flex h-8 shrink-0 cursor-grab items-center rounded px-1 text-muted-foreground opacity-40 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 active:cursor-grabbing"
            title="اسحب لإعادة الترتيب"
            aria-label="مقبض السحب"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Input
            value={widget.title}
            onChange={(e) => onChange({ ...widget, title: e.target.value })}
            className="h-8 text-sm font-semibold"
            dir="rtl"
          />
          <div className="flex shrink-0 gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={onToggle}
              title="إظهار/إخفاء"
              className="transition-transform hover:scale-110 active:scale-95"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={widget.visible ? "on" : "off"}
                  initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                  className="inline-flex"
                >
                  {widget.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </motion.span>
              </AnimatePresence>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onChange({ ...widget, size: cycleSize(widget.size, -1) })}
              title="تصغير"
              disabled={widget.size === "sm"}
              className="transition-transform hover:scale-110 active:scale-95"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onChange({ ...widget, size: cycleSize(widget.size, 1) })}
              title="تكبير"
              disabled={widget.size === "lg"}
              className="transition-transform hover:scale-110 active:scale-95"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onRemove}
              title="حذف"
              className="transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2" dir="rtl">
          <div className="text-xs text-muted-foreground">
            الأداة: <span className="font-mono">{widget.tool}</span>
          </div>
          {q.isLoading && <div className="text-sm text-muted-foreground">{t("common.loading")}</div>}
          {q.error && <div className="text-sm text-destructive">{(q.error as Error).message}</div>}
          <AnimatePresence mode="wait">
            {metric && (
              <motion.div
                key={String(metric.value)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div className="text-2xl font-bold tabular-nums">{metric.value}</div>
                <div className="text-xs text-muted-foreground">{metric.label}</div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-1 pt-1">
            <Input
              placeholder="displayField (اختياري)"
              value={widget.displayField}
              onChange={(e) => onChange({ ...widget, displayField: e.target.value })}
              className="h-7 text-xs"
            />
            <select
              value={widget.size}
              onChange={(e) => onChange({ ...widget, size: e.target.value as Widget["size"] })}
              className="h-7 rounded border bg-background px-1 text-xs"
            >
              <option value="sm">صغير</option>
              <option value="md">متوسط</option>
              <option value="lg">كبير</option>
            </select>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function AutoDashboardPanel({ showHeader = true }: { showHeader?: boolean }) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const qc = useQueryClient();
  const recommend = useServerFn(recommendDashboard);
  const loadLayout = useServerFn(getMyDashboardLayout);
  const saveLayout = useServerFn(saveAutoDashboardLayout);

  // Plan gate: derive per-plan widget cap from the current package
  const plan = useCanCreate("widget");
  const cap = plan.max; // null = unlimited
  const visibleCount = widgets.filter((w) => w.visible).length;
  const overCap = cap != null && visibleCount > cap;
  const atCap = cap != null && visibleCount >= cap;

  // Load server layout on mount; fall back to legacy localStorage on first load.
  const layoutQ = useQuery({
    queryKey: ["my-dashboard-layout"],
    queryFn: () => loadLayout(),
    staleTime: 5 * 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (w: Widget[]) => saveLayout({ data: { widgets: w } }),
    onError: (e: any) => toast.error(e?.message ?? "فشل الحفظ"),
  });

  useEffect(() => {
    if (layoutQ.isLoading) return;
    const server = layoutQ.data?.auto?.widgets;
    if (server && server.length) {
      setWidgets(server as Widget[]);
      return;
    }
    // First-time: migrate legacy localStorage layout to the server.
    const legacy = loadLocal();
    if (legacy && legacy.length) {
      setWidgets(legacy);
      saveMut.mutate(legacy);
    }
  }, [layoutQ.isLoading, layoutQ.data]);

  const mut = useMutation({
    mutationFn: () => recommend(),
    onSuccess: (d: any) => {
      let w = (d?.widgets ?? []) as Widget[];
      if (!w.length) {
        toast.warning("لم يقترح النموذج أي widgets");
        return;
      }
      // Enforce plan cap: keep first `cap` visible, hide the rest instead of dropping them.
      if (cap != null && w.length > cap) {
        w = w.map((x, i) => (i < cap ? { ...x, visible: true } : { ...x, visible: false }));
        toast.warning(
          `الاقتراح يحتوي ${w.length} عناصر، وباقتك تسمح بـ ${cap} فقط — تم إخفاء الزائد. قم بالترقية لعرض المزيد.`,
        );
      }
      setWidgets(w);
      saveLocal(w);
      saveMut.mutate(w);
      toast.success(`تم اقتراح ${w.length} widgets`);
    },
    onError: (e: any) => toast.error(e?.message ?? "فشل الاقتراح"),
  });

  const requestGenerate = () => {
    // Block up-front only when already at cap AND no visible slots would open.
    if (plan.isLoading) return;
    mut.mutate();
  };

  const update = (next: Widget[]) => {
    setWidgets(next);
    saveLocal(next);
    saveMut.mutate(next);
  };
  const grid = useMemo(() => widgets, [widgets]);

  // Drag & drop
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeWidget = activeId ? (widgets.find((w) => w.id === activeId) ?? null) : null;

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = widgets.findIndex((w) => w.id === active.id);
    const newIdx = widgets.findIndex((w) => w.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    update(arrayMove(widgets, oldIdx, newIdx));
  };

  return (
    <div data-testid="kpi-auto-panel" className="space-y-4" dir="rtl">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">لوحة KPIs ذكية</h2>
            <p className="text-sm text-muted-foreground">
              اطلب من المساعد توليد اقتراح ثم عدّل الشكل، أعد الترتيب، أخفِ أو احذف.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={requestGenerate} disabled={mut.isPending || plan.isLoading} size="sm">
          <Sparkles className="ms-2 h-4 w-4" />
          {mut.isPending ? "جارٍ الاقتراح…" : "توليد اقتراح ذكي"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ["dash-tool"] })}
        >
          <RefreshCw className="ms-2 h-4 w-4" /> تحديث البيانات
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={saveMut.isPending}
          onClick={() => {
            saveLocal(widgets);
            saveMut.mutate(widgets, {
              onSuccess: () => toast.success("تم حفظ التخطيط على حسابك"),
            });
          }}
        >
          <Save className="ms-2 h-4 w-4" /> {saveMut.isPending ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
        <div className="ms-auto flex items-center gap-2">
          <Badge variant={overCap ? "destructive" : atCap ? "secondary" : "outline"}>
            {visibleCount} / {cap ?? "∞"} عنصر ظاهر
          </Badge>
          {plan.planName && (
            <span className="text-xs text-muted-foreground">باقة: {plan.planName}</span>
          )}
          {cap != null && (
            <Button variant="ghost" size="sm" onClick={() => setUpgradeOpen(true)}>
              ترقية
            </Button>
          )}
        </div>
      </div>

      {overCap && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          لديك {visibleCount} عناصر ظاهرة، لكن الباقة الحالية تسمح بـ {cap} فقط. اخفِ بعض العناصر أو
          قم بالترقية.
        </div>
      )}

      {!widgets.length && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا يوجد widgets بعد — اضغط "توليد اقتراح ذكي" للبدء.
          </CardContent>
        </Card>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={grid.map((w) => w.id)} strategy={rectSortingStrategy}>
          <motion.div layout className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {grid.map((w, idx) => (
                <WidgetCard
                  key={w.id}
                  widget={w}
                  onChange={(nw) => update(widgets.map((x, i) => (i === idx ? nw : x)))}
                  onRemove={() => update(widgets.filter((_, i) => i !== idx))}
                  onToggle={() => {
                    const target = widgets[idx];
                    if (!target.visible && cap != null && visibleCount >= cap) {
                      setUpgradeOpen(true);
                      return;
                    }
                    update(widgets.map((x, i) => (i === idx ? { ...x, visible: !x.visible } : x)));
                  }}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </SortableContext>
        <DragOverlay
          dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}
        >
          {activeWidget ? <WidgetThumbnail widget={activeWidget} /> : null}
        </DragOverlay>
      </DndContext>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        label={plan.label}
        used={visibleCount}
        max={cap}
        planName={plan.planName}
      />
    </div>
  );
}
