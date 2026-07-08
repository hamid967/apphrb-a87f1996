// @vitest-environment jsdom
/**
 * Integration test for the ActiveFiltersBar wiring on the auctions-reports
 * page. We reproduce the page's filter surface (URL-as-source-of-truth +
 * DateRangeFilter draft + ActiveFiltersBar) inside a small harness so we
 * can assert the two behaviors the user cares about:
 *
 *   1. Removing a single chip clears ONLY that filter (URL updated, query
 *      key changes ⇒ refetch counter increments).
 *   2. "Clear all" resets every non-default filter in a single tick.
 *
 * Both flows must go straight through the setters — DateRangeFilter's
 * `onApply` must never fire, because chip removal is not an "apply".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { DateRangeFilter } from "@/components/reports/DateRangeFilter";
import { ActiveFiltersBar, type ActiveFilterChip } from "@/components/reports/ActiveFiltersBar";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

const DEFAULT_FROM = "2026-06-01";
const DEFAULT_TO = "2026-06-30";
const MIN = "2020-01-01";
const MAX = "2026-12-31";

/**
 * The `queryKey` counter reflects the exact set of inputs that drive the
 * real `useQuery({ queryKey: [..., from, to, status, bidderId] })` on the
 * page. Whenever it changes, the real page would refetch — asserting the
 * counter increment proves the results list would refresh.
 */
function Harness({ onApplySpy }: { onApplySpy: (v: { from: string; to: string }) => void }) {
  const [from, setFrom] = useState("2026-05-01");
  const [to, setTo] = useState("2026-05-20");
  const [status, setStatus] = useState("live");
  const [bidderId, setBidderId] = useState("bidder-xyz");
  const [trendMetric, setTrendMetric] = useState<"max_amount" | "total_amount">("total_amount");

  const queryKey = `${from}|${to}|${status}|${bidderId}`;

  const chips = useMemo<ActiveFilterChip[]>(() => {
    const list: ActiveFilterChip[] = [];
    if (from !== DEFAULT_FROM || to !== DEFAULT_TO) {
      list.push({
        key: "date",
        label: "التاريخ",
        value: `${from} → ${to}`,
        onRemove: () => {
          setFrom(DEFAULT_FROM);
          setTo(DEFAULT_TO);
        },
      });
    }
    if (status)
      list.push({ key: "status", label: "الحالة", value: status, onRemove: () => setStatus("") });
    if (bidderId)
      list.push({
        key: "bidder",
        label: "المزايد",
        value: bidderId,
        onRemove: () => setBidderId(""),
      });
    if (trendMetric !== "max_amount") {
      list.push({
        key: "metric",
        label: "المقياس",
        value: "إجمالي",
        onRemove: () => setTrendMetric("max_amount"),
      });
    }
    return list;
  }, [from, to, status, bidderId, trendMetric]);

  const clearAll = () => {
    setFrom(DEFAULT_FROM);
    setTo(DEFAULT_TO);
    setStatus("");
    setBidderId("");
    setTrendMetric("max_amount");
  };

  return (
    <div>
      <DateRangeFilter from={from} to={to} minISO={MIN} maxISO={MAX} onApply={onApplySpy} />
      <ActiveFiltersBar chips={chips} onClearAll={clearAll} />
      <output data-testid="query-key">{queryKey}</output>
      <output data-testid="metric">{trendMetric}</output>
    </div>
  );
}

beforeEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("ActiveFiltersBar — E2E integration on auctions reports", () => {
  it("removing the status chip updates only status and triggers a refetch (no onApply)", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApplySpy={onApply} />);

    const before = screen.getByTestId("query-key").textContent;
    expect(before).toBe("2026-05-01|2026-05-20|live|bidder-xyz");

    await user.click(screen.getByLabelText("إزالة فلتر الحالة"));

    // status cleared, everything else preserved ⇒ query key changed ⇒ refetch.
    expect(screen.getByTestId("query-key")).toHaveTextContent("2026-05-01|2026-05-20||bidder-xyz");
    // The date + bidder + metric chips are still present.
    expect(screen.getByTestId("active-chip-date")).toBeInTheDocument();
    expect(screen.getByTestId("active-chip-bidder")).toBeInTheDocument();
    expect(screen.getByTestId("active-chip-metric")).toBeInTheDocument();
    expect(screen.queryByTestId("active-chip-status")).not.toBeInTheDocument();
    // Chip removal is not an "apply" — DateRangeFilter.onApply must NOT fire.
    expect(onApply).not.toHaveBeenCalled();
  });

  it("removing the date chip resets from/to without invoking DateRangeFilter.onApply", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApplySpy={onApply} />);

    await user.click(screen.getByLabelText("إزالة فلتر التاريخ"));

    expect(screen.getByTestId("query-key")).toHaveTextContent(
      `${DEFAULT_FROM}|${DEFAULT_TO}|live|bidder-xyz`,
    );
    expect(screen.queryByTestId("active-chip-date")).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("removing the metric chip does not change the query key (metric is client-only)", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApplySpy={onApply} />);

    const before = screen.getByTestId("query-key").textContent;
    await user.click(screen.getByLabelText("إزالة فلتر المقياس"));

    expect(screen.getByTestId("query-key").textContent).toBe(before);
    expect(screen.getByTestId("metric")).toHaveTextContent("max_amount");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("clear-all resets every non-default filter in one pass and refetches once", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApplySpy={onApply} />);

    // Snapshot the sequence of query-key values so we can count "refetches".
    const observed: string[] = [];
    const key = screen.getByTestId("query-key");
    const mo = new MutationObserver(() => observed.push(key.textContent ?? ""));
    mo.observe(key, { childList: true, characterData: true, subtree: true });

    await user.click(screen.getByTestId("active-filters-clear-all"));
    mo.disconnect();

    expect(screen.getByTestId("query-key")).toHaveTextContent(`${DEFAULT_FROM}|${DEFAULT_TO}||`);
    expect(screen.getByTestId("metric")).toHaveTextContent("max_amount");
    // Bar hides itself once no chips remain.
    expect(screen.queryByTestId("active-filters-bar")).not.toBeInTheDocument();
    // React batches the setters — one commit ⇒ one observed change ⇒ one refetch.
    expect(observed.length).toBe(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("clear-all button only appears with 2+ chips", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<Harness onApplySpy={onApply} />);

    // Remove three chips one by one until only "date" is left.
    await user.click(screen.getByLabelText("إزالة فلتر الحالة"));
    await user.click(screen.getByLabelText("إزالة فلتر المزايد"));
    await user.click(screen.getByLabelText("إزالة فلتر المقياس"));

    expect(screen.getByTestId("active-chip-date")).toBeInTheDocument();
    expect(screen.queryByTestId("active-filters-clear-all")).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
