// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { EdgeHandles, type EdgeHandlesScale } from "./EdgeHandles";

// Build a fake band scale over an inclusive date-string domain.
function makeScale(domain: string[]): EdgeHandlesScale {
  const bw = 20;
  const scale = ((v: string) => {
    const i = domain.indexOf(v);
    return i < 0 ? undefined : i * bw;
  }) as EdgeHandlesScale;
  scale.domain = () => domain;
  scale.bandwidth = () => bw;
  return scale;
}

const DOMAIN = [
  "2026-01-01",
  "2026-01-02",
  "2026-01-03",
  "2026-01-04",
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
  "2026-01-08",
  "2026-01-09",
  "2026-01-10",
];

function renderHandles(opts: { from?: string; to?: string; editing?: boolean } = {}) {
  const handlers = {
    onStart: vi.fn<(which: "from" | "to") => void>(),
    onMove: vi.fn<(next: { from: string; to: string }) => void>(),
    onEnd: vi.fn<() => void>(),
    onCancel: vi.fn<() => void>(),
    onAnnounce: vi.fn<(text: string) => void>(),
  };
  const scale = makeScale(DOMAIN);
  const utils = render(
    <svg width={400} height={200} data-testid="svg-root">
      <EdgeHandles
        xAxisMap={{ x: { scale } }}
        offset={{ left: 0, top: 10, width: 400, height: 180 }}
        from={opts.from ?? "2026-01-03"}
        to={opts.to ?? "2026-01-07"}
        editing={opts.editing ?? false}
        {...handlers}
      />
    </svg>,
  );
  return { ...utils, handlers };
}

beforeEach(() => cleanup());

describe("EdgeHandles — ARIA attributes", () => {
  it("exposes slider role, orientation, valuemin/max/now/text, keyshortcuts, and localized labels", () => {
    renderHandles();
    const from = screen.getByTestId("edge-handle-from");
    const to = screen.getByTestId("edge-handle-to");

    for (const el of [from, to]) {
      expect(el.getAttribute("role")).toBe("slider");
      expect(el.getAttribute("aria-orientation")).toBe("horizontal");
      expect(el.getAttribute("tabindex")).toBe("0");
      expect(el.getAttribute("aria-valuemin")).toBe("0");
      expect(el.getAttribute("aria-valuemax")).toBe(String(DOMAIN.length - 1));
      expect(el.getAttribute("aria-keyshortcuts")).toContain("ArrowLeft");
      expect(el.getAttribute("aria-keyshortcuts")).toContain("ArrowRight");
      expect(el.getAttribute("aria-keyshortcuts")).toContain("Enter");
      expect(el.getAttribute("aria-keyshortcuts")).toContain("Escape");
    }

    expect(from.getAttribute("aria-label")).toBe("مقبض بداية النطاق (من)");
    expect(to.getAttribute("aria-label")).toBe("مقبض نهاية النطاق (إلى)");
    expect(from.getAttribute("aria-valuenow")).toBe(String(DOMAIN.indexOf("2026-01-03")));
    expect(to.getAttribute("aria-valuenow")).toBe(String(DOMAIN.indexOf("2026-01-07")));
    expect(from.getAttribute("aria-valuetext")).toContain("2026-01-03");
    expect(from.getAttribute("aria-valuetext")).toContain(DOMAIN[0]);
    expect(from.getAttribute("aria-valuetext")).toContain(DOMAIN[DOMAIN.length - 1]);
  });
});

describe("EdgeHandles — keyboard navigation", () => {
  it("Tab moves focus through the two handles in order", async () => {
    const user = userEvent.setup();
    renderHandles();
    const from = screen.getByTestId("edge-handle-from");
    const to = screen.getByTestId("edge-handle-to");

    await user.tab();
    expect(document.activeElement).toBe(from);
    await user.tab();
    expect(document.activeElement).toBe(to);
  });

  it("ArrowRight on `from` starts editing and moves the value forward by 1", async () => {
    const user = userEvent.setup();
    const { handlers } = renderHandles({ from: "2026-01-03", to: "2026-01-07" });
    const from = screen.getByTestId("edge-handle-from");

    from.focus();
    await user.keyboard("{ArrowRight}");

    expect(handlers.onStart).toHaveBeenCalledWith("from");
    expect(handlers.onMove).toHaveBeenCalledWith({ from: "2026-01-04", to: "2026-01-07" });
    expect(handlers.onAnnounce).toHaveBeenCalledWith(expect.stringContaining("2026-01-04"));
  });

  it("ArrowLeft on `to` moves the value back by 1", async () => {
    const user = userEvent.setup();
    const { handlers } = renderHandles({ from: "2026-01-03", to: "2026-01-07" });
    const to = screen.getByTestId("edge-handle-to");

    to.focus();
    await user.keyboard("{ArrowLeft}");

    expect(handlers.onMove).toHaveBeenLastCalledWith({ from: "2026-01-03", to: "2026-01-06" });
  });

  it("Shift+ArrowRight jumps by 7 days", async () => {
    const user = userEvent.setup();
    const { handlers } = renderHandles({ from: "2026-01-01", to: "2026-01-05" });
    const from = screen.getByTestId("edge-handle-from");

    from.focus();
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");

    // from=2026-01-01 idx 0, +7 → idx 7 → 2026-01-08, other=2026-01-05
    // sorted → from=2026-01-05, to=2026-01-08
    expect(handlers.onMove).toHaveBeenLastCalledWith({ from: "2026-01-05", to: "2026-01-08" });
  });

  it("Escape triggers onCancel and announces cancellation", async () => {
    const user = userEvent.setup();
    const { handlers } = renderHandles({ editing: true });
    const from = screen.getByTestId("edge-handle-from");

    from.focus();
    await user.keyboard("{Escape}");

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onAnnounce).toHaveBeenCalledWith("تم إلغاء تعديل النطاق");
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it("Enter commits the range via onEnd when editing", async () => {
    const user = userEvent.setup();
    const { handlers } = renderHandles({ editing: true, from: "2026-01-03", to: "2026-01-07" });
    const from = screen.getByTestId("edge-handle-from");

    from.focus();
    await user.keyboard("{Enter}");

    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onAnnounce).toHaveBeenCalledWith(expect.stringContaining("2026-01-03"));
    expect(handlers.onAnnounce).toHaveBeenCalledWith(expect.stringContaining("2026-01-07"));
  });

  it("Enter is a no-op when not editing", async () => {
    const user = userEvent.setup();
    const { handlers } = renderHandles({ editing: false });
    const from = screen.getByTestId("edge-handle-from");

    from.focus();
    await user.keyboard("{Enter}");

    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it("Home/End jump to domain boundaries", async () => {
    const user = userEvent.setup();
    const { handlers } = renderHandles({ from: "2026-01-05", to: "2026-01-07" });
    const from = screen.getByTestId("edge-handle-from");

    from.focus();
    await user.keyboard("{Home}");
    expect(handlers.onMove).toHaveBeenLastCalledWith({ from: DOMAIN[0], to: "2026-01-07" });

    const to = screen.getByTestId("edge-handle-to");
    to.focus();
    await user.keyboard("{End}");
    expect(handlers.onMove).toHaveBeenLastCalledWith({
      from: "2026-01-05",
      to: DOMAIN[DOMAIN.length - 1],
    });
  });
});
