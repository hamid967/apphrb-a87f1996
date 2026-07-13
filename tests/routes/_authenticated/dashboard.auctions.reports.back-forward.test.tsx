// @vitest-environment jsdom
/**
 * Integration test for URL ↔ ActiveFiltersBar sync on browser back/forward.
 *
 * The real page uses `Route.useSearch()` as the source of truth for
 * from/to/status/bidderId/metric, and `navigate({ search, replace: true })`
 * to write new values. Back/forward navigation replays URL history —
 * `useSearch()` re-renders with the historical values, chips recompute
 * from those values, and the query key changes so `useQuery` refetches.
 *
 * We can't boot the real router in jsdom, so we simulate the URL with a
 * controlled `search` prop and a stack of "history entries". Pushing an
 * entry ≙ apply/remove; go(-1)/go(+1) ≙ browser back/forward.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useRef, useState } from "react";
import { ActiveFiltersBar, type ActiveFilterChip } from "@/components/reports/ActiveFiltersBar";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

type Search = {
  from?: string;
  to?: string;
  status?: string;
  bidderId?: string;
  metric?: "max_amount" | "total_amount";
};

const DEFAULT_FROM = "2026-06-01";
const DEFAULT_TO = "2026-06-30";

/**
 * Mirrors the reports page: URL is source of truth, chips are derived,
 * setters push new history entries, and the query key is a string built
 * from the same fields the real `useQuery` uses.
 */
function Harness({
  initial = {},
  onSetSearch,
}: {
  initial?: Search;
  onSetSearch?: (setter: (s: Search) => void) => void;
}) {
  const [search, setSearchRaw] = useState<Search>(initial);
  const applyCount = useRef(0);

  // Every state change simulates a URL history push; expose the setter so
  // tests can drive back/forward without going through UI.
  const setSearch = (s: Search) => {
    applyCount.current += 1;
    setSearchRaw(s);
  };
  onSetSearch?.(setSearch);

  const from = search.from ?? DEFAULT_FROM;
  const to = search.to ?? DEFAULT_TO;
  const status = search.status ?? "";
  const bidderId = search.bidderId ?? "";
  const metric = search.metric ?? "max_amount";

  const queryKey = `${from}|${to}|${status}|${bidderId}`;

  const chips = useMemo<ActiveFilterChip[]>(() => {
    const list: ActiveFilterChip[] = [];
    if (from !== DEFAULT_FROM || to !== DEFAULT_TO) {
      list.push({
        key: "date",
        label: "التاريخ",
        value: `${from} → ${to}`,
        onRemove: () => setSearch({ ...search, from: undefined, to: undefined }),
      });
    }
    if (status)
      list.push({
        key: "status",
        label: "الحالة",
        value: status,
        onRemove: () => setSearch({ ...search, status: undefined }),
      });
    if (bidderId)
      list.push({
        key: "bidder",
        label: "المزايد",
        value: bidderId,
        onRemove: () => setSearch({ ...search, bidderId: undefined }),
      });
    if (metric !== "max_amount")
      list.push({
        key: "metric",
        label: "المقياس",
        value: "إجمالي",
        onRemove: () => setSearch({ ...search, metric: undefined }),
      });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, status, bidderId, metric]);

  return (
    <div>
      <ActiveFiltersBar chips={chips} onClearAll={() => setSearch({})} />
      <output data-testid="query-key">{queryKey}</output>
      <output data-testid="metric">{metric}</output>
      <output data-testid="chip-count">{String(chips.length)}</output>
    </div>
  );
}

/** Plain history stack — mimics browser back/forward for the `search` prop. */
function createHistory(initial: Search) {
  const stack: Search[] = [initial];
  let idx = 0;
  return {
    push(s: Search) {
      stack.splice(idx + 1);
      stack.push(s);
      idx = stack.length - 1;
    },
    go(delta: -1 | 1) {
      idx = Math.max(0, Math.min(stack.length - 1, idx + delta));
      return stack[idx];
    },
  };
}

beforeEach(() => cleanup());

