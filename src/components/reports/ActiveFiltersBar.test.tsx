// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ActiveFiltersBar, type ActiveFilterChip } from "./ActiveFiltersBar";

describe("ActiveFiltersBar", () => {
  afterEach(() => cleanup());

  it("renders nothing when no chips", () => {
    const { container } = render(<ActiveFiltersBar chips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one chip and triggers its onRemove", async () => {
    const onRemove = vi.fn();
    const chips: ActiveFilterChip[] = [{ key: "status", label: "الحالة", value: "جارٍ", onRemove }];
    render(<ActiveFiltersBar chips={chips} />);
    expect(screen.getByTestId("active-chip-status")).toHaveTextContent("جارٍ");
    await userEvent.click(screen.getByLabelText("إزالة فلتر الحالة"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("shows clear-all only when 2+ chips and calls onClearAll", async () => {
    const onClearAll = vi.fn();
    const chips: ActiveFilterChip[] = [
      { key: "a", label: "A", value: "1", onRemove: vi.fn() },
      { key: "b", label: "B", value: "2", onRemove: vi.fn() },
    ];
    const { rerender } = render(<ActiveFiltersBar chips={[chips[0]]} onClearAll={onClearAll} />);
    expect(screen.queryByTestId("active-filters-clear-all")).not.toBeInTheDocument();

    rerender(<ActiveFiltersBar chips={chips} onClearAll={onClearAll} />);
    await userEvent.click(screen.getByTestId("active-filters-clear-all"));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("removing a chip does not remove sibling chips", async () => {
    const onRemoveA = vi.fn();
    const onRemoveB = vi.fn();
    render(
      <ActiveFiltersBar
        chips={[
          { key: "a", label: "A", value: "1", onRemove: onRemoveA },
          { key: "b", label: "B", value: "2", onRemove: onRemoveB },
        ]}
      />,
    );
    await userEvent.click(screen.getByLabelText("إزالة فلتر A"));
    expect(onRemoveA).toHaveBeenCalledTimes(1);
    expect(onRemoveB).not.toHaveBeenCalled();
  });

  describe("keyboard navigation", () => {
    const spy = () => vi.fn<() => void>();
    function makeChips(spies: { a: () => void; b: () => void; c: () => void }): ActiveFilterChip[] {
      return [
        { key: "a", label: "A", value: "1", onRemove: spies.a },
        { key: "b", label: "B", value: "2", onRemove: spies.b },
        { key: "c", label: "C", value: "3", onRemove: spies.c },
      ];
    }

    it("ArrowRight / ArrowLeft roves focus (LTR)", async () => {
      const user = userEvent.setup();
      const spies = { a: spy(), b: spy(), c: spy() };
      render(
        <div dir="ltr">
          <ActiveFiltersBar chips={makeChips(spies)} onClearAll={spy()} />
        </div>,
      );
      const first = screen.getByLabelText(/إزالة فلتر A/);
      first.focus();
      expect(document.activeElement).toBe(first);
      await user.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(screen.getByLabelText(/إزالة فلتر B/));
      await user.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(screen.getByLabelText(/إزالة فلتر C/));
      await user.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(screen.getByLabelText(/إزالة فلتر B/));
    });

    it("ArrowLeft advances forward when direction is RTL", async () => {
      const user = userEvent.setup();
      const spies = { a: spy(), b: spy(), c: spy() };
      render(
        <div dir="rtl">
          <ActiveFiltersBar chips={makeChips(spies)} onClearAll={spy()} />
        </div>,
      );
      screen.getByLabelText(/إزالة فلتر A/).focus();
      await user.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(screen.getByLabelText(/إزالة فلتر B/));
      await user.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(screen.getByLabelText(/إزالة فلتر A/));
    });

    it("Home / End jump to first / last focusable", async () => {
      const user = userEvent.setup();
      const spies = { a: spy(), b: spy(), c: spy() };
      const onClearAll = spy();
      render(<ActiveFiltersBar chips={makeChips(spies)} onClearAll={onClearAll} />);
      screen.getByLabelText(/إزالة فلتر B/).focus();
      await user.keyboard("{End}");
      // Last focusable is the Clear-all button (since chips.length > 1).
      expect(document.activeElement).toBe(screen.getByTestId("active-filters-clear-all"));
      await user.keyboard("{Home}");
      expect(document.activeElement).toBe(screen.getByLabelText(/إزالة فلتر A/));
    });

    it("Delete removes the focused chip and moves focus to the next chip", async () => {
      const user = userEvent.setup();

      // Controlled wrapper so removal actually re-renders the list.
      function Wrapper() {
        const [keys, setKeys] = useState<string[]>(["a", "b", "c"]);
        const chips: ActiveFilterChip[] = keys.map((k) => ({
          key: k,
          label: k.toUpperCase(),
          value: String(k.charCodeAt(0) - 96),
          onRemove: () => setKeys((prev) => prev.filter((x) => x !== k)),
        }));
        return <ActiveFiltersBar chips={chips} />;
      }
      render(<Wrapper />);
      screen.getByLabelText(/إزالة فلتر B/).focus();
      await user.keyboard("{Delete}");
      // B is gone; focus jumped to the button that took its slot (C).
      expect(screen.queryByTestId("active-chip-b")).not.toBeInTheDocument();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      expect(document.activeElement).toBe(screen.getByLabelText(/إزالة فلتر C/));
    });

    it("Backspace on the last chip falls back to the previous chip", async () => {
      const user = userEvent.setup();
      function Wrapper() {
        const [keys, setKeys] = useState<string[]>(["a", "b"]);
        const chips: ActiveFilterChip[] = keys.map((k) => ({
          key: k,
          label: k.toUpperCase(),
          value: String(k.charCodeAt(0) - 96),
          onRemove: () => setKeys((prev) => prev.filter((x) => x !== k)),
        }));
        return <ActiveFiltersBar chips={chips} />;
      }
      render(<Wrapper />);
      screen.getByLabelText(/إزالة فلتر B/).focus();
      await user.keyboard("{Backspace}");
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      expect(screen.queryByTestId("active-chip-b")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByLabelText(/إزالة فلتر A/));
    });
  });
});
