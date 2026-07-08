/**
 * localStorage helpers for the ActiveFiltersBar analytics retry queue.
 *
 * Extracted from `FilterAnalyticsFlusher` so the storage-shape upgrade
 * path (legacy uncompressed → compact codec) is covered by unit tests
 * without pulling in the whole React component graph.
 *
 * Storage shape: `CompactEventRow[][]` — an array of batches, each an
 * array of compact rows (see `filter-analytics-codec.ts`). Rows written
 * by builds before the codec shipped are in the uncompressed
 * `FullEventRow` shape (`event_name`, `filter_key`, …); `readPending`
 * detects that shape on read and upgrades the whole batch in place so
 * no drain path ever sees a mixed format.
 */
import {
  decodeBatch,
  encodeBatch,
  type CompactEventRow,
  type FullEventRow,
} from "@/lib/filter-analytics-codec";

export const PENDING_STORAGE_KEY = "aqari.filterAnalytics.pending.v1";
export const MAX_PENDING_BATCHES = 20;
export const MAX_PENDING_EVENTS = 400;

/**
 * Heuristic: legacy uncompressed rows always carry the `event_name`
 * string key; compact rows carry `e` instead. Cheapest reliable
 * discriminator without adding a schema tag to storage.
 */
export function isLegacyRow(row: unknown): row is FullEventRow {
  return (
    typeof row === "object" && row !== null && "event_name" in (row as Record<string, unknown>)
  );
}

export function readPending(): CompactEventRow[][] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let upgraded = false;
    const batches: CompactEventRow[][] = parsed.map((batch: unknown): CompactEventRow[] => {
      if (!Array.isArray(batch)) return [];
      // A batch is either fully legacy or fully compact — they're
      // written atomically. Sniff the first row and upgrade the whole
      // batch in one pass.
      if (batch.length > 0 && isLegacyRow(batch[0])) {
        upgraded = true;
        return encodeBatch(batch as FullEventRow[]);
      }
      return batch as CompactEventRow[];
    });
    // Persist the upgraded shape immediately so subsequent reads (and
    // any future storage-quota trimming) operate on the compact form.
    if (upgraded) writePending(batches);
    return batches;
  } catch {
    return [];
  }
}

export function writePending(batches: CompactEventRow[][]): void {
  if (typeof window === "undefined") return;
  try {
    // Trim from the oldest first when we exceed the cap.
    let total = batches.reduce((n, b) => n + b.length, 0);
    while (batches.length > MAX_PENDING_BATCHES || total > MAX_PENDING_EVENTS) {
      const dropped = batches.shift();
      if (!dropped) break;
      total -= dropped.length;
    }
    if (!batches.length) {
      window.localStorage.removeItem(PENDING_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(batches));
  } catch {
    /* quota / disabled storage — silently drop */
  }
}

/**
 * Stash a batch for later retry. Always encoded to the compact wire
 * shape before persisting.
 */
export function stashBatch(batch: FullEventRow[]): void {
  if (!batch.length) return;
  const pending = readPending();
  pending.push(encodeBatch(batch));
  writePending(pending);
}

/**
 * Snapshot of the pending-batches storage *without* mutating it. Reads
 * the raw JSON, classifies each batch as `legacy` (rows have
 * `event_name`) or `compact` (rows have `e`), and returns aggregate
 * counts. Used by the debug panel to show the state before / after
 * `readPending` runs its in-place upgrade.
 */
export type PendingSnapshot = {
  totalBatches: number;
  totalEvents: number;
  legacyBatches: number;
  legacyEvents: number;
  compactBatches: number;
  compactEvents: number;
  /** True when the raw JSON was malformed. */
  corrupt: boolean;
};

export function inspectPending(): PendingSnapshot {
  const empty: PendingSnapshot = {
    totalBatches: 0,
    totalEvents: 0,
    legacyBatches: 0,
    legacyEvents: 0,
    compactBatches: 0,
    compactEvents: 0,
    corrupt: false,
  };
  if (typeof window === "undefined") return empty;
  const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
  if (!raw) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...empty, corrupt: true };
  }
  if (!Array.isArray(parsed)) return { ...empty, corrupt: true };
  const snap = { ...empty };
  for (const batch of parsed) {
    if (!Array.isArray(batch) || batch.length === 0) continue;
    snap.totalBatches += 1;
    snap.totalEvents += batch.length;
    if (isLegacyRow(batch[0])) {
      snap.legacyBatches += 1;
      snap.legacyEvents += batch.length;
    } else {
      snap.compactBatches += 1;
      snap.compactEvents += batch.length;
    }
  }
  return snap;
}

export type DrainResult = {
  sentBatches: number;
  sentEvents: number;
  remainingBatches: number;
  /** Present when a batch failed — the loop stops at the first failure. */
  error?: string;
};

/**
 * Framework-agnostic drain: iterates stashed batches one at a time,
 * decodes each to the full DB row shape, and hands it to the caller's
 * `ingest` function. A failure leaves the batch at the head of the queue
 * (nothing is lost) and stops the loop — subsequent triggers (online
 * event, auth change, manual drain) will retry.
 *
 * Shared by the flusher's automatic drain path and the debug panel's
 * "drain now" button so both see identical behavior.
 */
export async function drainPending(
  ingest: (events: FullEventRow[]) => Promise<unknown>,
): Promise<DrainResult> {
  const startSnap = inspectPending();
  const result: DrainResult = {
    sentBatches: 0,
    sentEvents: 0,
    remainingBatches: startSnap.totalBatches,
  };
  let pending = readPending(); // upgrades legacy in place as a side effect
  while (pending.length) {
    const [next, ...rest] = pending;
    try {
      await ingest(decodeBatch(next));
      result.sentBatches += 1;
      result.sentEvents += next.length;
      pending = rest;
      writePending(pending);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      break;
    }
  }
  result.remainingBatches = pending.length;
  return result;
}
