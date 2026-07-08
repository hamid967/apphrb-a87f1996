// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_STORAGE_KEY,
  readPending,
  stashBatch,
  writePending,
} from "./filter-analytics-pending";
import type { FullEventRow } from "./filter-analytics-codec";

/**
 * Regression suite for the storage-shape upgrade path.
 *
 * The wire codec compresses `FullEventRow` (snake_case, string enums) to
 * `CompactEventRow` (short keys, int-coded enums) to shrink the beacon
 * payload. Before the codec shipped, failed batches were stashed in
 * `localStorage` in the legacy `FullEventRow` shape. Once a user's tab
 * updates to the new build, `readPending` MUST upgrade those legacy
 * batches to the compact shape in place so subsequent drains and beacon
 * fallbacks all speak the same wire format.
 */

const legacyRow: FullEventRow = {
  session_id: "sess-abc",
  event_name: "active_filters.chip_apply",
  filter_key: "status",
  source: "button",
  chip_count: 3,
  remaining: 2,
  distance_px: 0,
  progress: null,
  reached_end: null,
  path: "/dashboard/auctions",
  action: "add",
  prev_event_name: "active_filters.horizontal_scroll",
  prev_event_age_ms: 1200,
};

describe("filter-analytics-pending (storage upgrade)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("reads a legacy batch and upgrades every row to the compact shape", () => {
    // Simulate a pre-codec build having stashed one batch of two events.
    window.localStorage.setItem(
      PENDING_STORAGE_KEY,
      JSON.stringify([[legacyRow, { ...legacyRow, filter_key: "city" }]]),
    );

    const batches = readPending();

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    for (const row of batches[0]) {
      // Compact rows carry `e` and MUST NOT retain any snake_case key.
      expect(row).toHaveProperty("e");
      expect(row).not.toHaveProperty("event_name");
      expect(row).not.toHaveProperty("filter_key");
      expect(row).not.toHaveProperty("prev_event_name");
      // `event_name` "active_filters.chip_apply" maps to code 2.
      expect(row.e).toBe(2);
      // `source: "button"` maps to code 1, `action: "add"` maps to code 1.
      expect(row.o).toBe(1);
      expect(row.a).toBe(1);
    }
    // Filter keys differ between the two rows — must survive the upgrade.
    expect(batches[0][0].f).toBe("status");
    expect(batches[0][1].f).toBe("city");
  });

  it("persists the upgraded shape so a second read finds only compact rows", () => {
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([[legacyRow]]));

    readPending(); // triggers upgrade + write-back

    const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!) as unknown[];
    // If the write-back happened, storage no longer contains any
    // legacy-shaped row — a fresh reader would take the fast path.
    const flat = (stored as unknown[][]).flat();
    for (const row of flat) {
      expect(row).not.toHaveProperty("event_name");
      expect(row).toHaveProperty("e");
    }
  });

  it("does not rewrite storage when every batch is already compact", () => {
    // Pre-seed a compact batch via the normal write path.
    stashBatch([legacyRow]);
    const afterFirstWrite = window.localStorage.getItem(PENDING_STORAGE_KEY);

    // Reading again should be a no-op — no upgrade needed, no re-serialise.
    readPending();
    const afterReRead = window.localStorage.getItem(PENDING_STORAGE_KEY);

    expect(afterReRead).toBe(afterFirstWrite);
  });

  it("upgrades only the legacy batches when storage mixes formats", () => {
    // Belt-and-braces: even though production writes are atomic per-batch,
    // guard against a future release that accidentally intermixes shapes.
    const compactBatch = [{ e: 3, f: "city", o: 1 }]; // chip_remove/button
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([[legacyRow], compactBatch]));

    const batches = readPending();

    expect(batches).toHaveLength(2);
    // Legacy batch — now compact.
    expect(batches[0][0]).not.toHaveProperty("event_name");
    expect(batches[0][0].e).toBe(2);
    // Compact batch — unchanged.
    expect(batches[1][0]).toEqual({ e: 3, f: "city", o: 1 });
  });

  it("returns an empty array and does not throw on corrupt storage", () => {
    window.localStorage.setItem(PENDING_STORAGE_KEY, "{not json");
    expect(readPending()).toEqual([]);
  });

  it("clears storage when writePending is asked to persist an empty array", () => {
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([[legacyRow]]));
    writePending([]);
    expect(window.localStorage.getItem(PENDING_STORAGE_KEY)).toBeNull();
  });
});
