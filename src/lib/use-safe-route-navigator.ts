import { useCallback, useMemo } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

/**
 * Safe service navigation.
 *
 * Every card in the services hub declares a `to` string (its target route).
 * Some of those strings can drift out of sync with the actual file-based
 * routes (renames, deleted pages, typos in the catalog). Instead of letting
 * the router throw an "invariant" error that breaks the whole page, we:
 *
 *   1. Expose `isKnownRoute(path)` — synchronous check against
 *      `router.routesByPath` and `router.routesById`.
 *   2. Expose `safeNavigate(path)` — navigates when known, otherwise
 *      shows a toast and stays on the current page.
 *
 * `router.routesByPath` is the runtime source of truth built from
 * `src/routeTree.gen.ts`, so it always matches what the app actually ships.
 */
export function useSafeRouteNavigator() {
  const router = useRouter();

  const knownPaths = useMemo(() => {
    const set = new Set<string>();
    const byPath = (router as unknown as { routesByPath?: Record<string, unknown> }).routesByPath;
    const byId = (router as unknown as { routesById?: Record<string, unknown> }).routesById;
    if (byPath) for (const k of Object.keys(byPath)) set.add(normalize(k));
    if (byId) for (const k of Object.keys(byId)) set.add(normalize(k));
    return set;
  }, [router]);

  const isKnownRoute = useCallback(
    (path: string) => {
      if (!path) return false;
      const clean = normalize(path.split("?")[0].split("#")[0]);
      if (knownPaths.has(clean)) return true;
      // Fallback: parametric routes ("/foo/$id"). Try to match by segment count + literal segments.
      const segs = clean.split("/").filter(Boolean);
      for (const registered of knownPaths) {
        const rSegs = registered.split("/").filter(Boolean);
        if (rSegs.length !== segs.length) continue;
        let ok = true;
        for (let i = 0; i < rSegs.length; i++) {
          if (rSegs[i]!.startsWith("$")) continue;
          if (rSegs[i] !== segs[i]) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
      return false;
    },
    [knownPaths],
  );

  const safeNavigate = useCallback(
    async (
      path: string,
      opts?: { isAr?: boolean; onFailure?: () => void },
    ): Promise<boolean> => {
      const isAr = opts?.isAr ?? true;
      if (!isKnownRoute(path)) {
        toast.error(isAr ? "الرابط غير متاح" : "Link unavailable", {
          description: isAr
            ? `المسار «${path}» غير مسجّل. تم إلغاء التنقّل حفاظًا على الجلسة.`
            : `The route "${path}" is not registered. Navigation was cancelled to protect your session.`,
        });
        opts?.onFailure?.();
        return false;
      }
      try {
        await router.navigate({ to: path as never });
        return true;
      } catch (err) {
        toast.error(isAr ? "تعذّر فتح الرابط" : "Could not open link", {
          description: err instanceof Error ? err.message : String(err),
        });
        opts?.onFailure?.();
        return false;
      }
    },
    [router, isKnownRoute],
  );

  return { isKnownRoute, safeNavigate };
}

function normalize(p: string): string {
  if (!p) return "/";
  const trimmed = p.replace(/\/+$/, "");
  return trimmed || "/";
}
