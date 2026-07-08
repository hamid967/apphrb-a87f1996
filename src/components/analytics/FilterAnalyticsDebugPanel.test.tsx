// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterAnalyticsDebugPanel } from "./FilterAnalyticsDebugPanel";
import { PENDING_STORAGE_KEY } from "@/lib/filter-analytics-pending";
import type { FullEventRow } from "@/lib/filter-analytics-codec";

// The drain path calls the auth-guarded server fn. In jsdom there's no
// bearer token / network, so stub it with a resolved promise — the
// assertions here are about the panel's UI feedback loop, not the
// server ingest behavior (which has its own tests).
const ingestMock = vi.fn(async (_args: unknown) => ({ ok: true }));
vi.mock("@/lib/filter-analytics.functions", () => ({
  ingestFilterAnalytics: (args: unknown) => ingestMock(args),
}));

/**
 * Component test for the diagnostics counter.
 *
 * Guards the visible feedback loop the debug overlay gives when a build
 * ships the compact codec: after clicking `upgrade` the counter's
 * "قديمة" (legacy) reading must drop to 0, proving the in-place
 * `readPending()` upgrade actually mutated storage and the panel
 * re-rendered from the fresh snapshot.
 */

const DEBUG_KEY = "lov:debug:filters";

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
  prev_event_name: null,
  prev_event_age_ms: null,
};

