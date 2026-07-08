/**
 * Ultra-light client-side event bus.
 *
 * `trackEvent` dispatches a `CustomEvent<"lov:analytics">` on `window` and
 * mirrors to `console.debug` in dev. A real analytics provider (PostHog,
 * Segment, Plausible, GA4, …) can plug in by attaching a single listener —
 * no callsite changes required.
 *
 * Deliberately zero-dep and SSR-safe.
 *
 * Every emitted event is auto-enriched with a lightweight envelope
 * (`sessionId`, `userId`, `path`) so downstream sinks can bucket usage per
 * session/user/page without callsites having to remember to attach them.
 * The envelope is stored as top-level fields on the event — NOT inside
 * `props` — so the domain-specific props payload stays small and stable.
 */
export type AnalyticsEvent = {
  name: string;
  props?: Record<string, string | number | boolean | null | undefined>;
  /** ms since epoch, filled in for you */
  ts?: number;
  /** Stable per-tab session id, generated on first event, persisted in sessionStorage. */
  sessionId?: string;
  /** Auth user id if known — resolved lazily from Supabase; `null` for anon. */
  userId?: string | null;
  /** Current location.pathname at emit time (no query/hash to keep it low-cardinality). */
  path?: string;
  /**
   * Name of the *previous* event in the same namespace (currently only
   * `active_filters.*`), so downstream analysis can correlate applies with
   * the gesture that preceded them ("scrolled → then added status filter").
   * `null` for the first event in a namespace since page load.
   */
  prevEventName?: string | null;
  /** Milliseconds between the previous event and this one. `null` if none. */
  prevEventAgeMs?: number | null;
};

const SESSION_KEY = "lov:analytics:sid";
let cachedSessionId: string | null = null;
let cachedUserId: string | null | undefined = undefined; // undefined = "not yet resolved"
let userIdSubscribed = false;

/**
 * Last-seen event, per namespace. Only tracked for namespaces we care about
 * (currently `active_filters`) — keeps memory tiny and avoids cross-feature
 * correlations that would confuse consumers.
 */
const lastEventByNamespace = new Map<string, { name: string; ts: number }>();
const CORRELATED_NAMESPACES = new Set(["active_filters"]);

function getSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedSessionId) return cachedSessionId;
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
    // crypto.randomUUID is available in all evergreen browsers we target.
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    cachedSessionId = fresh;
    return fresh;
  } catch {
    // Private mode / disabled storage — fall back to an in-memory id so we
    // still get a stable per-tab correlator, just not across reloads.
    if (!cachedSessionId) {
      cachedSessionId = `sid_mem_${Date.now().toString(36)}`;
    }
    return cachedSessionId;
  }
}

/**
 * Lazy Supabase user-id resolver. Dynamic import keeps this file free of a
 * top-level Supabase dep so SSR bundles / non-auth callers stay lean.
 * The first call kicks off a one-time subscription so subsequent events
 * pick up sign-in/out transitions for free.
 */
function primeUserId() {
  if (typeof window === "undefined" || userIdSubscribed) return;
  userIdSubscribed = true;
  import("@/integrations/supabase/client")
    .then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {
        cachedUserId = data.user?.id ?? null;
      });
      supabase.auth.onAuthStateChange((_evt, session) => {
        cachedUserId = session?.user?.id ?? null;
      });
    })
    .catch(() => {
      cachedUserId = null;
    });
}

/** Test-only hook: reset the module cache. Do NOT call from app code. */
export function __resetAnalyticsForTests() {
  cachedSessionId = null;
  cachedUserId = undefined;
  userIdSubscribed = false;
  lastEventByNamespace.clear();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function trackEvent(name: string, props?: AnalyticsEvent["props"]) {
  if (typeof window === "undefined") return;
  primeUserId();
  const now = Date.now();
  const namespace = name.split(".")[0];
  let prevEventName: string | null = null;
  let prevEventAgeMs: number | null = null;
  if (CORRELATED_NAMESPACES.has(namespace)) {
    const prev = lastEventByNamespace.get(namespace);
    if (prev) {
      prevEventName = prev.name;
      prevEventAgeMs = now - prev.ts;
    }
    // Record AFTER reading so this event becomes context for the next one.
    lastEventByNamespace.set(namespace, { name, ts: now });
  }
  const payload: AnalyticsEvent = {
    name,
    props,
    ts: now,
    sessionId: getSessionId(),
    userId: cachedUserId ?? null,
    path: window.location?.pathname,
    prevEventName,
    prevEventAgeMs,
  };
  try {
    window.dispatchEvent(new CustomEvent("lov:analytics", { detail: payload }));
  } catch {
    /* older browsers — ignore */
  }
  if (import.meta.env.DEV) {
    console.debug("[analytics]", name, {
      sid: payload.sessionId,
      uid: payload.userId,
      path: payload.path,
      prev: payload.prevEventName,
      prevAgeMs: payload.prevEventAgeMs,
      ...(props ?? {}),
    });
  }
}

/**
 * Emit a filter apply/add/change/clear event with a normalized payload.
 * Classifies the action from the previous vs next value so callsites just
 * pass the two values and don't repeat the same branching.
 */
export function trackFilterApply(
  filterKey: string,
  previousValue: string | number | undefined | null,
  nextValue: string | number | undefined | null,
) {
  const wasEmpty = previousValue === undefined || previousValue === null || previousValue === "";
  const isEmpty = nextValue === undefined || nextValue === null || nextValue === "";
  if (wasEmpty && isEmpty) return; // no-op change, don't spam
  if (String(previousValue ?? "") === String(nextValue ?? "")) return;
  const action = wasEmpty ? "add" : isEmpty ? "clear" : "change";
  trackEvent("active_filters.chip_apply", {
    filterKey,
    action,
    valueLen: isEmpty ? 0 : String(nextValue).length,
  });
}

/** Subscribe to every tracked event. Returns an unsubscribe fn. */
export function onAnalyticsEvent(handler: (e: AnalyticsEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent<AnalyticsEvent>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener("lov:analytics", listener);
  return () => window.removeEventListener("lov:analytics", listener);
}
