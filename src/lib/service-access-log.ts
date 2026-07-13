import { useEffect, useState } from "react";

/**
 * Lightweight per-user service access log stored in localStorage.
 * No server round trip — pure client presentation of "recent" activity.
 */
const STORAGE_KEY = "hbspro.services.access-log.v1";
const MAX_ENTRIES = 30;

export type ServiceAccessEntry = {
  id: string;
  ts: number;
  path?: string;
};

function safeRead(): ServiceAccessEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ServiceAccessEntry =>
        !!e && typeof e.id === "string" && typeof e.ts === "number",
    );
  } catch {
    return [];
  }
}

function safeWrite(entries: ServiceAccessEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new Event("hbspro:service-access"));
  } catch {
    /* ignore quota errors */
  }
}

export function recordServiceAccess(id: string, path?: string) {
  const existing = safeRead();
  const entry: ServiceAccessEntry = { id, ts: Date.now(), path };
  safeWrite([entry, ...existing].slice(0, MAX_ENTRIES));
}

export function readAllAccessEntries(): ServiceAccessEntry[] {
  return safeRead();
}

export function readAccessForService(id: string, limit = 10): ServiceAccessEntry[] {
  return safeRead()
    .filter((e) => e.id === id)
    .slice(0, limit);
}

export function useServiceAccessLog(id?: string): ServiceAccessEntry[] {
  const [entries, setEntries] = useState<ServiceAccessEntry[]>([]);
  useEffect(() => {
    const update = () => setEntries(id ? readAccessForService(id) : readAllAccessEntries());
    update();
    const onEvt = () => update();
    window.addEventListener("hbspro:service-access", onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener("hbspro:service-access", onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, [id]);
  return entries;
}

export function clearAccessForService(id: string) {
  safeWrite(safeRead().filter((e) => e.id !== id));
}

export function clearAllAccess() {
  safeWrite([]);
}