describe("FilterAnalyticsDebugPanel — pending counter upgrade", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Force the panel into its active state without depending on URL parsing.
    window.localStorage.setItem(DEBUG_KEY, "1");
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    ingestMock.mockClear();
  });

  it("moves from قديمة=1 to قديمة=0 after clicking upgrade", async () => {
    // Seed one legacy batch — the pre-codec on-disk shape.
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([[legacyRow]]));

    render(<FilterAnalyticsDebugPanel />);

    // Panel mounts, then its useEffect populates the "before" snapshot.
    // Flushing microtasks + effects in one act() cycle is enough — no
    // network, no timers involved in the initial paint.
    await act(async () => {});

    const beforeRow = await screen.findByTestId("pending-counter-before");
    expect(beforeRow.textContent).toMatch(/قديمة=1/);
    expect(beforeRow.textContent).toMatch(/مضغوطة=0/);
    // Sanity: the "after" row only appears once the user runs the upgrade.
    expect(screen.queryByTestId("pending-counter-after")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));

    const afterRow = await screen.findByTestId("pending-counter-after");
    expect(afterRow.textContent).toMatch(/قديمة=0/);
    expect(afterRow.textContent).toMatch(/مضغوطة=1/);

    // The "before" row is intentionally frozen to the pre-upgrade
    // snapshot so the transition stays visible on screen — it's the
    // "after" row that proves storage was actually rewritten.
    expect(screen.getByTestId("pending-counter-before").textContent).toMatch(/قديمة=1/);
  });

  it("moves from قديمة=3 to قديمة=0 after clicking upgrade with multiple legacy batches", async () => {
    // Seed three legacy batches with varying sizes so the aggregate
    // event count (1 + 2 + 3 = 6) is a distinct signal from the batch
    // count — proves the counter aggregates across batches, not just
    // sniffs the first one.
    const batches = [
      [legacyRow],
      [legacyRow, { ...legacyRow, action: "remove" as const }],
      [
        legacyRow,
        { ...legacyRow, action: "remove" as const },
        { ...legacyRow, source: "keyboard" as const },
      ],
    ];
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(batches));

    render(<FilterAnalyticsDebugPanel />);
    await act(async () => {});

    const beforeRow = await screen.findByTestId("pending-counter-before");
    expect(beforeRow.textContent).toMatch(/batches=3/);
    expect(beforeRow.textContent).toMatch(/events=6/);
    expect(beforeRow.textContent).toMatch(/قديمة=3/);
    expect(beforeRow.textContent).toMatch(/مضغوطة=0/);

    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));

    const afterRow = await screen.findByTestId("pending-counter-after");
    expect(afterRow.textContent).toMatch(/batches=3/);
    expect(afterRow.textContent).toMatch(/events=6/);
    expect(afterRow.textContent).toMatch(/قديمة=0/);
    expect(afterRow.textContent).toMatch(/مضغوطة=3/);
  });

  it("shows the corrupt marker and safely handles malformed storage on upgrade", async () => {
    // Not valid JSON at all — `inspectPending` should flag `corrupt`
    // and `readPending` (invoked by the upgrade button) must swallow
    // the parse error instead of throwing into React.
    window.localStorage.setItem(PENDING_STORAGE_KEY, "{not json");

    render(<FilterAnalyticsDebugPanel />);
    await act(async () => {});

    const beforeRow = await screen.findByTestId("pending-counter-before");
    expect(beforeRow.textContent).toMatch(/corrupt/);
    expect(beforeRow.textContent).toMatch(/batches=0/);
    expect(beforeRow.textContent).toMatch(/قديمة=0/);
    expect(beforeRow.textContent).toMatch(/مضغوطة=0/);

    // The upgrade button is disabled when totalBatches === 0, which is
    // the safe UX for corrupt storage — nothing to upgrade, so nothing
    // to run. `userEvent.click` on a disabled button is a no-op and
    // must not throw. This also proves the panel didn't crash on
    // render with corrupt data.
    const upgradeBtn = screen.getByRole("button", { name: /upgrade/i });
    expect((upgradeBtn as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(upgradeBtn);

    // No "after" row should appear — runUpgrade never fired.
    expect(screen.queryByTestId("pending-counter-after")).toBeNull();

    // Panel still alive, corrupt marker still visible.
    expect(screen.getByTestId("pending-counter-before").textContent).toMatch(/corrupt/);
    expect(screen.getByTestId("filter-analytics-debug")).toBeTruthy();
  });

  it("drains multiple legacy batches and shows the live drain result", async () => {
    // Three legacy batches, 1 + 2 + 3 = 6 events. After clicking
    // "drain now" every batch should be handed to the (mocked) ingest
    // fn, the result row should report sent=3 / events=6 / remaining=0,
    // and the "before" snapshot should refresh to empty storage.
    const batches = [
      [legacyRow],
      [legacyRow, { ...legacyRow, action: "remove" as const }],
      [
        legacyRow,
        { ...legacyRow, action: "remove" as const },
        { ...legacyRow, source: "keyboard" as const },
      ],
    ];
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(batches));

    render(<FilterAnalyticsDebugPanel />);
    await act(async () => {});

    const beforeRow = await screen.findByTestId("pending-counter-before");
    expect(beforeRow.textContent).toMatch(/batches=3/);
    expect(beforeRow.textContent).toMatch(/قديمة=3/);

    await userEvent.click(screen.getByRole("button", { name: /drain now/i }));

    // Drain result row appears with aggregate counts.
    const drainRow = await screen.findByTestId("pending-drain-result");
    expect(drainRow.textContent).toMatch(/sent=3 batches/);
    expect(drainRow.textContent).toMatch(/6 events/);
    expect(drainRow.textContent).toMatch(/remaining=0/);
    expect(drainRow.textContent).not.toMatch(/error:/);

    // Ingest was called once per batch.
    expect(ingestMock).toHaveBeenCalledTimes(3);

    // Storage should be empty and the "before" counter refreshed.
    expect(window.localStorage.getItem(PENDING_STORAGE_KEY)).toBeNull();
    const refreshedBefore = screen.getByTestId("pending-counter-before");
    expect(refreshedBefore.textContent).toMatch(/batches=0/);
    expect(refreshedBefore.textContent).toMatch(/events=0/);
    expect(refreshedBefore.textContent).toMatch(/قديمة=0/);
    expect(refreshedBefore.textContent).toMatch(/مضغوطة=0/);
  });

  it("keeps the before row frozen while the after row reflects the upgrade, across multiple legacy batches", async () => {
    // 4 legacy batches totalling 9 events (1 + 2 + 2 + 4). The upgrade rewrites
    // storage in place — after the click the raw JSON is fully
    // compact, but the "before" row must stay pinned to the
    // pre-upgrade snapshot (قديمة=4) so the visible transition
    // remains legible on screen. This is the invariant `runUpgrade`
    // enforces by calling `inspectPending()` BEFORE `readPending()`.
    const batches = [
      [legacyRow],
      [legacyRow, { ...legacyRow, action: "remove" as const }],
      [legacyRow, { ...legacyRow, source: "keyboard" as const }],
      [
        legacyRow,
        { ...legacyRow, action: "remove" as const },
        { ...legacyRow, source: "keyboard" as const },
        { ...legacyRow, source: "url" as const },
      ],
    ];
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(batches));

    render(<FilterAnalyticsDebugPanel />);
    await act(async () => {});

    const beforeRow = await screen.findByTestId("pending-counter-before");
    const beforeTextPreClick = beforeRow.textContent ?? "";
    expect(beforeTextPreClick).toMatch(/batches=4/);
    expect(beforeTextPreClick).toMatch(/events=9/);
    expect(beforeTextPreClick).toMatch(/قديمة=4/);
    expect(beforeTextPreClick).toMatch(/مضغوطة=0/);

    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));

    // "after" row reflects the fully-upgraded storage.
    const afterRow = await screen.findByTestId("pending-counter-after");
    expect(afterRow.textContent).toMatch(/batches=4/);
    expect(afterRow.textContent).toMatch(/events=9/);
    expect(afterRow.textContent).toMatch(/قديمة=0/);
    expect(afterRow.textContent).toMatch(/مضغوطة=4/);

    // "before" row is byte-identical to its pre-click snapshot — it
    // did NOT re-read storage after the mutation. This is the whole
    // point of the freeze.
    const beforeTextPostClick = screen.getByTestId("pending-counter-before").textContent ?? "";
    expect(beforeTextPostClick).toBe(beforeTextPreClick);
    expect(beforeTextPostClick).toMatch(/قديمة=4/);
    expect(beforeTextPostClick).not.toMatch(/قديمة=0/);
  });

  it("refresh button re-reads localStorage in sync with current state, before and after upgrade", async () => {
    // Start with 1 legacy batch. The panel's polling interval fires
    // every 2s, so within a single userEvent tick the "before" row
    // stays stale — that's exactly what makes `refresh` observable.
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([[legacyRow]]));

    render(<FilterAnalyticsDebugPanel />);
    await act(async () => {});

    const before = () => screen.getByTestId("pending-counter-before");
    expect(before().textContent).toMatch(/batches=1/);
    expect(before().textContent).toMatch(/قديمة=1/);

    // Simulate another tab / the flusher stashing 2 more legacy batches.
    window.localStorage.setItem(
      PENDING_STORAGE_KEY,
      JSON.stringify([
        [legacyRow],
        [legacyRow, { ...legacyRow, action: "remove" as const }],
        [legacyRow],
      ]),
    );

    // Row is still stale — no polling has fired inside this tick.
    expect(before().textContent).toMatch(/batches=1/);

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    // Refresh pulled the fresh snapshot from storage.
    expect(before().textContent).toMatch(/batches=3/);
    expect(before().textContent).toMatch(/events=4/);
    expect(before().textContent).toMatch(/قديمة=3/);

    // Now upgrade → after row appears, before row freezes to the
    // pre-upgrade snapshot (3 legacy batches).
    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));

    const afterRow = await screen.findByTestId("pending-counter-after");
    expect(afterRow.textContent).toMatch(/قديمة=0/);
    expect(afterRow.textContent).toMatch(/مضغوطة=3/);
    expect(before().textContent).toMatch(/قديمة=3/); // frozen

    // Storage is now compact. Simulate a fresh legacy batch arriving
    // after the upgrade (e.g. an old tab flushing) and confirm refresh
    // picks up the mixed state while `after` stays untouched.
    const compactJson = window.localStorage.getItem(PENDING_STORAGE_KEY);
    expect(compactJson).not.toBeNull();
    const compactBatches = JSON.parse(compactJson as string);
    window.localStorage.setItem(
      PENDING_STORAGE_KEY,
      JSON.stringify([...compactBatches, [legacyRow]]),
    );

    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(before().textContent).toMatch(/batches=4/);
    expect(before().textContent).toMatch(/قديمة=1/);
    expect(before().textContent).toMatch(/مضغوطة=3/);
    // After row is unchanged — only upgrade rewrites it.
    expect(screen.getByTestId("pending-counter-after").textContent).toMatch(/مضغوطة=3/);
    expect(screen.getByTestId("pending-counter-after").textContent).toMatch(/قديمة=0/);
  });

  it("refresh updates only the before row and leaves the after row visually stable across multiple clicks", async () => {
    // Seed 2 legacy batches, upgrade to snapshot the "after" row,
    // then hammer refresh while mutating storage between clicks —
    // the "after" row must stay byte-identical the entire time so
    // the overlay never flickers.
    window.localStorage.setItem(
      PENDING_STORAGE_KEY,
      JSON.stringify([[legacyRow], [legacyRow, { ...legacyRow, action: "remove" as const }]]),
    );

    render(<FilterAnalyticsDebugPanel />);
    await act(async () => {});

    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));

    const afterRow = await screen.findByTestId("pending-counter-after");
    const afterTextSnapshot = afterRow.textContent ?? "";
    expect(afterTextSnapshot).toMatch(/batches=2/);
    expect(afterTextSnapshot).toMatch(/قديمة=0/);
    expect(afterTextSnapshot).toMatch(/مضغوطة=2/);

    const before = () => screen.getByTestId("pending-counter-before");
    const readAfter = () => screen.getByTestId("pending-counter-after").textContent ?? "";

    // --- Mutation 1: add one legacy batch, refresh, verify. ---
    const compact = JSON.parse(window.localStorage.getItem(PENDING_STORAGE_KEY) as string);
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([...compact, [legacyRow]]));
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(before().textContent).toMatch(/batches=3/);
    expect(before().textContent).toMatch(/قديمة=1/);
    expect(before().textContent).toMatch(/مضغوطة=2/);
    // After row unchanged, byte-for-byte.
    expect(readAfter()).toBe(afterTextSnapshot);

    // --- Mutation 2: clear storage entirely, refresh, verify. ---
    window.localStorage.removeItem(PENDING_STORAGE_KEY);
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(before().textContent).toMatch(/batches=0/);
    expect(before().textContent).toMatch(/events=0/);
    // Still unchanged — even when storage is empty, the frozen
    // post-upgrade evidence stays on screen.
    expect(readAfter()).toBe(afterTextSnapshot);

    // --- Mutation 3: seed two fresh legacy batches, refresh, verify. ---
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([[legacyRow], [legacyRow]]));
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(before().textContent).toMatch(/batches=2/);
    expect(before().textContent).toMatch(/قديمة=2/);
    expect(readAfter()).toBe(afterTextSnapshot);
  });

  it("rapid refresh clicks only mutate the before row while after stays byte-stable, even as storage changes between clicks", async () => {
    // Seed → upgrade → snapshot the "after" row. Then fire a burst
    // of `refresh` clicks with a storage mutation before each one,
    // and after each click assert `before` reflects the current
    // storage and `after` is still byte-identical to the snapshot.
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([[legacyRow], [legacyRow]]));

    render(<FilterAnalyticsDebugPanel />);
    await act(async () => {});

    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));
    const afterSnapshot = (await screen.findByTestId("pending-counter-after")).textContent ?? "";
    expect(afterSnapshot).toMatch(/batches=2/);
    expect(afterSnapshot).toMatch(/مضغوطة=2/);

    const before = () => screen.getByTestId("pending-counter-before").textContent ?? "";
    const after = () => screen.getByTestId("pending-counter-after").textContent ?? "";
    const refreshBtn = screen.getByRole("button", { name: /refresh/i });

    // Each step: (storage mutation, expected before contents). We
    // mutate storage inside a queueMicrotask before the click so the
    // sequence stays back-to-back with no artificial spacing — the
    // point is that even without any wait, `after` never budges.
    const steps: Array<{ setup: () => void; expect: RegExp[] }> = [
      {
        setup: () =>
          window.localStorage.setItem(
            PENDING_STORAGE_KEY,
            JSON.stringify([[legacyRow], [legacyRow], [legacyRow]]),
          ),
        expect: [/batches=3/, /قديمة=3/, /مضغوطة=0/],
      },
      {
        setup: () => window.localStorage.removeItem(PENDING_STORAGE_KEY),
        expect: [/batches=0/, /events=0/, /قديمة=0/, /مضغوطة=0/],
      },
      {
        setup: () =>
          window.localStorage.setItem(
            PENDING_STORAGE_KEY,
            JSON.stringify([[legacyRow, legacyRow, legacyRow, legacyRow]]),
          ),
        expect: [/batches=1/, /events=4/, /قديمة=1/, /مضغوطة=0/],
      },
      {
        setup: () => window.localStorage.setItem(PENDING_STORAGE_KEY, "{bad"),
        expect: [/corrupt/, /batches=0/],
      },
      {
        setup: () =>
          window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([[legacyRow]])),
        expect: [/batches=1/, /قديمة=1/, /مضغوطة=0/],
      },
    ];

    for (const step of steps) {
      step.setup();
      await userEvent.click(refreshBtn);
      for (const re of step.expect) {
        expect(before()).toMatch(re);
      }
      // Byte-stability check runs on every single click — no drift
      // allowed across the whole burst.
      expect(after()).toBe(afterSnapshot);
    }
  });
});
