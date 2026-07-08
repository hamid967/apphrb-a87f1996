import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CalendarX, Eraser, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateDateRange, type DateRangeMessages } from "@/lib/reports/date-range";

export type DateRangeFilterProps = {
  from: string;
  to: string;
  minISO: string;
  maxISO: string;
  onApply: (next: { from: string; to: string }) => void;
  onReset?: () => void;
  onAnnounce?: (text: string) => void;
  /** When true, the Apply button is disabled and shows a spinner. */
  isApplying?: boolean;
  /** Optional label / button-text overrides for non-Arabic contexts. */
  labels?: Partial<{
    from: string;
    to: string;
    apply: string;
    applying: string;
    reset: string;
    clearDraft: string;
    clearRange: string;
    errorToastTitle: string;
    dirtyHint: string;
    presetsLabel: string;
  }>;
  /** Optional id prefix so multiple filters can coexist on one page. */
  idPrefix?: string;
  /** Override validator error messages (defaults to Arabic). */
  messages?: DateRangeMessages;
  /**
   * When provided, unapplied draft `from`/`to` values are persisted to
   * `sessionStorage` under this key so they survive in-session navigation.
   * Cleared automatically when the applied range changes (Apply/Reset).
   */
  draftStorageKey?: string;
  /**
   * When provided, seeds the initial draft state. Takes precedence over any
   * `draftStorageKey` restore. Use this when the parent owns the draft
   * persistence (e.g. unified with other report filters).
   */
  initialDraft?: { from: string; to: string };
  /**
   * Fires whenever the unapplied draft `from`/`to` change (typing, presets,
   * or Clear draft). Lets the parent mirror the draft into an external store
   * such as a unified `sessionStorage` key that also holds sibling filters.
   */
  onDraftChange?: (draft: { from: string; to: string }) => void;
  /**
   * When true (default), renders quick-range preset buttons (today, last 7/30/90
   * days, this month, last month, year-to-date) above the date inputs. Clicking
   * a preset updates the draft only — user must still press Apply.
   */
  showPresets?: boolean;
};

/**
 * Compute the ISO-date bounds for a named quick range, relative to `today`.
 * Exported so tests can pin `today` and assert against a stable value.
 */
export type QuickRangeKey =
  | "today"
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "ytd";

export function computeQuickRange(key: QuickRangeKey, today: Date): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const shift = (days: number) => {
    const d = new Date(t);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  };
  switch (key) {
    case "today":
      return { from: iso(t), to: iso(t) };
    case "last7":
      return { from: iso(shift(-6)), to: iso(t) };
    case "last30":
      return { from: iso(shift(-29)), to: iso(t) };
    case "last90":
      return { from: iso(shift(-89)), to: iso(t) };
    case "thisMonth": {
      const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      return { from: iso(first), to: iso(t) };
    }
    case "lastMonth": {
      const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
      return { from: iso(first), to: iso(last) };
    }
    case "ytd": {
      const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      return { from: iso(first), to: iso(t) };
    }
  }
}

const QUICK_RANGE_LABELS: Record<QuickRangeKey, string> = {
  today: "اليوم",
  last7: "آخر 7 أيام",
  last30: "آخر 30 يومًا",
  last90: "آخر 90 يومًا",
  thisMonth: "هذا الشهر",
  lastMonth: "الشهر الماضي",
  ytd: "منذ بداية السنة",
};
const QUICK_RANGE_ORDER: QuickRangeKey[] = [
  "today",
  "last7",
  "last30",
  "last90",
  "thisMonth",
  "lastMonth",
  "ytd",
];

