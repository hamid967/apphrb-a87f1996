// @vitest-environment jsdom
/**
 * Integration test for the auctions-reports filters wiring.
 *
 * The full route pulls in TanStack Router, TanStack Query, recharts, jspdf,
 * xlsx, and server functions — booting all of that in jsdom is prohibitive
 * and brittle. Instead we mount a `<Harness />` that reproduces the exact
 * filter surface of the page (URL-as-source-of-truth + `DateRangeFilter`
 * draft persistence + `usePersistedFilters` for status/bidderId) so the
 * assertions genuinely cover the two behaviors we care about:
 *
 *   1. Changing `status` or `bidderId` must NOT reset the DateRangeFilter
 *      draft (unapplied from/to must survive).
 *   2. Remounting the page (in-session navigation away and back) must
 *      restore status/bidderId from sessionStorage.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { usePersistedFilters } from "@/lib/reports/use-persisted-filters";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

const DATE_KEY = "reports:auctions:date-range-draft";
const EXTRAS_KEY = "reports:auctions:extra-filters-draft";

const DEFAULT_FROM = "2026-06-01";
const DEFAULT_TO = "2026-06-30";
const MIN = "2020-01-01";
const MAX = "2026-12-31";

/**
 * Mirrors the auctions reports page's filter wiring. `search` acts as the URL
 * (source of truth); setters replace the applied values just like
 * `navigate({ search })` does in the real route.
 */
function Harness({
  initialStatus = "",
  initialBidderId = "",
}: {
  initialStatus?: string;
  initialBidderId?: string;
}) {
  const [from, setFromApplied] = useState(DEFAULT_FROM);
  const [to, setToApplied] = useState(DEFAULT_TO);
  const [status, setStatus] = useState(initialStatus);
  const [bidderId, setBidderId] = useState(initialBidderId);

  usePersistedFilters(EXTRAS_KEY, { status, bidderId }, (stored) => {
    if (stored.status) setStatus(stored.status);
    if (stored.bidderId) setBidderId(stored.bidderId);
  });

  const clearPersistedFilters = () => {
    setStatus("");
    setBidderId("");
    window.sessionStorage.removeItem(EXTRAS_KEY);
  };

  const hasPersistedExtras = !!status || !!bidderId;

  return (
    <div>
      <DateRangeFilter
        from={from}
        to={to}
        minISO={MIN}
        maxISO={MAX}
        draftStorageKey={DATE_KEY}
        onApply={({ from: f, to: t }) => {
          setFromApplied(f);
          setToApplied(t);
        }}
      />
      <label>
        الحالة
        <select data-testid="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">الكل</option>
          <option value="live">جارٍ</option>
          <option value="ended">منتهي</option>
        </select>
      </label>
      <label>
        المزايد
        <input
          data-testid="bidder"
          value={bidderId}
          onChange={(e) => setBidderId(e.target.value)}
        />
      </label>
      <button
        data-testid="clear-persisted-filters"
        onClick={clearPersistedFilters}
        disabled={!hasPersistedExtras}
      >
        مسح الفلاتر المحفوظة
      </button>
      <output data-testid="applied">{`${from}|${to}|${status}|${bidderId}`}</output>
    </div>
  );
}

beforeEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("Auctions reports — filter persistence integration", () => {
  it("changing status does not reset the DateRangeFilter draft", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const fromInput = screen.getByLabelText("من تاريخ") as HTMLInputElement;
    await user.clear(fromInput);
    await user.type(fromInput, "2026-05-15");
    expect(fromInput.value).toBe("2026-05-15");

    // Change status — this must not disturb the unapplied draft.
    await user.selectOptions(screen.getByTestId("status"), "live");

    expect(fromInput.value).toBe("2026-05-15");
    // Dirty hint still visible ⇒ draft is intact and unapplied.
    expect(screen.getByTestId("date-range-dirty-hint")).toBeInTheDocument();
    // Draft is persisted in sessionStorage.
    expect(window.sessionStorage.getItem(DATE_KEY)).toBe(
      JSON.stringify({ from: "2026-05-15", to: DEFAULT_TO }),
    );
    // Applied from/to are untouched; only status changed.
    expect(screen.getByTestId("applied")).toHaveTextContent(`${DEFAULT_FROM}|${DEFAULT_TO}|live|`);
  });

  it("changing bidderId does not reset the DateRangeFilter draft", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const toInput = screen.getByLabelText("إلى تاريخ") as HTMLInputElement;
    await user.clear(toInput);
    await user.type(toInput, "2026-07-15");

    await user.type(screen.getByTestId("bidder"), "abc-123");

    expect(toInput.value).toBe("2026-07-15");
    expect(screen.getByTestId("date-range-dirty-hint")).toBeInTheDocument();
    expect(window.sessionStorage.getItem(DATE_KEY)).toBe(
      JSON.stringify({ from: DEFAULT_FROM, to: "2026-07-15" }),
    );
    expect(screen.getByTestId("applied")).toHaveTextContent(
      `${DEFAULT_FROM}|${DEFAULT_TO}||abc-123`,
    );
  });

  it("restores status and bidderId from sessionStorage when the page is reopened", async () => {
    const user = userEvent.setup();

    // First mount: user picks filters — persisted automatically.
    const first = render(<Harness />);
    await user.selectOptions(screen.getByTestId("status"), "ended");
    await user.type(screen.getByTestId("bidder"), "xyz-999");

    expect(window.sessionStorage.getItem(EXTRAS_KEY)).toBe(
      JSON.stringify({ status: "ended", bidderId: "xyz-999" }),
    );

    // Simulate navigating away and back — unmount then remount.
    act(() => first.unmount());

    render(<Harness />);

    // Restore effect runs on mount; assert applied state reflects storage.
    const applied = await screen.findByTestId("applied");
    expect(applied).toHaveTextContent(`${DEFAULT_FROM}|${DEFAULT_TO}|ended|xyz-999`);
    expect((screen.getByTestId("status") as HTMLSelectElement).value).toBe("ended");
    expect((screen.getByTestId("bidder") as HTMLInputElement).value).toBe("xyz-999");
  });

  it("does not overwrite fresh URL values with older stored extras", async () => {
    window.sessionStorage.setItem(EXTRAS_KEY, JSON.stringify({ status: "ended", bidderId: "old" }));

    render(<Harness initialStatus="live" initialBidderId="fresh" />);

    // Applied values (which the harness treats as URL) win when non-empty.
    expect(screen.getByTestId("applied")).toHaveTextContent(
      `${DEFAULT_FROM}|${DEFAULT_TO}|live|fresh`,
    );
    // Storage is rewritten to match current applied filters.
    expect(window.sessionStorage.getItem(EXTRAS_KEY)).toBe(
      JSON.stringify({ status: "live", bidderId: "fresh" }),
    );
  });

  it("clicking clear-persisted-filters resets status and bidderId and removes the storage entry", async () => {
    const user = userEvent.setup();

    render(<Harness />);

    // Set some persisted filter values.
    await user.selectOptions(screen.getByTestId("status"), "live");
    await user.type(screen.getByTestId("bidder"), "abc-123");

    expect(window.sessionStorage.getItem(EXTRAS_KEY)).toBe(
      JSON.stringify({ status: "live", bidderId: "abc-123" }),
    );

    // Click the clear button.
    await user.click(screen.getByTestId("clear-persisted-filters"));

    // Applied state resets to defaults.
    expect(screen.getByTestId("applied")).toHaveTextContent(`${DEFAULT_FROM}|${DEFAULT_TO}||`);
    expect((screen.getByTestId("status") as HTMLSelectElement).value).toBe("");
    expect((screen.getByTestId("bidder") as HTMLInputElement).value).toBe("");

    // Storage entry is removed.
    expect(window.sessionStorage.getItem(EXTRAS_KEY)).toBeNull();

    // Clear button is disabled again because there are no persisted extras.
    expect(screen.getByTestId("clear-persisted-filters")).toBeDisabled();
  });

  it("browser back/forward: restores extras and date draft together without triggering apply", async () => {
    const user = userEvent.setup();
    const applySpy = vi.fn();

    // Extended harness: exposes onApply so we can assert Apply never fires
    // during back/forward remounts, and lets us drive applied from/to like a
    // URL change would.
    function NavHarness({
      from: initFrom = DEFAULT_FROM,
      to: initTo = DEFAULT_TO,
      initialStatus = "",
      initialBidderId = "",
    }: {
      from?: string;
      to?: string;
      initialStatus?: string;
      initialBidderId?: string;
    }) {
      const [from, setFromApplied] = useState(initFrom);
      const [to, setToApplied] = useState(initTo);
      const [status, setStatus] = useState(initialStatus);
      const [bidderId, setBidderId] = useState(initialBidderId);
      usePersistedFilters(EXTRAS_KEY, { status, bidderId }, (stored) => {
        if (stored.status) setStatus(stored.status);
        if (stored.bidderId) setBidderId(stored.bidderId);
      });
      return (
        <div>
          <DateRangeFilter
            from={from}
            to={to}
            minISO={MIN}
            maxISO={MAX}
            draftStorageKey={DATE_KEY}
            onApply={({ from: f, to: t }) => {
              applySpy({ from: f, to: t });
              setFromApplied(f);
              setToApplied(t);
            }}
          />
          <select data-testid="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">الكل</option>
            <option value="live">جارٍ</option>
            <option value="ended">منتهي</option>
          </select>
          <input
            data-testid="bidder"
            value={bidderId}
            onChange={(e) => setBidderId(e.target.value)}
          />
          <output data-testid="applied">{`${from}|${to}|${status}|${bidderId}`}</output>
        </div>
      );
    }

    // --- Initial visit: user sets an unapplied date draft + persisted extras.
    const visit1 = render(<NavHarness />);
    const fromInput = screen.getByLabelText("من تاريخ") as HTMLInputElement;
    await user.clear(fromInput);
    await user.type(fromInput, "2026-05-10");
    await user.selectOptions(screen.getByTestId("status"), "live");
    await user.type(screen.getByTestId("bidder"), "abc-123");

    // Draft in storage, extras in storage, apply never called (no click).
    expect(window.sessionStorage.getItem(DATE_KEY)).toBe(
      JSON.stringify({ from: "2026-05-10", to: DEFAULT_TO }),
    );
    expect(window.sessionStorage.getItem(EXTRAS_KEY)).toBe(
      JSON.stringify({ status: "live", bidderId: "abc-123" }),
    );
    expect(applySpy).not.toHaveBeenCalled();

    // --- Navigate away (unmount) then simulate BROWSER BACK to the same URL.
    // The URL/applied values are unchanged, so remount uses the original
    // defaults. Both draft (from storage) and extras (from storage) must be
    // restored in sync, and Apply must NOT fire as a side effect of remount.
    act(() => visit1.unmount());
    render(<NavHarness />);

    const restoredFrom = screen.getByLabelText("من تاريخ") as HTMLInputElement;
    expect(restoredFrom.value).toBe("2026-05-10");
    expect(screen.getByTestId("date-range-dirty-hint")).toBeInTheDocument();
    expect((screen.getByTestId("status") as HTMLSelectElement).value).toBe("live");
    expect((screen.getByTestId("bidder") as HTMLInputElement).value).toBe("abc-123");
    // Applied from/to reflect the URL defaults — the draft did not silently apply.
    expect(screen.getByTestId("applied")).toHaveTextContent(
      `${DEFAULT_FROM}|${DEFAULT_TO}|live|abc-123`,
    );
    expect(applySpy).not.toHaveBeenCalled();

    // --- Simulate BROWSER FORWARD to a different URL (new applied from/to).
    // Applied values changed. On remount, the DateRangeFilter still restores
    // the user's unapplied draft from storage (intentional: an unapplied
    // edit survives navigation), so the draft stays 2026-05-10 while the
    // applied values reflect the new URL. Dirty hint stays visible, and the
    // draft storage entry is preserved. Extras storage is independent and
    // must still be restored on mount, in sync with the date range.
    cleanup();
    render(<NavHarness from="2026-08-01" to="2026-08-31" />);
    const forwardFrom = screen.getByLabelText("من تاريخ") as HTMLInputElement;
    const forwardTo = screen.getByLabelText("إلى تاريخ") as HTMLInputElement;
    // Draft came from storage; applied came from the new URL — they differ.
    expect(forwardFrom.value).toBe("2026-05-10");
    expect(forwardTo.value).toBe(DEFAULT_TO);
    expect(screen.getByTestId("date-range-dirty-hint")).toBeInTheDocument();
    // Draft storage still intact — the unapplied edit was not silently dropped.
    expect(window.sessionStorage.getItem(DATE_KEY)).toBe(
      JSON.stringify({ from: "2026-05-10", to: DEFAULT_TO }),
    );
    // Extras restored from storage in sync with the date-range draft.
    expect((screen.getByTestId("status") as HTMLSelectElement).value).toBe("live");
    expect((screen.getByTestId("bidder") as HTMLInputElement).value).toBe("abc-123");
    expect(screen.getByTestId("applied")).toHaveTextContent(`2026-08-01|2026-08-31|live|abc-123`);
    // And Apply still never fired — restoration is a read, not a write.
    expect(applySpy).not.toHaveBeenCalled();
  });
});
