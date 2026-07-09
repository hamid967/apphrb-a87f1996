// Persist a post-login destination across the /auth round-trip.
//
// Why sessionStorage in addition to the ?redirect= query param:
// some in-app WebViews (native shells, embedded browsers) drop or rewrite
// query strings when they hand the URL back to the app after an OAuth or
// magic-link round-trip. Persisting the target lets us recover it even when
// the query param is lost.

const KEY = "hbspro.pending_redirect";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function savePendingRedirect(target: string | null | undefined): void {
  if (!isBrowser() || !target) return;
  try {
    window.sessionStorage.setItem(KEY, target);
  } catch {
    /* storage disabled — ignore */
  }
}

export function readPendingRedirect(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function consumePendingRedirect(): string | null {
  if (!isBrowser()) return null;
  try {
    const v = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

export function clearPendingRedirect(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
