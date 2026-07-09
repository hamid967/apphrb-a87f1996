/**
 * Client-side history log for assistant script runs.
 * Persists a rolling window of recent executions in localStorage so users
 * can search, replay, and inspect the last result of any script.
 */

export type ScriptRunEntry = {
  id: string;
  name: string;
  args: Record<string, string | number>;
  startedAt: number;
  durationMs: number;
  status: "success" | "error";
  errorMessage?: string;
  /** Snapshot of the last result (may be trimmed when very large). */
  result?: unknown;
};

const KEY = "aqari.assistant.scripts.history.v1";
const MAX_ENTRIES = 100;
const MAX_RESULT_BYTES = 40_000; // ~40KB per entry cap

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadHistory(): ScriptRunEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScriptRunEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: ScriptRunEntry[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new CustomEvent("scripts-history-updated"));
  } catch {
    /* quota — ignore */
  }
}

function trimResult(result: unknown): unknown {
  try {
    const json = JSON.stringify(result);
    if (json.length <= MAX_RESULT_BYTES) return result;
    return { __truncated: true, preview: json.slice(0, MAX_RESULT_BYTES) };
  } catch {
    return undefined;
  }
}

export function recordRun(entry: Omit<ScriptRunEntry, "id">): ScriptRunEntry {
  const full: ScriptRunEntry = {
    id: `${entry.startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    ...entry,
    result: entry.result !== undefined ? trimResult(entry.result) : undefined,
  };
  const current = loadHistory();
  saveHistory([full, ...current]);
  return full;
}

export function clearHistory() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("scripts-history-updated"));
}

export function removeEntry(id: string) {
  saveHistory(loadHistory().filter((e) => e.id !== id));
}

export function findLastFor(name: string): ScriptRunEntry | undefined {
  return loadHistory().find((e) => e.name === name);
}
