import { describe, it, expect } from "vitest";
import { classify } from "./sitemap-rules";

describe("sitemap classify()", () => {
  it("assigns weekly / 0.9 to /features", () => {
    const e = classify("/features");
    expect(e.changefreq).toBe("weekly");
    expect(e.priority).toBe("0.9");
  });

  it("assigns weekly / 0.9 to /request-demo", () => {
    const e = classify("/request-demo");
    expect(e.changefreq).toBe("weekly");
    expect(e.priority).toBe("0.9");
  });

  it("assigns weekly / 1.0 to home /", () => {
    const e = classify("/");
    expect(e.changefreq).toBe("weekly");
    expect(e.priority).toBe("1.0");
  });

  it("assigns daily / 0.9 to /listings", () => {
    const e = classify("/listings");
    expect(e.changefreq).toBe("daily");
    expect(e.priority).toBe("0.9");
  });

  it("assigns weekly / 0.8 to blog index and monthly / 0.6 to blog posts", () => {
    expect(classify("/blog").priority).toBe("0.8");
    expect(classify("/blog").changefreq).toBe("weekly");
    const post = classify("/blog/hello-world");
    expect(post.changefreq).toBe("monthly");
    expect(post.priority).toBe("0.6");
  });

  it("classifies nested feature subpaths (/features/ocr) the same as /features", () => {
    const e = classify("/features/ocr");
    expect(e.changefreq).toBe("weekly");
    expect(e.priority).toBe("0.9");
  });

  it("falls back to monthly / 0.5 for unknown paths", () => {
    const e = classify("/some-random-page");
    expect(e.changefreq).toBe("monthly");
    expect(e.priority).toBe("0.5");
  });

  it("preserves lastmod override", () => {
    const e = classify("/blog/x", { lastmod: "2026-01-01" });
    expect(e.lastmod).toBe("2026-01-01");
    expect(e.changefreq).toBe("monthly");
  });

  it("allows overrides to win over rule defaults", () => {
    const e = classify("/features", { priority: "0.95", changefreq: "daily" });
    expect(e.priority).toBe("0.95");
    expect(e.changefreq).toBe("daily");
  });
});
