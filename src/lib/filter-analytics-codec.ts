/**
 * Compact wire format for the ActiveFiltersBar analytics beacon.
 *
 * A typical batch has 10-20 rows and each row's snake_case keys +
 * `active_filters.` prefix add ~60-80% overhead vs the actual values.
 * On mobile networks (and inside a `sendBeacon` payload capped at 64 KB
 * per origin) that overhead is real bandwidth we can trim.
 *
 * The codec:
 * - Renames every key to a 1-2 char alias.
 * - Encodes closed enums (`event_name`, `source`, `action`,
 *   `prev_event_name`) as small integers.
 * - Drops null / undefined fields entirely — the server treats missing
 *   keys as null, matching the DB column defaults.
 *
 * Shared by the client flusher and the beacon route so both sides agree
 * on the schema. Kept pure (no browser / Node APIs) so it can run in a
 * Cloudflare Worker.
 */

export const EVENT_NAMES: readonly string[] = [
  "active_filters.chip_add",
  "active_filters.chip_apply",
  "active_filters.chip_remove",
  "active_filters.clear_all",
  "active_filters.horizontal_scroll",
  "active_filters.swipe_reveal",
  "active_filters.swipe_abort",
  "active_filters.swipe_cancel",
  "active_filters.swipe_confirm",
];

export const SOURCES: readonly string[] = ["button", "keyboard", "swipe"];
export const ACTIONS: readonly string[] = ["add", "change", "remove"];

const EVENT_INDEX = new Map(EVENT_NAMES.map((n, i) => [n, i + 1]));
const SOURCE_INDEX = new Map(SOURCES.map((n, i) => [n, i + 1]));
const ACTION_INDEX = new Map(ACTIONS.map((n, i) => [n, i + 1]));

/** Full DB row shape. Every field except `event_name` is optional. */
export type FullEventRow = {
  session_id?: string | null;
  event_name: string;
  filter_key?: string | null;
  source?: string | null;
  chip_count?: number | null;
  remaining?: number | null;
  distance_px?: number | null;
  progress?: number | null;
  reached_end?: boolean | null;
  path?: string | null;
  action?: string | null;
  prev_event_name?: string | null;
  prev_event_age_ms?: number | null;
};

/**
 * Compact on-the-wire shape. Only fields present in the source row are
 * emitted; consumers must default missing keys to `null`.
 *
 * Key legend:
 *   s  session_id           e  event_name (int code, see EVENT_NAMES)
 *   f  filter_key           o  source     (int code, see SOURCES)
 *   c  chip_count           r  remaining
 *   d  distance_px          p  progress
 *   x  reached_end (0/1)    u  path
 *   a  action     (int code, see ACTIONS)
 *   pe prev_event_name (int code)
 *   pa prev_event_age_ms
 */
export type CompactEventRow = {
  s?: string;
  e: number | string; // int code, or raw name if unknown to the enum
  f?: string;
  o?: number | string;
  c?: number;
  r?: number;
  d?: number;
  p?: number;
  x?: 0 | 1;
  u?: string;
  a?: number | string;
  pe?: number | string;
  pa?: number;
};

function nn<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

export function encodeEvent(row: FullEventRow): CompactEventRow {
  const out: CompactEventRow = {
    // Fall back to the raw string if we don't recognise the enum value —
    // safer than losing the event when a new event_name ships client-side
    // before the codec is redeployed.
    e: EVENT_INDEX.get(row.event_name) ?? row.event_name,
  };
  if (nn(row.session_id)) out.s = row.session_id;
  if (nn(row.filter_key)) out.f = row.filter_key;
  if (nn(row.source)) out.o = SOURCE_INDEX.get(row.source) ?? row.source;
  if (nn(row.chip_count)) out.c = row.chip_count;
  if (nn(row.remaining)) out.r = row.remaining;
  if (nn(row.distance_px)) out.d = row.distance_px;
  if (nn(row.progress)) out.p = row.progress;
  if (nn(row.reached_end)) out.x = row.reached_end ? 1 : 0;
  if (nn(row.path)) out.u = row.path;
  if (nn(row.action)) out.a = ACTION_INDEX.get(row.action) ?? row.action;
  if (nn(row.prev_event_name)) {
    out.pe = EVENT_INDEX.get(row.prev_event_name) ?? row.prev_event_name;
  }
  if (nn(row.prev_event_age_ms)) out.pa = row.prev_event_age_ms;
  return out;
}

export function encodeBatch(rows: FullEventRow[]): CompactEventRow[] {
  return rows.map(encodeEvent);
}

function decodeEnum(v: number | string | undefined, table: readonly string[]): string | null {
  if (v === undefined) return null;
  if (typeof v === "string") return v; // forward-compat: unknown code sent raw
  if (v >= 1 && v <= table.length) return table[v - 1];
  return null;
}

export function decodeEvent(row: CompactEventRow): FullEventRow {
  const eventName =
    typeof row.e === "string"
      ? row.e
      : row.e >= 1 && row.e <= EVENT_NAMES.length
        ? EVENT_NAMES[row.e - 1]
        : "active_filters.unknown";
  return {
    session_id: row.s ?? null,
    event_name: eventName,
    filter_key: row.f ?? null,
    source: decodeEnum(row.o, SOURCES),
    chip_count: row.c ?? null,
    remaining: row.r ?? null,
    distance_px: row.d ?? null,
    progress: row.p ?? null,
    reached_end: row.x === undefined ? null : row.x === 1,
    path: row.u ?? null,
    action: decodeEnum(row.a, ACTIONS),
    prev_event_name: decodeEnum(row.pe, EVENT_NAMES),
    prev_event_age_ms: row.pa ?? null,
  };
}

export function decodeBatch(rows: CompactEventRow[]): FullEventRow[] {
  return rows.map(decodeEvent);
}
