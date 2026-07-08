import { useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Detect an auth failure surfaced by requireSupabaseAuth in a server fn.
// The middleware throws `Response("Unauthorized", { status: 401 })`, which
// crosses the RPC boundary as an Error whose message mentions 401 /
// Unauthorized / expired JWT.
export function isAuthError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("401") ||
    msg.includes("jwt expired") ||
    msg.includes("invalid_token") ||
    msg.includes("no authorization header")
  );
}

// Query retry predicate: never retry on auth errors, otherwise up to 2 times.
export const authAwareRetry = (count: number, err: unknown) => !isAuthError(err) && count < 2;

/**
 * Subscribe to a QueryClient and, the first time any query or mutation
 * errors with a JWT-expired / 401 shape, cancel every in-flight query and
 * clear the cache so no follow-up fetch lands after the session is gone.
 *
 * Returns an unsubscribe function AND the boolean `triggered`-getter for
 * tests. Idempotent: only the first auth error triggers the sweep; later
 * errors on already-cancelled queries do not re-fire it.
 *
 * Exported so the same short-circuit is testable in isolation and reusable
 * outside a React tree (e.g. from a top-level bootstrap).
 */
export function installAuthErrorCanceller(qc: QueryClient) {
  let triggered = false;
  const sweep = () => {
    if (triggered) return;
    triggered = true;
    // Do NOT await — cancel + clear must be synchronous relative to the
    // notification so any queued query resolution short-circuits before
    // the microtask writes stale data back into the cache.
    void qc.cancelQueries();
    qc.clear();
  };

  const unsubQ = qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    if (isAuthError(event.query.state.error)) sweep();
  });
  const unsubM = qc.getMutationCache().subscribe((event) => {
    if (event.type !== "updated") return;
    if (isAuthError(event.mutation.state.error)) sweep();
  });

  const unsubscribe = () => {
    unsubQ();
    unsubM();
  };
  // Note: `Object.assign` would copy the getter's *current* value once,
  // not the getter itself. `defineProperty` preserves live access.
  Object.defineProperty(unsubscribe, "triggered", {
    get: () => triggered,
    enumerable: true,
  });
  return unsubscribe as typeof unsubscribe & { readonly triggered: boolean };
}

/**
 * Centralised auth-failure handling for authenticated portal pages.
 *
 * Pass any query errors that might surface a 401. If any is an auth error we:
 *   1. Install a QueryCache/MutationCache subscriber that cancels ALL
 *      in-flight requests the instant the first 401 lands — regardless
 *      of whether that query was passed in `errors` — so no late fetch
 *      hits the cleared session.
 *   2. Sign the user out cleanly.
 *   3. Redirect to /auth with a redirect-back to `redirectPath`.
 *
 * Returns `{ authFailed, Fallback }`. Render `<Fallback />` and early-return
 * from the component when `authFailed` is true so nothing protected paints
 * before the redirect lands.
 */
export function usePortalAuthGuard(opts: { redirectPath: string; errors: Array<unknown> }) {
  const { redirectPath, errors } = opts;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const authFailed = errors.some(isAuthError);

  // Install the cancel-on-first-401 sweeper for the lifetime of the page.
  // Mounted once per page render tree; the sweeper is idempotent so
  // repeated triggers are cheap.
  useEffect(() => {
    const unsub = installAuthErrorCanceller(qc);
    return () => {
      unsub();
    };
  }, [qc]);

  useEffect(() => {
    if (!authFailed) return;
    let cancelled = false;
    (async () => {
      // Cancel synchronously — do not await — so any pending queryFn
      // that resolves in the same microtask sees an aborted query and
      // its result is dropped instead of overwriting cache state.
      void qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      if (cancelled) return;
      toast.error(t("auth.sessionExpiredRedirect"));
      navigate({
        to: "/auth",
        search: { redirect: redirectPath },
        replace: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [authFailed, navigate, qc, redirectPath, t]);

  const Fallback = () => (
    <div className="max-w-md mx-auto p-8">
      <Card>
        <CardContent className="p-6 space-y-3 text-center">
          <LogIn className="mx-auto size-8 text-muted-foreground" />
          <p className="text-sm">{t("auth.sessionExpiredFallback")}</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/auth" search={{ redirect: redirectPath }}>
              {t("auth.signInNow")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  return { authFailed, Fallback };
}
