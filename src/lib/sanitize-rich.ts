/**
 * Shared bilingual rich-text sanitiser used on both the client (pre-submit)
 * and the server (pre-persist). Whitelists the narrow set of tags/attributes
 * emitted by TipTap StarterKit + Underline + Link + TextAlign.
 *
 * Hand-rolled instead of `sanitize-html` so it bundles cleanly on the
 * Cloudflare Worker SSR target and stays tiny in the browser bundle.
 * Client use is defence-in-depth; the server always re-sanitises.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "h2",
  "h3",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "span",
]);

const ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(["href"]),
  p: new Set(["dir", "style"]),
  h2: new Set(["dir", "style"]),
  h3: new Set(["dir", "style"]),
  blockquote: new Set(["dir"]),
  li: new Set(["dir"]),
  span: new Set(["dir"]),
};

const SAFE_URL = /^(https?:|mailto:|tel:)/i;
const SAFE_STYLE = /^text-align\s*:\s*(left|right|center|justify|start|end)\s*;?\s*$/i;
// Wholesale-strip tags that carry executable/embedded content, including body.
const BLOCK_STRIP =
  /<(script|style|iframe|object|embed|form|input|meta|link|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_VOID =
  /<(script|style|iframe|object|embed|form|input|meta|link|svg|math|template|noscript)\b[^>]*\/?>/gi;

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sanitiseRichHtml(input: string): string {
  if (!input) return "";
  let s = String(input);
  // 1) Drop dangerous elements together with their content.
  s = s.replace(BLOCK_STRIP, "").replace(BLOCK_VOID, "");
  // 2) Walk every remaining tag and enforce the whitelist.
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_full, close, name, rest) => {
    const tag = name.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (close) return `</${tag}>`;
    const allowed = ALLOWED_ATTRS[tag];
    let out = "";
    if (allowed) {
      const attrRe =
        /\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`>]+)))?/g;
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(rest)) !== null) {
        const attr = m[1].toLowerCase();
        if (attr.startsWith("on")) continue;
        if (!allowed.has(attr)) continue;
        const raw = (m[2] ?? m[3] ?? m[4] ?? "").trim();
        if (attr === "href" && !SAFE_URL.test(raw)) continue;
        if (attr === "style" && !SAFE_STYLE.test(raw)) continue;
        out += ` ${attr}="${escapeAttr(raw)}"`;
      }
    }
    if (tag === "a") out += ` rel="noopener noreferrer" target="_blank"`;
    return `<${tag}${out}>`;
  });
  // 3) Neutralise any leftover `javascript:` fragments (e.g. inside stray text).
  s = s.replace(/javascript:/gi, "");
  return s;
}
