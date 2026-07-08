import { X, Filter, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

export type ActiveFilterChip = {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
};

type Props = {
  chips: ActiveFilterChip[];
  onClearAll?: () => void;
  className?: string;
};

/**
 * Compact bar that surfaces every non-default filter as a removable chip.
 * Renders nothing when no filters are active — safe to always mount.
 */
export function ActiveFiltersBar({ chips, onClearAll, className }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Which chip currently shows the "swipe-to-confirm" reveal (mobile only).
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null);
  // Coalesce a burst of scroll events into a single analytic emission that
  // captures the *final* rest position — noisy per-frame scroll spam is
  // useless for friction analysis, whereas "where did the user land" is not.
  const scrollDebounceRef = useRef<number | null>(null);
  const scrollStartLeftRef = useRef<number | null>(null);

  // Clear the pending reveal whenever chips update from the outside (e.g. the
  // filter was removed via keyboard or the X button), so no stale confirm UI
  // lingers on a chip that no longer exists.
  useEffect(() => {
    if (pendingRemoveKey && !chips.some((c) => c.key === pendingRemoveKey)) {
      setPendingRemoveKey(null);
    }
  }, [chips, pendingRemoveKey]);

  // Emit a single "horizontal_scroll" event ~350ms after the user stops
  // scrolling, only when the scroller actually overflows (mobile layout).
  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 4) return; // desktop wrapped layout — nothing to track
    if (scrollStartLeftRef.current === null) {
      scrollStartLeftRef.current = el.scrollLeft;
    }
    if (scrollDebounceRef.current !== null) {
      window.clearTimeout(scrollDebounceRef.current);
    }
    scrollDebounceRef.current = window.setTimeout(() => {
      const startLeft = scrollStartLeftRef.current ?? 0;
      const endLeft = el.scrollLeft;
      // scrollLeft is signed-negative in RTL on WebKit; use magnitudes.
      const delta = Math.abs(endLeft - startLeft);
      const progress = Math.abs(endLeft) / Math.max(1, overflow); // 0..1
      trackEvent("active_filters.horizontal_scroll", {
        chipCount: chips.length,
        deltaPx: Math.round(delta),
        progress: Math.round(progress * 100) / 100,
        reachedEnd: progress >= 0.95,
      });
      scrollStartLeftRef.current = null;
      scrollDebounceRef.current = null;
    }, 350);
  }

  // Cleanup on unmount so a pending debounce doesn't fire against a dead ref.
  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current !== null) {
        window.clearTimeout(scrollDebounceRef.current);
      }
    };
  }, []);

  /**
   * Roving keyboard navigation across chip remove buttons + Clear-all.
   * - Arrow keys move focus (RTL-aware — reads computed direction).
   * - Home / End jump to edges.
   * - Delete / Backspace remove the focused chip and move focus to the
   *   next control so users can chain deletions without lifting a finger.
   */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = scrollerRef.current;
    if (!el) return;
    const focusables = Array.from(el.querySelectorAll<HTMLButtonElement>("[data-chip-focus]"));
    if (!focusables.length) return;
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? focusables.indexOf(active as HTMLButtonElement) : -1;
    if (idx === -1) return;

    const isRTL = getComputedStyle(el).direction === "rtl";
    const forward = isRTL ? "ArrowLeft" : "ArrowRight";
    const backward = isRTL ? "ArrowRight" : "ArrowLeft";
    const focusAt = (i: number) => {
      const t = focusables[Math.max(0, Math.min(focusables.length - 1, i))];
      t?.focus();
      // jsdom doesn't implement scrollIntoView — guard for tests.
      t?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };

    if (e.key === forward) {
      e.preventDefault();
      focusAt(idx + 1);
      return;
    }
    if (e.key === backward) {
      e.preventDefault();
      focusAt(idx - 1);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusAt(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      focusAt(focusables.length - 1);
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && active?.dataset.chipKey) {
      e.preventDefault();
      const chip = chips.find((c) => c.key === active.dataset.chipKey);
      if (!chip) return;
      trackEvent("active_filters.chip_remove", {
        filterKey: chip.key,
        source: "keyboard",
        remaining: chips.length - 1,
      });
      chip.onRemove();
      requestAnimationFrame(() => {
        if (!scrollerRef.current) return;
        const next = Array.from(
          scrollerRef.current.querySelectorAll<HTMLButtonElement>("[data-chip-focus]"),
        );
        (next[idx] ?? next[idx - 1] ?? next[0])?.focus();
      });
    }
  }

  if (!chips.length) return null;
  return (
    <div
      className={`rounded-lg border bg-muted/30 text-xs ${className ?? ""}`}
      role="region"
      aria-label="الفلاتر النشطة"
      data-testid="active-filters-bar"
    >
      {/*
        Mobile: horizontal scroller (no wrap) with edge-fade masks + snap so
        chips stay one-line and always fully tappable.
        ≥sm: flow to a wrapped row.
      */}
      <div
        ref={scrollerRef}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
        className="
          flex items-center gap-2 overflow-x-auto px-3 py-2
          [scrollbar-width:none] [-ms-overflow-style:none]
          [&::-webkit-scrollbar]:hidden
          snap-x snap-mandatory scroll-px-3 overscroll-x-contain
          [mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]
          sm:flex-wrap sm:overflow-visible sm:snap-none sm:[mask-image:none]
        "
      >
        <span
          className="inline-flex shrink-0 items-center gap-1 text-muted-foreground"
          data-testid="active-filters-count"
        >
          <Filter className="size-3.5" aria-hidden="true" />
          <span>فلاتر نشطة ({chips.length}):</span>
        </span>
        {chips.map((c) => (
          <SwipeableChip
            key={c.key}
            chip={c}
            totalChips={chips.length}
            pending={pendingRemoveKey === c.key}
            onRequestConfirm={() => setPendingRemoveKey(c.key)}
            onCancel={() => setPendingRemoveKey(null)}
          />
        ))}
        {onClearAll && chips.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            data-chip-focus
            className="
              shrink-0 snap-end touch-manipulation
              h-9 px-3 text-xs
              sm:h-6 sm:px-2 sm:text-[11px]
              focus-visible:ring-2 focus-visible:ring-primary
            "
            onClick={() => {
              trackEvent("active_filters.clear_all", {
                chipCount: chips.length,
                filterKeys: chips.map((c) => c.key).join(","),
              });
              onClearAll();
            }}
            data-testid="active-filters-clear-all"
          >
            مسح الكل
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Touch-swipe wrapper around a filter chip.
 *
 * Interaction model:
 * - Desktop (mouse/pen) is unchanged — click the X button to remove.
 * - Touch: drag the chip toward the row's END edge (RTL-aware). Past
 *   ~48px a red trash panel is revealed behind the chip AND a light
 *   haptic pulse fires. Releasing past ~72px latches the chip open, so
 *   the user must tap the revealed "حذف" button to actually remove —
 *   this is the simple confirm step. Releasing early snaps back.
 * - Confirming removes the filter, fires a stronger haptic, and shows a
 *   sonner toast acknowledging the action.
 */
function SwipeableChip({
  chip,
  totalChips,
  pending,
  onRequestConfirm,
  onCancel,
}: {
  chip: ActiveFilterChip;
  totalChips: number;
  pending: boolean;
  onRequestConfirm: () => void;
  onCancel: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number | null>(null);
  const crossedRef = useRef(false); // haptic-once guard per gesture
  const [dragDx, setDragDx] = useState(0); // live translate during drag

  const REVEAL_PX = 72; // latch threshold on release
  const HAPTIC_PX = 48; // where the tactile pulse fires
  const MAX_PX = 96; // clamp so chip can't fly across the screen

  const isRTL = useCallback(() => {
    return (
      typeof document !== "undefined" &&
      getComputedStyle(wrapRef.current ?? document.documentElement).direction === "rtl"
    );
  }, []);

  const vibrate = (ms: number) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        /* Safari / unsupported — ignore */
      }
    }
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return; // touch-only gesture
    startXRef.current = e.clientX;
    crossedRef.current = false;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || startXRef.current === null) return;
    const raw = e.clientX - startXRef.current;
    // Only accept swipes toward the row's END edge (natural "throw away"
    // direction). In LTR that's leftward (negative). In RTL it's rightward.
    const towardEnd = isRTL() ? Math.max(0, raw) : Math.min(0, raw);
    const clamped = Math.sign(towardEnd) * Math.min(Math.abs(towardEnd), MAX_PX);
    setDragDx(clamped);
    if (!crossedRef.current && Math.abs(clamped) >= HAPTIC_PX) {
      crossedRef.current = true;
      vibrate(10);
    }
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || startXRef.current === null) return;
    const finalDx = dragDx;
    startXRef.current = null;
    setDragDx(0);
    if (Math.abs(finalDx) >= REVEAL_PX) {
      trackEvent("active_filters.swipe_reveal", {
        filterKey: chip.key,
        distancePx: Math.round(Math.abs(finalDx)),
      });
      onRequestConfirm();
    } else if (pending) {
      trackEvent("active_filters.swipe_cancel", { filterKey: chip.key });
      // A tap without a real drag on an already-open chip closes it.
      onCancel();
    } else if (Math.abs(finalDx) > 8) {
      // Aborted swipe — user reconsidered before hitting the reveal
      // threshold. Useful signal for friction analysis.
      trackEvent("active_filters.swipe_abort", {
        filterKey: chip.key,
        distancePx: Math.round(Math.abs(finalDx)),
      });
    }
  }

  function confirmRemove() {
    vibrate(25);
    trackEvent("active_filters.chip_remove", {
      filterKey: chip.key,
      source: "swipe",
      remaining: Math.max(0, totalChips - 1),
    });
    chip.onRemove();
    toast.success(`تم إزالة الفلتر: ${chip.label}`, { duration: 2000 });
    onCancel();
  }

  // Effective visual offset: while dragging use dragDx; when latched
  // "pending" show a stable reveal offset in the end-direction.
  const visualDx = dragDx !== 0 ? dragDx : pending ? (isRTL() ? REVEAL_PX : -REVEAL_PX) : 0;

  return (
    <div
      ref={wrapRef}
      className="relative shrink-0 snap-start touch-pan-y select-none"
      data-testid={`active-chip-wrap-${chip.key}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {/* Reveal panel sits behind the chip on the END edge. */}
      <button
        type="button"
        onClick={confirmRemove}
        aria-label={`تأكيد إزالة ${chip.label}`}
        tabIndex={pending ? 0 : -1}
        aria-hidden={!pending}
        data-testid={`active-chip-confirm-${chip.key}`}
        className={`
          absolute inset-y-0 end-0 flex items-center gap-1 rounded-lg
          bg-destructive px-3 text-destructive-foreground text-xs font-medium
          transition-opacity duration-150
          ${pending || Math.abs(visualDx) > 8 ? "opacity-100" : "opacity-0 pointer-events-none"}
        `}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        <span>حذف</span>
      </button>
      <Badge
        variant="secondary"
        style={{
          transform: `translateX(${visualDx}px)`,
          transition: dragDx === 0 ? "transform 160ms ease-out" : "none",
        }}
        className="
          relative shrink-0 gap-1 py-1 ps-1 pe-2 font-normal
          min-h-9 sm:min-h-6 sm:py-0
          max-w-[75vw] sm:max-w-none
        "
        data-testid={`active-chip-${chip.key}`}
        data-chip-pending={pending ? "true" : undefined}
      >
        <span className="truncate text-muted-foreground">{chip.label}:</span>
        <span className="truncate font-medium tabular-nums">{chip.value}</span>
        <button
          type="button"
          onClick={() => {
            trackEvent("active_filters.chip_remove", {
              filterKey: chip.key,
              source: "button",
              remaining: Math.max(0, totalChips - 1),
            });
            chip.onRemove();
          }}
          data-chip-focus
          data-chip-key={chip.key}
          title="Delete/Backspace للإزالة، ↔ للتنقل"
          className="
            ms-1 inline-flex shrink-0 items-center justify-center rounded-full
            size-8 sm:size-5
            hover:bg-muted-foreground/20 active:bg-muted-foreground/30
            touch-manipulation
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
          "
          aria-label={`إزالة فلتر ${chip.label}`}
        >
          <X className="size-4 sm:size-3" />
        </button>
      </Badge>
    </div>
  );
}
