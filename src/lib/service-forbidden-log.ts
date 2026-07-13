import { useEffect, useState } from "react";
import type { AppRole } from "@/lib/service-roles";

/**
 * Separate per-user log for BLOCKED (forbidden) service access attempts.
 * Kept apart from the successful access log so operators can audit which
 * users repeatedly hit walls and which services need role tweaks.
 *
 * Stored in localStorage — no server round trip.
 */
const STORAGE_KEY = "hbspro.services.forbidden-log.v1";
const MAX_ENTRIES = 50;
/** Dedup identical (service, source) attempts inside this window. */
const DEDUP_MS = 30_000;

export type ForbiddenReason =
  | "missing_role"
  | "unavailable"
  | "broken_link"
  | "other";

export type ForbiddenEntry = {
  /** Service catalog id (e.g. "accounting"). */
  id: string;
  /** epoch ms */
  ts: number;
  /** Why access was blocked. */
  reason: ForbiddenReason;
  /** Roles required by the service at the time of the attempt. */
  requiredRoles: AppRole[];
  /** Caller's roles at the time of the attempt. */
  userRoles: AppRole[];
  /** Where the attempt came from: "hub" (card click), "detail" (opened /services/:key), "direct" (deep link). */
  source: "hub" | "detail" | "direct";
  /** Free-form note (e.g. broken route path). */
  note?: string;
};

function safeRead(): ForbiddenEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ForbiddenEntry =>
        !!e &&
        typeof e.id === "string" &&
        typeof e.ts === "number" &&
        typeof e.reason === "string",
    );
  } catch {
    return [];
  }
}

function safeWrite(entries: ForbiddenEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
    window.dispatchEvent(new Event("hbspro:service-forbidden"));
  } catch {
    /* quota ignored */
  }
}

export function recordForbiddenAttempt(entry: Omit<ForbiddenEntry, "ts">) {
  const existing = safeRead();
  const now = Date.now();
  const latest = existing.find((e) => e.id === entry.id && e.source === entry.source);
  if (latest && now - latest.ts < DEDUP_MS) return;
  safeWrite([{ ...entry, ts: now }, ...existing].slice(0, MAX_ENTRIES));
}

export function readForbiddenEntries(): ForbiddenEntry[] {
  return safeRead();
}

export function clearForbiddenLog() {
  safeWrite([]);
}

export function useForbiddenLog(): ForbiddenEntry[] {
  const [entries, setEntries] = useState<ForbiddenEntry[]>([]);
  useEffect(() => {
    const update = () => setEntries(safeRead());
    update();
    const onEvt = () => update();
    window.addEventListener("hbspro:service-forbidden", onEvt);
    window.addEventListener("storage", onEvt);
    return () => {
      window.removeEventListener("hbspro:service-forbidden", onEvt);
      window.removeEventListener("storage", onEvt);
    };
  }, []);
  return entries;
}

export function forbiddenReasonLabel(reason: ForbiddenReason, isAr: boolean): string {
  switch (reason) {
    case "missing_role":
      return isAr ? "لا تملك دورًا مطلوبًا" : "Missing required role";
    case "unavailable":
      return isAr ? "الخدمة معطّلة مؤقتًا" : "Service temporarily disabled";
    case "broken_link":
      return isAr ? "الرابط غير مسجّل" : "Route not registered";
    default:
      return isAr ? "سبب آخر" : "Other";
  }
}
