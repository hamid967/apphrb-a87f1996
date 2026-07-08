import { describe, it, expect } from "vitest";
import { sanitiseRichHtml } from "@/lib/sanitize-rich";

/**
 * Pre-submit client guard tests.
 *
 * The admin page calls `sanitiseRichHtml(contentAr/En)` inside `onSave`
 * before invoking the server function, so the payload leaving the browser
 * must never contain disallowed elements or attributes — even if a user
 * pastes malicious HTML directly into the TipTap editor or a browser
 * extension mutates the DOM. These tests assert the exact contract.
 */

const DISALLOWED_TAGS = [
  "script", "iframe", "object", "embed", "form", "input", "meta", "link",
  "svg", "math", "template", "noscript", "img", "video", "audio", "source",
  "picture", "canvas", "button", "textarea", "select", "option", "style",
];

describe("Pre-submit client guard — disallowed elements", () => {
  for (const tag of DISALLOWED_TAGS) {
    it(`strips <${tag}> before send`, () => {
      const input = `<p>ok</p><${tag}>payload</${tag}><p>after</p>`;
      const out = sanitiseRichHtml(input);
      expect(out).not.toMatch(new RegExp(`<${tag}\\b`, "i"));
      expect(out).toContain("<p>ok</p>");
      expect(out).toContain("<p>after</p>");
    });
  }

  it("strips every inline event handler", () => {
    const events = ["onclick", "onmouseover", "onerror", "onload", "onfocus", "onblur", "onsubmit"];
    const attrs = events.map((e) => `${e}="alert(1)"`).join(" ");
    const out = sanitiseRichHtml(`<p ${attrs}>x</p>`);
    for (const e of events) expect(out).not.toMatch(new RegExp(e, "i"));
    expect(out).toContain(">x</p>");
  });

  it("strips unknown attributes on allowed tags", () => {
    const out = sanitiseRichHtml(`<p id="pwn" class="pwn" data-x="1" onmouseenter="x">t</p>`);
    expect(out).not.toMatch(/id=/i);
    expect(out).not.toMatch(/class=/i);
    expect(out).not.toMatch(/data-/i);
    expect(out).not.toMatch(/onmouseenter/i);
    expect(out).toContain(">t</p>");
  });

  it("strips disallowed style properties even when text-align is present", () => {
    const out = sanitiseRichHtml(
      `<p style="text-align:right; background:red; position:fixed;">x</p>`,
    );
    // Mixed style is rejected entirely by SAFE_STYLE (single-property whitelist).
    expect(out).not.toMatch(/background/i);
    expect(out).not.toMatch(/position/i);
  });

  it("strips href schemes other than http(s)/mailto/tel", () => {
    const cases = [
      `<a href="javascript:alert(1)">x</a>`,
      `<a href="vbscript:msgbox(1)">x</a>`,
      `<a href="data:text/html,<script>alert(1)</script>">x</a>`,
      `<a href="file:///etc/passwd">x</a>`,
      `<a href="//evil.example">x</a>`,
    ];
    for (const c of cases) {
      const out = sanitiseRichHtml(c);
      expect(out, `leaked scheme in ${c}: ${out}`).not.toMatch(/href=/i);
      expect(out).not.toMatch(/javascript:|vbscript:|data:|file:/i);
    }
  });

  it("forces rel=noopener + target=_blank on kept links", () => {
    const out = sanitiseRichHtml(`<a href="https://example.com">ok</a>`);
    expect(out).toMatch(/rel="noopener noreferrer"/);
    expect(out).toMatch(/target="_blank"/);
  });

  it("does not mutate safe TipTap output (idempotent)", () => {
    const safe =
      `<h2>عنوان</h2><p dir="rtl" style="text-align:right"><strong>مرحبا</strong> <em>عالم</em></p>` +
      `<ul><li>a</li><li>b</li></ul>` +
      `<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">link</a></p>`;
    const once = sanitiseRichHtml(safe);
    const twice = sanitiseRichHtml(once);
    expect(twice).toBe(once);
    // All original semantic content still present.
    expect(once).toContain("عنوان");
    expect(once).toContain("مرحبا");
    expect(once).toContain(`href="https://example.com"`);
  });

  it("blocks paste-bomb: encoded script inside allowed wrapper", () => {
    const paste = `<p><span dir="rtl">مرحبا</span></p><SCRIPT src=//evil.example/x.js></SCRIPT>`;
    const out = sanitiseRichHtml(paste);
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/evil\.example/i);
    expect(out).toContain("مرحبا");
  });

  it("blocks nested disallowed content wholesale", () => {
    const nested = `<p>ok</p><iframe srcdoc="<script>alert(1)</script>"></iframe>`;
    const out = sanitiseRichHtml(nested);
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/srcdoc/i);
    expect(out).not.toMatch(/script/i);
  });
});