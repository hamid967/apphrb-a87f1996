// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { usePersistedFilters } from "./use-persisted-filters";

function Harness({
  storageKey,
  applied,
  onRestore,
}: {
  storageKey: string;
  applied: Record<string, string | undefined>;
  onRestore: (v: Record<string, string | undefined>) => void;
}) {
  usePersistedFilters(storageKey, applied, onRestore);
  return null;
}

describe("usePersistedFilters", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("persists non-empty applied values", () => {
    const { rerender } = render(
      <Harness storageKey="k" applied={{ status: "live", bidderId: "" }} onRestore={() => {}} />,
    );
    expect(window.sessionStorage.getItem("k")).toBe(
      JSON.stringify({ status: "live", bidderId: "" }),
    );
    rerender(
      <Harness storageKey="k" applied={{ status: "", bidderId: "" }} onRestore={() => {}} />,
    );
    expect(window.sessionStorage.getItem("k")).toBeNull();
  });

  it("restores stored values on mount when applied is empty", () => {
    window.sessionStorage.setItem("k", JSON.stringify({ status: "ended", bidderId: "abc" }));
    const onRestore = vi.fn();
    render(<Harness storageKey="k" applied={{ status: "", bidderId: "" }} onRestore={onRestore} />);
    expect(onRestore).toHaveBeenCalledWith({ status: "ended", bidderId: "abc" });
  });

  it("does not restore when applied already has values", () => {
    window.sessionStorage.setItem("k", JSON.stringify({ status: "ended", bidderId: "abc" }));
    const onRestore = vi.fn();
    render(
      <Harness storageKey="k" applied={{ status: "live", bidderId: "" }} onRestore={onRestore} />,
    );
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("does nothing when key is undefined", () => {
    const onRestore = vi.fn();
    act(() => {
      render(
        <Harness
          storageKey={undefined as unknown as string}
          applied={{ x: "y" }}
          onRestore={onRestore}
        />,
      );
    });
    expect(onRestore).not.toHaveBeenCalled();
  });
});
