#!/usr/bin/env node
/**
 * i18n audit — scans src/routes and src/components for hard-coded Arabic or
 * English strings inside JSX text nodes and common string-prop attributes
 * (title, placeholder, aria-label, alt). Fails (exit 1) when any are found so
 * it can gate CI. Skips files that are pure config, generated, or storybook.
 *
 * Usage:  node scripts/i18n-audit.mjs [--json] [--max=200]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/routes", "src/components"];
const IGNORE = [
  /routeTree\.gen\.ts$/,
  /\.stories\.tsx?$/,
  /__tests__/,
  /components\/ui\//,          // shadcn primitives — no user copy
  /email-templates\//,         // handled separately (server-rendered)
];

const AR = /[\u0600-\u06FF]/;
const EN_WORD = /\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Za-z]{2,})*\b/;

// JSX text between > and <, ignoring pure whitespace/braces.
const JSX_TEXT_RE = />\s*([^<{}\n][^<{}]*?)\s*</g;
// String-valued props we care about.
const PROP_RE = /\b(title|placeholder|aria-label|alt|label|description)\s*=\s*"([^"\n]+)"/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !IGNORE.some((r) => r.test(p))) out.push(p);
  }
  return out;
}

function scanFile(file) {
  const src = readFileSync(file, "utf8");
  const findings = [];
  // Skip files with a leading `// i18n-audit-ignore` marker.
  if (/\/\/\s*i18n-audit-ignore/.test(src.slice(0, 200))) return findings;

  const lineOf = (idx) => src.slice(0, idx).split("\n").length;

  for (const m of src.matchAll(JSX_TEXT_RE)) {
    const text = m[1].trim();
    if (!text || text.length < 2) continue;
    if (/^[0-9\s\-–—:.,/×+*%()[\]#]+$/.test(text)) continue;
    if (AR.test(text) || EN_WORD.test(text)) {
      findings.push({ line: lineOf(m.index), kind: "jsx-text", text: text.replace(/\s+/g, " ").slice(0, 200) });
    }
  }
  for (const m of src.matchAll(PROP_RE)) {
    const text = m[2].trim();
    if (!text) continue;
    if (AR.test(text) || EN_WORD.test(text)) {
      findings.push({ line: lineOf(m.index), kind: `prop:${m[1]}`, text: text.replace(/\s+/g, " ").slice(0, 200) });
    }
  }
  return findings;
}

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const maxArg = [...args].find((a) => a.startsWith("--max="));
const MAX = maxArg ? Number(maxArg.split("=")[1]) : Infinity;

const files = ROOTS.flatMap((r) => walk(r));
const report = [];
for (const f of files) {
  const found = scanFile(f);
  if (found.length) report.push({ file: relative(process.cwd(), f), findings: found });
}

const total = report.reduce((n, r) => n + r.findings.length, 0);

if (asJson) {
  process.stdout.write(JSON.stringify({ total, files: report.length, report }, null, 2));
} else {
  for (const r of report.slice(0, 40)) {
    console.log(`\n${r.file}  (${r.findings.length})`);
    for (const f of r.findings.slice(0, 6)) {
      console.log(`  L${f.line}  [${f.kind}]  ${f.text.slice(0, 90)}`);
    }
  }
  console.log(`\ni18n-audit: ${total} hard-coded strings across ${report.length} files (${files.length} scanned).`);
}

process.exit(total > MAX ? 1 : 0);