// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeFilter, computeQuickRange } from "./DateRangeFilter";

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), message: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const MIN = "2026-01-01";
const MAX = "2026-12-31";

function setup(overrides: Partial<React.ComponentProps<typeof DateRangeFilter>> = {}) {
  const onApply = vi.fn<(next: { from: string; to: string }) => void>();
  const onReset = vi.fn<() => void>();
  const onAnnounce = vi.fn<(text: string) => void>();
  render(
    <DateRangeFilter
      from="2026-03-01"
      to="2026-03-31"
      minISO={MIN}
      maxISO={MAX}
      onApply={onApply}
      onReset={onReset}
      onAnnounce={onAnnounce}
      {...overrides}
    />,
  );
  const fromInput = screen.getByLabelText("من تاريخ") as HTMLInputElement;
  const toInput = screen.getByLabelText("إلى تاريخ") as HTMLInputElement;
  const applyBtn = screen.getByRole("button", { name: "تطبيق" });
  return { fromInput, toInput, applyBtn, onApply, onReset, onAnnounce };
}

beforeEach(() => {
  cleanup();
  toastMock.error.mockClear();
  toastMock.success.mockClear();
  toastMock.message.mockClear();
});

describe("DateRangeFilter — validation on save", () => {
  it("renders inputs with min/max bounds and enables/disables apply based on dirty state", () => {
    const { fromInput, toInput, applyBtn } = setup();
    expect(fromInput.min).toBe(MIN);
    expect(fromInput.max).toBe(MAX);
    expect(toInput.min).toBe(MIN);
    expect(toInput.max).toBe(MAX);
    expect(applyBtn).toBeDisabled();
  });

  it("rejects saving when from is after to and shows an inline error", async () => {
    const user = userEvent.setup();
    const { fromInput, applyBtn, onApply, onAnnounce } = setup();

    await user.clear(fromInput);
    await user.type(fromInput, "2026-06-01");
    await user.click(applyBtn);

    expect(onApply).not.toHaveBeenCalled();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تاريخ البداية يجب ألا يكون بعد تاريخ النهاية");
    expect(fromInput.getAttribute("aria-invalid")).toBe("true");
    expect(fromInput.getAttribute("aria-describedby")).toBe("filter-from-error");
    expect(toastMock.error).toHaveBeenCalledWith(
      "تعذّر تطبيق النطاق",
      expect.objectContaining({ description: expect.stringContaining("تاريخ البداية") }),
    );
    expect(onAnnounce).toHaveBeenCalledWith(expect.stringMatching(/^خطأ:/));
  });

  it("rejects saving when from is before the data lower bound", async () => {
    const user = userEvent.setup();
    const { fromInput, applyBtn, onApply } = setup();

    await user.clear(fromInput);
    await user.type(fromInput, "2025-06-15");
    await user.click(applyBtn);

    expect(onApply).not.toHaveBeenCalled();
    expect(fromInput.getAttribute("aria-invalid")).toBe("true");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("يسبق أقدم بيانات متاحة");
    expect(alert).toHaveTextContent(MIN);
  });

  it("rejects saving when to is a future date beyond maxISO", async () => {
    const user = userEvent.setup();
    const { toInput, applyBtn, onApply } = setup();

    await user.clear(toInput);
    await user.type(toInput, "2027-05-01");
    await user.click(applyBtn);

    expect(onApply).not.toHaveBeenCalled();
    expect(toInput.getAttribute("aria-invalid")).toBe("true");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("لا يمكن أن يكون في المستقبل");
  });

  it("rejects saving when a field is empty", async () => {
    const user = userEvent.setup();
    const { fromInput, applyBtn, onApply } = setup();

    await user.clear(fromInput);
    await user.click(applyBtn);

    expect(onApply).not.toHaveBeenCalled();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("حدد تاريخ البداية");
  });

  it("commits a valid range via onApply and announces success", async () => {
    const user = userEvent.setup();
    const { fromInput, toInput, applyBtn, onApply, onAnnounce } = setup();

    await user.clear(fromInput);
    await user.type(fromInput, "2026-05-10");
    await user.clear(toInput);
    await user.type(toInput, "2026-05-20");
    await user.click(applyBtn);

    expect(onApply).toHaveBeenCalledWith({ from: "2026-05-10", to: "2026-05-20" });
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(onAnnounce).toHaveBeenCalledWith(expect.stringContaining("تم تطبيق النطاق"));
  });

  it("clears the inline error as soon as the user edits the offending field", async () => {
    const user = userEvent.setup();
    const { fromInput, applyBtn } = setup();

    await user.clear(fromInput);
    await user.type(fromInput, "2026-06-01"); // > to (2026-03-31)
    await user.click(applyBtn);
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    // Directly fire a change to a valid in-range value → clears error.
    fireEvent.change(fromInput, { target: { value: "2026-03-05" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fromInput.getAttribute("aria-invalid")).toBe("false");
  });

  it("Enter inside a field triggers apply and validation", async () => {
    const user = userEvent.setup();
    const { fromInput, onApply } = setup();

    await user.clear(fromInput);
    await user.type(fromInput, "2026-06-01"); // invalid: after to
    await user.type(fromInput, "{Enter}");

    expect(onApply).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent("تاريخ البداية");
  });

  it("Reset button calls onReset", async () => {
    const user = userEvent.setup();
    const { onReset } = setup();
    const resetBtn = screen.getByRole("button", { name: "إعادة ضبط النطاق" });
    await user.click(resetBtn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("DateRangeFilter — draft persistence (sessionStorage)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persists unapplied draft values to sessionStorage on change", async () => {
    const user = userEvent.setup();
    const { fromInput } = setup({ draftStorageKey: "test:draft" });

    await user.clear(fromInput);
    await user.type(fromInput, "2026-05-10");

    const raw = window.sessionStorage.getItem("test:draft");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ from: "2026-05-10", to: "2026-03-31" });
  });

  it("restores the stored draft when the component remounts (simulated navigation)", () => {
    window.sessionStorage.setItem(
      "test:draft",
      JSON.stringify({ from: "2026-07-01", to: "2026-07-15" }),
    );
    const { fromInput, toInput, applyBtn } = setup({ draftStorageKey: "test:draft" });
    expect(fromInput.value).toBe("2026-07-01");
    expect(toInput.value).toBe("2026-07-15");
    // Draft differs from applied props → Apply button enabled.
    expect(applyBtn).not.toBeDisabled();
  });

  it("clears the stored draft after applied from/to props change (Apply/Reset)", () => {
    window.sessionStorage.setItem(
      "test:draft",
      JSON.stringify({ from: "2026-07-01", to: "2026-07-15" }),
    );
    const onApply = vi.fn();
    const onReset = vi.fn();
    const onAnnounce = vi.fn();
    const { rerender } = render(
      <DateRangeFilter
        from="2026-03-01"
        to="2026-03-31"
        minISO={MIN}
        maxISO={MAX}
        onApply={onApply}
        onReset={onReset}
        onAnnounce={onAnnounce}
        draftStorageKey="test:draft"
      />,
    );
    // Simulate parent applying a new range.
    rerender(
      <DateRangeFilter
        from="2026-04-01"
        to="2026-04-30"
        minISO={MIN}
        maxISO={MAX}
        onApply={onApply}
        onReset={onReset}
        onAnnounce={onAnnounce}
        draftStorageKey="test:draft"
      />,
    );
    expect(window.sessionStorage.getItem("test:draft")).toBeNull();
  });

  it("clear-draft button resets inputs to applied values and removes sessionStorage entry", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      "test:draft",
      JSON.stringify({ from: "2026-07-01", to: "2026-07-15" }),
    );
    const onAnnounce = vi.fn();
    const { fromInput, toInput, applyBtn } = setup({ draftStorageKey: "test:draft", onAnnounce });
    const clearBtn = screen.getByRole("button", { name: "مسح المسودة" });

    // Draft loaded from storage differs from applied values.
    expect(fromInput.value).toBe("2026-07-01");
    expect(toInput.value).toBe("2026-07-15");
    expect(applyBtn).not.toBeDisabled();

    await user.click(clearBtn);

    // Inputs snap back to applied props.
    expect(fromInput.value).toBe("2026-03-01");
    expect(toInput.value).toBe("2026-03-31");
    // sessionStorage entry removed.
    expect(window.sessionStorage.getItem("test:draft")).toBeNull();
    expect(onAnnounce).toHaveBeenCalledWith("تم مسح المسودة");
    // Apply button disabled because draft now matches applied.
    expect(applyBtn).toBeDisabled();
  });
});

describe("DateRangeFilter — quick range presets", () => {
  beforeEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("computeQuickRange returns stable ISO bounds for a fixed today", () => {
    const today = new Date("2026-07-15T10:00:00Z");
    expect(computeQuickRange("today", today)).toEqual({ from: "2026-07-15", to: "2026-07-15" });
    expect(computeQuickRange("last7", today)).toEqual({ from: "2026-07-09", to: "2026-07-15" });
    expect(computeQuickRange("last30", today)).toEqual({ from: "2026-06-16", to: "2026-07-15" });
    expect(computeQuickRange("last90", today)).toEqual({ from: "2026-04-17", to: "2026-07-15" });
    expect(computeQuickRange("thisMonth", today)).toEqual({ from: "2026-07-01", to: "2026-07-15" });
    expect(computeQuickRange("lastMonth", today)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(computeQuickRange("ytd", today)).toEqual({ from: "2026-01-01", to: "2026-07-15" });
  });

  it("clicking a preset updates the draft only (does not auto-apply)", async () => {
    const { fromInput, toInput, onApply, onAnnounce } = setup();

    const preset = screen.getByRole("button", { name: "آخر 7 أيام" });
    fireEvent.click(preset);

    const expected = computeQuickRange("last7", new Date());
    expect(fromInput.value).toBe(expected.from);
    expect(toInput.value).toBe(expected.to);
    expect(onApply).not.toHaveBeenCalled();
    expect(onAnnounce).toHaveBeenCalledWith("تم اختيار: آخر 7 أيام");
    // Dirty hint appears — user still needs to press Apply.
    expect(screen.getByTestId("date-range-dirty-hint")).toBeInTheDocument();
    // Active preset button reflects aria-pressed=true.
    expect(preset).toHaveAttribute("aria-pressed", "true");
  });

  it("clamps preset bounds to minISO/maxISO", async () => {
    // Use a narrow window that will force clamping regardless of "today".
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const minISO = iso(today);
    const maxISO = iso(today);
    const { fromInput, toInput } = setup({ minISO, maxISO });

    fireEvent.click(screen.getByRole("button", { name: "آخر 30 يومًا" }));

    // Both bounds clamped to the single-day window.
    expect(fromInput.value).toBe(minISO);
    expect(toInput.value).toBe(maxISO);
  });

  it("does not render presets when showPresets={false}", () => {
    setup({ showPresets: false });
    expect(screen.queryByTestId("date-range-presets")).not.toBeInTheDocument();
  });

  it("multiple preset clicks in a row never invoke onApply", async () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole("button", { name: "اليوم" }));
    fireEvent.click(screen.getByRole("button", { name: "آخر 7 أيام" }));
    fireEvent.click(screen.getByRole("button", { name: "هذا الشهر" }));
    fireEvent.click(screen.getByRole("button", { name: "منذ بداية السنة" }));
    expect(onApply).not.toHaveBeenCalled();
    // Dirty hint still visible after all preset changes — no silent apply.
    expect(screen.getByTestId("date-range-dirty-hint")).toBeInTheDocument();
  });

  it("preset then Apply invokes onApply exactly once with the preset values", async () => {
    const user = userEvent.setup();
    const { fromInput, toInput, applyBtn, onApply } = setup();

    fireEvent.click(screen.getByRole("button", { name: "آخر 30 يومًا" }));
    const expected = computeQuickRange("last30", new Date());
    expect(fromInput.value).toBe(expected.from);
    expect(toInput.value).toBe(expected.to);
    // Apply button becomes enabled (draft is dirty).
    expect(applyBtn).not.toBeDisabled();
    // Still no onApply until the user clicks Apply.
    expect(onApply).not.toHaveBeenCalled();

    await user.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ from: expected.from, to: expected.to });
  });

  it("preset → switch to another preset → Apply invokes onApply once with the LATEST preset", async () => {
    const user = userEvent.setup();
    const { applyBtn, onApply } = setup();

    fireEvent.click(screen.getByRole("button", { name: "آخر 7 أيام" }));
    fireEvent.click(screen.getByRole("button", { name: "آخر 90 يومًا" }));
    fireEvent.click(screen.getByRole("button", { name: "هذا الشهر" }));
    expect(onApply).not.toHaveBeenCalled();

    await user.click(applyBtn);
    const expected = computeQuickRange("thisMonth", new Date());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ from: expected.from, to: expected.to });
  });

  it("preset then manual edit then Apply reflects the manual edit, not the preset", async () => {
    const user = userEvent.setup();
    const { fromInput, toInput, applyBtn, onApply } = setup();

    fireEvent.click(screen.getByRole("button", { name: "هذا الشهر" }));
    // Manually override the draft to a value that's inside [MIN, MAX].
    await user.clear(toInput);
    await user.type(toInput, "2026-08-20");
    expect(onApply).not.toHaveBeenCalled();

    await user.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ from: fromInput.value, to: "2026-08-20" });
  });

  it("clicking a preset then Clear draft resets to applied and does not call onApply", async () => {
    const user = userEvent.setup();
    const { fromInput, toInput, onApply } = setup();

    fireEvent.click(screen.getByRole("button", { name: "آخر 7 أيام" }));
    expect(screen.getByTestId("date-range-dirty-hint")).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: "مسح المسودة" });
    await user.click(clearBtn);

    // Draft snapped back to applied props (defaults from setup()).
    expect(fromInput.value).toBe("2026-03-01");
    expect(toInput.value).toBe("2026-03-31");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByTestId("date-range-dirty-hint")).not.toBeInTheDocument();
  });
});

