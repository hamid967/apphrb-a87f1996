import { supabase } from "@/integrations/supabase/client";

export type IntroTrackedEvent = "shown" | "skipped" | "completed" | "cta_click";

const SESSION_KEY = "hbspro_intro_session_id";
const DEDUPE_KEY = "hbspro_intro_events_sent";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now().toString(36)}`;
  }
}

function alreadySent(event: IntroTrackedEvent, path: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.sessionStorage.getItem(DEDUPE_KEY);
    const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    const key = `${event}|${path}`;
    if (set.has(key)) return true;
    set.add(key);
    window.sessionStorage.setItem(DEDUPE_KEY, JSON.stringify(Array.from(set)));
    return false;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget analytics for intro overlay + landing CTA.
 * Deduped per session so refreshing scenes / re-rendering does not double-count.
 */
export function trackIntroEvent(event: IntroTrackedEvent, path?: string): void {
  if (typeof window === "undefined") return;
  const p = path ?? window.location.pathname ?? "/";
  if (alreadySent(event, p)) return;
  const payload = {
    event,
    path: p.slice(0, 512),
    session_id: getSessionId().slice(0, 128),
    user_agent: (navigator.userAgent ?? "").slice(0, 512),
  };
  void supabase
    .from("intro_events")
    .insert(payload)
    .then(({ error }) => {
      if (error && typeof console !== "undefined") {
        console.debug("[intro-tracker] insert failed", error.message);
      }
    });
}