export function DateRangeFilter({
  from,
  to,
  minISO,
  maxISO,
  onApply,
  onReset,
  onAnnounce,
  isApplying = false,
  labels,
  idPrefix = "filter",
  messages,
  draftStorageKey,
  initialDraft: initialDraftProp,
  onDraftChange,
  showPresets = true,
}: DateRangeFilterProps) {
  const L = {
    from: labels?.from ?? "من تاريخ",
    to: labels?.to ?? "إلى تاريخ",
    apply: labels?.apply ?? "تطبيق",
    applying: labels?.applying ?? "جارٍ التطبيق…",
    reset: labels?.reset ?? "إعادة ضبط النطاق",
    clearDraft: labels?.clearDraft ?? "مسح المسودة",
    clearRange: labels?.clearRange ?? "مسح نطاق التاريخ",
    errorToastTitle: labels?.errorToastTitle ?? "تعذّر تطبيق النطاق",
    presetsLabel: labels?.presetsLabel ?? "نطاقات سريعة",
  };
  const dirtyHint = labels?.dirtyHint ?? "تغييرات غير مُطبَّقة — اضغط «تطبيق» لتحديث النتائج.";
  const fromId = `${idPrefix}-from`;
  const toId = `${idPrefix}-to`;
  const fromErrId = `${fromId}-error`;
  const toErrId = `${toId}-error`;
  const readStoredDraft = (): { from: string; to: string } | null => {
    if (!draftStorageKey || typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(draftStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { from?: unknown; to?: unknown };
      if (typeof parsed.from !== "string" || typeof parsed.to !== "string") return null;
      return { from: parsed.from, to: parsed.to };
    } catch {
      return null;
    }
  };
  const initialDraft = (): { from: string; to: string } => {
    if (initialDraftProp) return initialDraftProp;
    const stored = readStoredDraft();
    return stored ?? { from, to };
  };
  const [draftFrom, setDraftFrom] = useState(() => initialDraft().from);
  const [draftTo, setDraftTo] = useState(() => initialDraft().to);
  // Notify parent on every draft mutation so it can unify persistence with
  // sibling filters. Skip the initial render — the parent already knows the
  // seed value (it provided `initialDraft`).
  const draftChangeRef = useRef(onDraftChange);
  draftChangeRef.current = onDraftChange;
  const draftInitRef = useRef(false);
  useEffect(() => {
    if (!draftInitRef.current) {
      draftInitRef.current = true;
      return;
    }
    draftChangeRef.current?.({ from: draftFrom, to: draftTo });
  }, [draftFrom, draftTo]);
  const [fromError, setFromError] = useState("");
  const [toError, setToError] = useState("");
  const didMountRef = useRef(false);

  // Persist drafts on every change so navigating away and back restores them.
  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") return;
    try {
      if (draftFrom === from && draftTo === to) {
        window.sessionStorage.removeItem(draftStorageKey);
      } else {
        window.sessionStorage.setItem(
          draftStorageKey,
          JSON.stringify({ from: draftFrom, to: draftTo }),
        );
      }
    } catch {
      // storage full or blocked — ignore.
    }
  }, [draftStorageKey, draftFrom, draftTo, from, to]);

  // When applied values change (Apply/Reset/URL sync), refresh draft and drop
  // any stale persisted draft. Skip the first run so an in-storage draft
  // restored on mount is not immediately overwritten by the props.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setDraftFrom(from);
    setDraftTo(to);
    setFromError("");
    setToError("");
    if (draftStorageKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(draftStorageKey);
      } catch {
        /* noop */
      }
    }
  }, [from, to, draftStorageKey]);

  const apply = () => {
    const v = validateDateRange(draftFrom, draftTo, minISO, maxISO, messages);
    setFromError(v.fromError);
    setToError(v.toError);
    if (!v.ok) {
      const msg = v.fromError || v.toError;
      toast.error(L.errorToastTitle, { description: msg });
      onAnnounce?.(`خطأ: ${msg}`);
      return;
    }
    onApply({ from: draftFrom, to: draftTo });
    onAnnounce?.(`تم تطبيق النطاق: ${draftFrom} — ${draftTo}`);
  };

  const clearDraft = () => {
    setDraftFrom(from);
    setDraftTo(to);
    setFromError("");
    setToError("");
    if (draftStorageKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(draftStorageKey);
      } catch {
        /* noop */
      }
    }
    onAnnounce?.("تم مسح المسودة");
  };

  const clearDateRange = () => {
    setDraftFrom(minISO);
    setDraftTo(maxISO);
    setFromError("");
    setToError("");
    if (draftStorageKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(draftStorageKey);
      } catch {
        /* noop */
      }
    }
    onAnnounce?.("تم مسح نطاق التاريخ");
  };

  const dirty = draftFrom !== from || draftTo !== to;
  const dirtyInputClass = dirty
    ? "ring-2 ring-amber-500/60 border-amber-500/70 focus-visible:ring-amber-500"
    : "";

  const applyPreset = (key: QuickRangeKey) => {
    const { from: pFrom, to: pTo } = computeQuickRange(key, new Date());
    // Clamp to allowed bounds so the range stays valid.
    const clamp = (v: string) => (v < minISO ? minISO : v > maxISO ? maxISO : v);
    const nextFrom = clamp(pFrom);
    const nextTo = clamp(pTo);
    setDraftFrom(nextFrom);
    setDraftTo(nextTo);
    setFromError("");
    setToError("");
    onAnnounce?.(`تم اختيار: ${QUICK_RANGE_LABELS[key]}`);
  };

  // A preset is "active" when the draft exactly matches its computed range.
  const activePreset: QuickRangeKey | null = (() => {
    if (typeof window === "undefined") return null;
    for (const k of QUICK_RANGE_ORDER) {
      const r = computeQuickRange(k, new Date());
      if (r.from === draftFrom && r.to === draftTo) return k;
    }
    return null;
  })();

  return (
    <>
      {showPresets && (
        <div
          role="group"
          aria-label={L.presetsLabel}
          data-testid="date-range-presets"
          className="md:col-span-full flex flex-wrap gap-1.5"
        >
          {QUICK_RANGE_ORDER.map((k) => {
            const isActive = activePreset === k;
            return (
              <Button
                key={k}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => applyPreset(k)}
                disabled={isApplying}
                aria-pressed={isActive}
                data-preset={k}
              >
                {QUICK_RANGE_LABELS[k]}
              </Button>
            );
          })}
        </div>
      )}
      <div>
        <Label htmlFor={fromId}>{L.from}</Label>
        <Input
          id={fromId}
          type="date"
          value={draftFrom}
          min={minISO}
          max={maxISO}
          disabled={isApplying}
          aria-invalid={!!fromError}
          aria-describedby={fromError ? fromErrId : undefined}
          data-dirty={!isApplying && dirty && draftFrom !== from ? "true" : undefined}
          className={`${draftFrom !== from && !isApplying ? dirtyInputClass : ""} ${isApplying ? "opacity-60" : ""}`}
          onChange={(e) => {
            setDraftFrom(e.target.value);
            if (fromError) setFromError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
        {fromError && (
          <p id={fromErrId} role="alert" className="mt-1 text-xs text-destructive">
            {fromError}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor={toId}>{L.to}</Label>
        <Input
          id={toId}
          type="date"
          value={draftTo}
          min={minISO}
          max={maxISO}
          disabled={isApplying}
          aria-invalid={!!toError}
          aria-describedby={toError ? toErrId : undefined}
          data-dirty={!isApplying && dirty && draftTo !== to ? "true" : undefined}
          className={`${draftTo !== to && !isApplying ? dirtyInputClass : ""} ${isApplying ? "opacity-60" : ""}`}
          onChange={(e) => {
            setDraftTo(e.target.value);
            if (toError) setToError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
        {toError && (
          <p id={toErrId} role="alert" className="mt-1 text-xs text-destructive">
            {toError}
          </p>
        )}
        {dirty && !fromError && !toError && !isApplying && (
          <p
            role="status"
            aria-live="polite"
            data-testid="date-range-dirty-hint"
            className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
          >
            <AlertCircle className="size-3.5" aria-hidden="true" />
            {dirtyHint}
          </p>
        )}
      </div>
      <div className="flex items-end gap-2">
        <Button
          size="sm"
          className={`gap-1 flex-1 ${dirty && !isApplying ? "ring-2 ring-amber-500/60 ring-offset-1 animate-pulse" : ""}`}
          onClick={apply}
          disabled={isApplying || (!dirty && !fromError && !toError)}
          aria-busy={isApplying || undefined}
          data-dirty={dirty ? "true" : undefined}
        >
          {isApplying ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {L.applying}
            </>
          ) : (
            L.apply
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1 ${dirty ? "border-amber-500/70 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" : ""}`}
          onClick={clearDraft}
          aria-label={L.clearDraft}
          disabled={isApplying || !dirty}
          data-dirty={dirty ? "true" : undefined}
          title={L.clearDraft}
        >
          <Eraser className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1 ${!(draftFrom === minISO && draftTo === maxISO) ? "border-amber-500/70 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" : ""}`}
          onClick={clearDateRange}
          aria-label={L.clearRange}
          disabled={isApplying || (draftFrom === minISO && draftTo === maxISO)}
          title={L.clearRange}
        >
          <CalendarX className="size-4" />
        </Button>
        {onReset && (
          <Button
            variant="outline"
            size="sm"
            className={`gap-1 ${dirty ? "border-amber-500/70 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" : ""}`}
            onClick={onReset}
            aria-label={L.reset}
            disabled={isApplying}
            data-dirty={dirty ? "true" : undefined}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
      </div>
    </>
  );
}
