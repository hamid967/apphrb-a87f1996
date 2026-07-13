import { useCallback, useEffect, useState } from "react";
import {
  HUB_CATEGORIES,
  HUB_SERVICES,
  type HubService,
  type HubCategoryKey,
} from "@/lib/services-hub-catalog";

export type HubCatalogState = {
  services: HubService[];
  categories: typeof HUB_CATEGORIES;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Loads the services hub catalog. The catalog is currently static, but this
 * hook wraps the read in an async boundary so the UI can render skeletons on
 * first paint and expose a retry path if the module ever fails to resolve
 * (e.g. lazy import failure, corrupted data). Keeps a single source of truth
 * for loading / error / empty states across the hub.
 */
export function useHubCatalog(): HubCatalogState {
  const [state, setState] = useState<{
    services: HubService[];
    isLoading: boolean;
    error: Error | null;
  }>({ services: [], isLoading: true, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true, error: null }));

    // microtask so the first paint always shows the loading skeleton
    const id = window.setTimeout(() => {
      try {
        if (!Array.isArray(HUB_SERVICES)) {
          throw new Error("Services catalog is not available");
        }
        if (cancelled) return;
        setState({ services: HUB_SERVICES, isLoading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          services: [],
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  return {
    services: state.services,
    categories: HUB_CATEGORIES,
    isLoading: state.isLoading,
    error: state.error,
    refetch,
  };
}

export type { HubCategoryKey };