describe("ActiveFiltersBar × URL back/forward", () => {
  it("chips + queryKey re-derive from URL when history goes back", async () => {
    const user = userEvent.setup();
    let setSearch!: (s: Search) => void;
    const history = createHistory({ status: "live", bidderId: "abc" });

    render(
      <Harness
        initial={{ status: "live", bidderId: "abc" }}
        onSetSearch={(fn) => {
          setSearch = fn;
        }}
      />,
    );

    // Initial state: two chips.
    expect(screen.getByTestId("chip-count")).toHaveTextContent("2");
    expect(screen.getByTestId("query-key")).toHaveTextContent(
      `${DEFAULT_FROM}|${DEFAULT_TO}|live|abc`,
    );

    // User removes status — pushes a new history entry.
    await user.click(screen.getByLabelText("إزالة فلتر الحالة"));
    history.push({ bidderId: "abc" });
    expect(screen.getByTestId("chip-count")).toHaveTextContent("1");
    expect(screen.queryByTestId("active-chip-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("query-key")).toHaveTextContent(`${DEFAULT_FROM}|${DEFAULT_TO}||abc`);

    // Simulate browser BACK: URL reverts to the previous search state.
    act(() => setSearch(history.go(-1)));
    expect(screen.getByTestId("chip-count")).toHaveTextContent("2");
    expect(screen.getByTestId("active-chip-status")).toBeInTheDocument();
    expect(screen.getByTestId("query-key")).toHaveTextContent(
      `${DEFAULT_FROM}|${DEFAULT_TO}|live|abc`,
    );

    // Simulate browser FORWARD: back to the "status removed" state.
    act(() => setSearch(history.go(+1)));
    expect(screen.getByTestId("chip-count")).toHaveTextContent("1");
    expect(screen.queryByTestId("active-chip-status")).not.toBeInTheDocument();
    expect(screen.getByTestId("query-key")).toHaveTextContent(`${DEFAULT_FROM}|${DEFAULT_TO}||abc`);
  });

  it("back after clear-all restores every chip that was active", async () => {
    const user = userEvent.setup();
    let setSearch!: (s: Search) => void;
    const initial: Search = {
      from: "2026-05-01",
      to: "2026-05-15",
      status: "ended",
      bidderId: "xyz",
      metric: "total_amount",
    };
    const history = createHistory(initial);

    render(
      <Harness
        initial={initial}
        onSetSearch={(fn) => {
          setSearch = fn;
        }}
      />,
    );
    expect(screen.getByTestId("chip-count")).toHaveTextContent("4");

    await user.click(screen.getByTestId("active-filters-clear-all"));
    history.push({});
    // All chips gone, bar hidden, defaults restored in the query key.
    expect(screen.queryByTestId("active-filters-bar")).not.toBeInTheDocument();
    expect(screen.getByTestId("query-key")).toHaveTextContent(`${DEFAULT_FROM}|${DEFAULT_TO}||`);
    expect(screen.getByTestId("metric")).toHaveTextContent("max_amount");

    // BACK: every chip returns, metric follows the URL back to total_amount.
    act(() => setSearch(history.go(-1)));
    expect(screen.getByTestId("chip-count")).toHaveTextContent("4");
    expect(screen.getByTestId("active-chip-date")).toBeInTheDocument();
    expect(screen.getByTestId("active-chip-status")).toBeInTheDocument();
    expect(screen.getByTestId("active-chip-bidder")).toBeInTheDocument();
    expect(screen.getByTestId("active-chip-metric")).toBeInTheDocument();
    expect(screen.getByTestId("metric")).toHaveTextContent("total_amount");
    expect(screen.getByTestId("query-key")).toHaveTextContent("2026-05-01|2026-05-15|ended|xyz");
  });

  it("deep-link (initial URL) hydrates chips and query key on first mount", () => {
    render(
      <Harness
        initial={{
          from: "2026-01-01",
          to: "2026-01-31",
          status: "live",
          metric: "total_amount",
        }}
      />,
    );
    // 3 chips: date, status, metric (no bidder).
    expect(screen.getByTestId("chip-count")).toHaveTextContent("3");
    expect(screen.getByTestId("active-chip-date")).toHaveTextContent("2026-01-01 → 2026-01-31");
    expect(screen.getByTestId("active-chip-status")).toBeInTheDocument();
    expect(screen.queryByTestId("active-chip-bidder")).not.toBeInTheDocument();
    expect(screen.getByTestId("active-chip-metric")).toBeInTheDocument();
    expect(screen.getByTestId("query-key")).toHaveTextContent("2026-01-01|2026-01-31|live|");
  });
});