describe("DateRangeFilter — clear date range button", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("resets draft to minISO/maxISO without calling onApply and announces", async () => {
    const user = userEvent.setup();
    const { fromInput, toInput, onApply, onAnnounce } = setup();

    const clearRangeBtn = screen.getByRole("button", { name: "مسح نطاق التاريخ" });
    await user.click(clearRangeBtn);

    expect(fromInput.value).toBe(MIN);
    expect(toInput.value).toBe(MAX);
    expect(onApply).not.toHaveBeenCalled();
    expect(onAnnounce).toHaveBeenCalledWith("تم مسح نطاق التاريخ");
  });

  it("is disabled when draft already equals minISO/maxISO", () => {
    const onApply = vi.fn();
    const onAnnounce = vi.fn();
    render(
      <DateRangeFilter
        from={MIN}
        to={MAX}
        minISO={MIN}
        maxISO={MAX}
        onApply={onApply}
        onAnnounce={onAnnounce}
      />,
    );
    const clearRangeBtn = screen.getByRole("button", { name: "مسح نطاق التاريخ" });
    expect(clearRangeBtn).toBeDisabled();
  });

  it("persisting cleared range to sessionStorage as minISO/maxISO draft", async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(
      "test:draft",
      JSON.stringify({ from: "2026-07-01", to: "2026-07-15" }),
    );
    const { fromInput, toInput } = setup({ draftStorageKey: "test:draft" });

    const clearRangeBtn = screen.getByRole("button", { name: "مسح نطاق التاريخ" });
    await user.click(clearRangeBtn);

    expect(fromInput.value).toBe(MIN);
    expect(toInput.value).toBe(MAX);
    const stored = window.sessionStorage.getItem("test:draft");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual({ from: MIN, to: MAX });
  });

  it("clicking clear range then Apply commits minISO/maxISO", async () => {
    const user = userEvent.setup();
    const { fromInput, toInput, applyBtn, onApply } = setup();

    const clearRangeBtn = screen.getByRole("button", { name: "مسح نطاق التاريخ" });
    await user.click(clearRangeBtn);

    expect(fromInput.value).toBe(MIN);
    expect(toInput.value).toBe(MAX);
    expect(onApply).not.toHaveBeenCalled();

    await user.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ from: MIN, to: MAX });
  });
});
