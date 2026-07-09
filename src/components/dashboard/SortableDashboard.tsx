import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, RotateCcw, LayoutGrid, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DashboardSection = {
  id: string;
  labelAr: string;
  labelEn: string;
  node: ReactNode;
};

type Prefs = { order: string[]; hidden: string[] };

const storageKey = (userId: string | undefined) =>
  userId ? `aqari:dashboard-layout:${userId}` : "aqari:dashboard-layout:anon";

function loadPrefs(userId: string | undefined): Prefs {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { order: [], hidden: [] };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return { order: [], hidden: [] };
  }
}

function savePrefs(userId: string | undefined, prefs: Prefs) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(prefs));
  } catch {
    /* ignore quota */
  }
}

function SortableItem({
  id,
  editing,
  hidden,
  labelAr,
  labelEn,
  isAr,
  onToggleHidden,
  children,
}: {
  id: string;
  editing: boolean;
  hidden: boolean;
  labelAr: string;
  labelEn: string;
  isAr: boolean;
  onToggleHidden: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  if (!editing && hidden) return null;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {editing && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5">
          <button
            type="button"
            className="inline-flex cursor-grab items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-primary/10 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label={isAr ? "اسحب لإعادة الترتيب" : "Drag to reorder"}
          >
            <GripVertical className="size-4" />
            <span>{isAr ? labelAr : labelEn}</span>
          </button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onToggleHidden}
          >
            {hidden ? (
              <>
                <EyeOff className="size-3.5" />
                {isAr ? "مخفي" : "Hidden"}
              </>
            ) : (
              <>
                <Eye className="size-3.5" />
                {isAr ? "ظاهر" : "Visible"}
              </>
            )}
          </Button>
        </div>
      )}
      <div
        className={
          editing
            ? `rounded-xl outline-dashed outline-2 outline-offset-4 outline-primary/30 transition ${
                hidden ? "opacity-40 grayscale" : ""
              }`
            : ""
        }
      >
        {children}
      </div>
    </div>
  );
}

export function SortableDashboard({
  userId,
  sections,
  isAr,
}: {
  userId: string | undefined;
  sections: DashboardSection[];
  isAr: boolean;
}) {
  const [prefs, setPrefs] = useState<Prefs>({ order: [], hidden: [] });
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs(userId));
    setLoaded(true);
  }, [userId]);

  const orderedIds = useMemo(() => {
    const known = new Set(sections.map((s) => s.id));
    const existing = prefs.order.filter((id) => known.has(id));
    const missing = sections.map((s) => s.id).filter((id) => !existing.includes(id));
    return [...existing, ...missing];
  }, [prefs.order, sections]);

  const sectionMap = useMemo(() => {
    const m = new Map<string, DashboardSection>();
    for (const s of sections) m.set(s.id, s);
    return m;
  }, [sections]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persist = (next: Prefs) => {
    setPrefs(next);
    savePrefs(userId, next);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    persist({ ...prefs, order: arrayMove(orderedIds, oldIndex, newIndex) });
  };

  const toggleHidden = (id: string) => {
    const hidden = new Set(prefs.hidden);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    persist({ ...prefs, hidden: Array.from(hidden) });
  };

  const resetLayout = () => {
    persist({ order: [], hidden: [] });
  };

  if (!loaded) {
    return (
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.id}>{s.node}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5"
            onClick={resetLayout}
          >
            <RotateCcw className="size-3.5" />
            {isAr ? "استعادة الافتراضي" : "Reset"}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant={editing ? "default" : "outline"}
          className="h-8 gap-1.5"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? (
            <>
              <Check className="size-3.5" />
              {isAr ? "تم" : "Done"}
            </>
          ) : (
            <>
              <LayoutGrid className="size-3.5" />
              {isAr ? "تخصيص اللوحة" : "Customize"}
            </>
          )}
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {orderedIds.map((id) => {
              const section = sectionMap.get(id);
              if (!section) return null;
              return (
                <SortableItem
                  key={id}
                  id={id}
                  editing={editing}
                  hidden={prefs.hidden.includes(id)}
                  labelAr={section.labelAr}
                  labelEn={section.labelEn}
                  isAr={isAr}
                  onToggleHidden={() => toggleHidden(id)}
                >
                  {section.node}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
