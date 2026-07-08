import { useEffect, useRef } from "react";

/**
 * Persist a plain object of report filters to `sessionStorage` so that
 * navigating away and back within the same session restores them. The hook
 * is intentionally decoupled from `DateRangeFilter`'s own draft — pages that
 * combine a date range with other filters (e.g. `status`, `bidderId`) can
 * wire this hook to persist those extras alongside the date-range draft
 * without any of them resetting when a sibling filter changes.
 *
 * Behavior:
 * - On mount, if every value in `applied` is empty/undefined and the storage
 *   entry has non-empty values, `onRestore` is called with those values so
 *   the caller can push them back into the URL / local state.
 * - Whenever `applied` changes, the entry is rewritten (or removed if all
 *   fields are empty) so it always mirrors the currently-applied filters.
 */
export function usePersistedFilters<T extends Record<string, string | undefined>>(
  key: string | undefined,
  applied: T,
  onRestore: (stored: Partial<T>) => void,
): void {
  const restoredRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  // Restore once on mount if the applied filters are all empty.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (!key || typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const allEmpty = Object.values(applied).every((v) => !v);
      if (!allEmpty) return;
      const restored: Record<string, string> = {};
      for (const k of Object.keys(applied)) {
        const v = parsed[k];
        if (typeof v === "string" && v) restored[k] = v;
      }
      if (Object.keys(restored).length > 0) {
        onRestoreRef.current(restored as Partial<T>);
      }
    } catch {
      // corrupt entry / storage blocked — ignore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist on every applied change.
  const serialized = JSON.stringify(applied);
  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    try {
      const hasAny = Object.values(applied).some((v) => !!v);
      if (hasAny) {
        window.sessionStorage.setItem(key, serialized);
      } else {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // storage full or blocked — ignore.
    }
    // `serialized` captures the applied snapshot; safe to depend on it alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, serialized]);
}
