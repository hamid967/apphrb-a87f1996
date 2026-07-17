#!/usr/bin/env node
/**
 * scripts/redirects-sync.mjs
 *
 * Scans src/routes/** for simple redirect "shim" route files and regenerates
 * src/lib/redirect-map.ts — the single source of truth for 301 redirects.
 *
 * A "simple shim" is a route file whose beforeLoad unconditionally
 * `throw redirect({ to: "...", replace: true })`.
 *
 * Modes:
 *   node scripts/redirects-sync.mjs           # rewrite src/lib/redirect-map.ts
 *   node scripts/redirects-sync.mjs --check   # exit 1 if the map is stale
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "src/lib/redirect-map.ts");
const CHECK = process.argv.includes("--check");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function extractEntries() {
  const files = walk(path.join(ROOT, "src/routes"));
  const entries = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const routeMatch = src.match(/createFileRoute\(\s*["']([^"']+)["']\s*,?\s*\)/);
    if (!routeMatch) continue;
    const routeId = routeMatch[1];
    const from = routeId.replace(/^\/_authenticated/, "").replace(/\/$/, "") || "/";

    // Only a *simple shim*: beforeLoad top-level unconditional throw redirect.
    const isSimpleShim =
      /beforeLoad\s*:\s*(?:async\s*)?\(\s*(?:\{[^}]*\})?\s*\)\s*=>\s*\{\s*throw\s+redirect/.test(
        src,
      );
    if (!isSimpleShim) continue;

    const r = src.match(/throw\s+redirect\(\s*\{([\s\S]*?)\}\s*\)/);
    if (!r) continue;
    const body = r[1];
    const toMatch = body.match(/to\s*:\s*["']([^"']+)["']/);
    if (!toMatch) continue;
    const replaceMatch = /replace\s*:\s*true/.test(body);

    entries.push({
      from,
      to: toMatch[1],
      replace: replaceMatch,
      authProtected: routeId.startsWith("/_authenticated"),
      file: path.relative(ROOT, f).replaceAll("\\", "/"),
    });
  }
  entries.sort((a, b) => a.from.localeCompare(b.from));
  return entries;
}

function render(entries) {
  const lines = [];
  lines.push("/**");
  lines.push(" * Central Redirect Map — Single Source of Truth");
  lines.push(" *");
  lines.push(" * All 301-style route redirects (shims) in the app are listed here.");
  lines.push(" * Each entry corresponds to a route file under src/routes/ whose only");
  lines.push(" * job is `throw redirect({ to, replace: true })` in beforeLoad.");
  lines.push(" *");
  lines.push(" * AUTO-GENERATED — do not edit by hand.");
  lines.push(" *   Regenerate: bun run redirects:sync");
  lines.push(" *   Verify:     bun run redirects:check");
  lines.push(" *   Test:       bun run test src/lib/redirect-map.test.ts");
  lines.push(" */");
  lines.push("");
  lines.push("export type RedirectEntry = {");
  lines.push("  /** Legacy path (what the user visits). */");
  lines.push("  from: string;");
  lines.push("  /** Canonical path (where we send them). */");
  lines.push("  to: string;");
  lines.push("  /** Whether the shim uses replace:true (301-equivalent). */");
  lines.push("  replace: boolean;");
  lines.push("  /** Whether the shim lives under the _authenticated layout. */");
  lines.push("  authProtected: boolean;");
  lines.push("  /** Source file for traceability. */");
  lines.push("  file: string;");
  lines.push("};");
  lines.push("");
  lines.push("export const REDIRECT_MAP: readonly RedirectEntry[] = [");
  for (const e of entries) {
    lines.push(
      `  { from: ${JSON.stringify(e.from)}, to: ${JSON.stringify(e.to)}, replace: ${e.replace}, authProtected: ${e.authProtected}, file: ${JSON.stringify(e.file)} },`,
    );
  }
  lines.push("] as const;");
  lines.push("");
  lines.push("/** Look up canonical target for a legacy path (exact match). */");
  lines.push("export function getRedirectTarget(from: string): string | undefined {");
  lines.push("  return REDIRECT_MAP.find((e) => e.from === from)?.to;");
  lines.push("}");
  lines.push("");
  lines.push("/**");
  lines.push(" * Trace a redirect chain from a starting path. Returns the ordered list");
  lines.push(" * of hops (including the start) and the final target. Detects loops.");
  lines.push(" */");
  lines.push("export function traceRedirectChain(from: string): {");
  lines.push("  chain: string[];");
  lines.push("  final: string;");
  lines.push("  loop: boolean;");
  lines.push("} {");
  lines.push("  const chain: string[] = [from];");
  lines.push("  const seen = new Set<string>([from]);");
  lines.push("  let cur = from;");
  lines.push("  // Bounded to guard against pathological input.");
  lines.push("  for (let i = 0; i < 32; i++) {");
  lines.push("    const next = getRedirectTarget(cur);");
  lines.push("    if (!next) return { chain, final: cur, loop: false };");
  lines.push("    if (seen.has(next)) {");
  lines.push("      chain.push(next);");
  lines.push("      return { chain, final: next, loop: true };");
  lines.push("    }");
  lines.push("    seen.add(next);");
  lines.push("    chain.push(next);");
  lines.push("    cur = next;");
  lines.push("  }");
  lines.push("  return { chain, final: cur, loop: true };");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

const entries = extractEntries();
const rendered = render(entries);
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";

if (CHECK) {
  if (current !== rendered) {
    console.error(
      `[redirects:check] src/lib/redirect-map.ts is stale (${entries.length} shims detected). Run: bun run redirects:sync`,
    );
    process.exit(1);
  }
  console.log(`[redirects:check] OK — ${entries.length} entries in sync.`);
  process.exit(0);
}

fs.writeFileSync(OUT, rendered);
console.log(`[redirects:sync] wrote ${entries.length} entries to src/lib/redirect-map.ts`);
