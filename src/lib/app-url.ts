/**
 * Resolve absolute in-app URLs that work in the browser, PWA, and the
 * Capacitor WebView (iOS + Android).
 *
 * In the native shell, `capacitor.config.ts` sets `server.url` to the
 * stable published origin and `androidScheme/iosScheme = 'https'`, so
 * `window.location.origin` already returns the correct https origin —
 * the same URL that must be whitelisted under Supabase Auth →
 * "Redirect URLs" so email links and OAuth callbacks succeed inside
 * the WebView.
 *
 * Use this helper for every `redirectTo` / `emailRedirectTo` / OAuth
 * `redirect_uri` so we never accidentally hard-code a preview URL.
 */
const PRODUCTION_ORIGIN = "https://project--a9ead090-32b6-464c-a919-22a1f97a0364.lovable.app";

export function getAppOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    // Guard against the Capacitor default `capacitor://localhost` if a
    // future config ever drops `iosScheme: 'https'`. Auth links must be
    // https to be accepted by Supabase.
    if (origin.startsWith("http")) return origin;
  }
  return PRODUCTION_ORIGIN;
}

export function getAppUrl(path: string): string {
  const origin = getAppOrigin();
  if (!path) return origin;
  return path.startsWith("/") ? `${origin}${path}` : `${origin}/${path}`;
}
