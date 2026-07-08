#!/usr/bin/env node
/**
 * Comprehensive i18n audit with dynamic-key resolution.
 *
 * Statically extracts `en` and `ar` from src/lib/i18n.ts, then scans src/
 * for every t("…"), t(`…`), and i18nKey="…" reference. Dynamic call sites
 * (t(variable), t(`prefix.${x}.suffix`), t(MAP[x])) are resolved by looking
 * for candidate literals in the same file — no more coarse prefix-only
 * matching.
 *
 * Reports:
 *   • Keys used in code but missing from EN / AR
 *   • Keys in EN missing in AR (and vice-versa)
 *   • Keys defined but never referenced (with dynamic resolution applied)
 *   • Dynamic sites we still cannot resolve
 *
 * Usage: node scripts/i18n-keys-audit.mjs [--json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = "src";
const I18N_FILE = "src/lib/i18n.ts";

// ---------- 1. Load & flatten EN / AR ----------
const i18nSrc = readFileSync(I18N_FILE, "utf8");

function extractObject(source, declPrefix) {
  const idx = source.indexOf(declPrefix);
  if (idx === -1) throw new Error(`Cannot find ${declPrefix}`);
  const braceStart = source.indexOf("{", idx);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`Unterminated object for ${declPrefix}`);
}

const enLit = extractObject(i18nSrc, "const en =");
const arLit = extractObject(i18nSrc, "const ar: typeof en =");
const enObj = new Function(`return (${enLit});`)();
const arObj = new Function(`return (${arLit});`)();

function flatten(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out.add(key);
  }
  return out;
}
const enKeys = flatten(enObj);
const arKeys = flatten(arObj);

// ---------- 2. Walk src/ ----------
const IGNORE_DIR = /\/(node_modules|dist|\.next|routeTree\.gen)/;
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (IGNORE_DIR.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(t|j)sx?$/.test(p)) out.push(p);
  }
  return out;
}
const files = walk(SRC);

const T_LITERAL   = /\bt\(\s*(["'`])([^"'`]+?)\1/g;
const T_DYNAMIC   = /\bt\(\s*(?!["'`])[^)]{1,120}\)/g;
const I18N_KEY_RE = /\bi18nKey\s*=\s*"([^"]+)"/g;
// Any single-line string or interpolation-free template literal.
const ANY_STRING  = /(["'])((?:\\.|(?!\1)[^\\\n])*?)\1|`([^`$\\]*)`/g;

const usedKeys = new Map();          // key -> [{file,line,resolved?}]
const dynamicHits = [];              // {file,line,snippet,prefix?,suffix?,srcFile}
const resolvedFrom = new Map();      // key -> [{file,line,via}]

const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

function addUsed(key, entry) {
  if (!usedKeys.has(key)) usedKeys.set(key, []);
  usedKeys.get(key).push(entry);
}
function markResolved(key, hit, via) {
  addUsed(key, { file: hit.file, line: hit.line, resolved: true });
  if (!resolvedFrom.has(key)) resolvedFrom.set(key, []);
  resolvedFrom.get(key).push({ ...hit, via });
}

for (const f of files) {
  if (f === I18N_FILE) continue;
  const src = readFileSync(f, "utf8");
  const rel = relative(process.cwd(), f);

  for (const m of src.matchAll(T_LITERAL)) {
    const key = m[2];
    if (key.includes("${")) {
      const tmpl = key.match(/^(.*?)\$\{[^}]+\}(.*)$/);
      const prefix = (tmpl?.[1] ?? "").replace(/\.$/, "");
      const suffix = (tmpl?.[2] ?? "").replace(/^\./, "");
      dynamicHits.push({ file: rel, line: lineOf(src, m.index), snippet: `t(\`${key}\`)`, prefix, suffix, srcFile: f });
      continue;
    }
    addUsed(key, { file: rel, line: lineOf(src, m.index) });
  }
  for (const m of src.matchAll(I18N_KEY_RE)) {
    addUsed(m[1], { file: rel, line: lineOf(src, m.index) });
  }
  for (const m of src.matchAll(T_DYNAMIC)) {
    if (/^t\(\s*["'`]/.test(m[0])) continue;
    dynamicHits.push({ file: rel, line: lineOf(src, m.index), snippet: m[0].slice(0, 120), srcFile: f });
  }
}

// ---------- 2b. Resolve dynamic hits via same-file literals ----------
const litCache = new Map();
function litsFor(file) {
  if (!litCache.has(file)) {
    const src = readFileSync(file, "utf8");
    const out = [];
    for (const m of src.matchAll(ANY_STRING)) {
      const s = m[2] ?? m[3];
      if (typeof s === "string" && s.length && s.length < 120) out.push(s);
    }
    litCache.set(file, out);
  }
  return litCache.get(file);
}

const unresolved = [];
for (const hit of dynamicHits) {
  const lits = litsFor(hit.srcFile);
  let matched = 0;
  if (hit.prefix != null) {
    const suffix = hit.suffix ? `.${hit.suffix}` : "";
    const base = hit.prefix ? hit.prefix + "." : "";
    for (const l of lits) {
      if (!/^[A-Za-z0-9_-]+$/.test(l)) continue;
      const candidate = `${base}${l}${suffix}`;
      if (enKeys.has(candidate)) { markResolved(candidate, hit, "template"); matched++; }
    }
  } else {
    // t(varName) / t(MAP[x]) — accept any dotted literal in the file that
    // matches a known translation key.
    for (const l of lits) {
      if (!/^[A-Za-z_][\w.]*\.[\w.]+$/.test(l)) continue;
      if (enKeys.has(l)) { markResolved(l, hit, "literal"); matched++; }
    }
  }
  if (matched === 0) unresolved.push(hit);
}

// ---------- 3. Reports ----------
const used = new Set(usedKeys.keys());
const missingInEn   = [...used].filter((k) => !enKeys.has(k)).sort();
const missingInAr   = [...used].filter((k) => !arKeys.has(k)).sort();
const arMissingVsEn = [...enKeys].filter((k) => !arKeys.has(k)).sort();
const enMissingVsAr = [...arKeys].filter((k) => !enKeys.has(k)).sort();

// Safety net for unresolved dynamic prefixes — don't call their whole
// namespace unused when we couldn't enumerate candidates.
const safePrefixes = new Set(unresolved.filter((h) => h.prefix).map((h) => h.prefix));
const unusedInEn = [...enKeys]
  .filter((k) => !used.has(k))
  .filter((k) => {
    for (const p of safePrefixes) if (k === p || k.startsWith(p + ".")) return false;
    return true;
  })
  .sort();

// ---------- 4. Emit ----------
const asJson = process.argv.includes("--json");

// Group any flat list of dotted keys by their top-level namespace, e.g.
//   ["auth.title","auth.email","common.save"] →
//   { auth: ["auth.title","auth.email"], common: ["common.save"] }
function groupByNs(keys) {
  const out = {};
  for (const k of keys) {
    const ns = k.includes(".") ? k.split(".")[0] : "(root)";
    (out[ns] ||= []).push(k);
  }
  for (const ns of Object.keys(out)) out[ns].sort();
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
function groupSitesByFile(sites) {
  const out = {};
  for (const s of sites) (out[s.file] ||= []).push({ line: s.line, snippet: s.snippet, prefix: s.prefix ?? null, suffix: s.suffix ?? null });
  for (const f of Object.keys(out)) out[f].sort((a, b) => a.line - b.line);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

const report = {
  $schema: {
    generatedAt: new Date().toISOString(),
    description: "i18n audit for src/lib/i18n.ts. Buckets group dotted keys by top-level namespace; unresolvedDynamic groups call sites by source file.",
    fields: {
      totals: "Counts for every bucket below.",
      "byNamespace.missingInEn": "Keys referenced in code but absent from `en`.",
      "byNamespace.missingInAr": "Keys referenced in code but absent from `ar`.",
      "byNamespace.arMissingVsEn": "Keys defined in `en` but missing from `ar`.",
      "byNamespace.enMissingVsAr": "Keys defined in `ar` but missing from `en`.",
      "byNamespace.unusedInEn": "Keys defined in `en` with no static or dynamically-resolved reference in code.",
      unresolvedDynamic: "Dynamic t(...) call sites the analyzer could not resolve to concrete keys, grouped by file.",
    },
  },
  totals: {
    enKeys: enKeys.size, arKeys: arKeys.size,
    usedKeys: used.size,
    dynamicCallSites: dynamicHits.length,
    dynamicResolvedKeys: resolvedFrom.size,
    dynamicUnresolvedSites: unresolved.length,
    missingInEn: missingInEn.length, missingInAr: missingInAr.length,
    arMissingVsEn: arMissingVsEn.length, enMissingVsAr: enMissingVsAr.length,
    unusedInEn: unusedInEn.length,
  },
  byNamespace: {
    missingInEn:   groupByNs(missingInEn),
    missingInAr:   groupByNs(missingInAr),
    arMissingVsEn: groupByNs(arMissingVsEn),
    enMissingVsAr: groupByNs(enMissingVsAr),
    unusedInEn:    groupByNs(unusedInEn),
  },
  unresolvedDynamic: groupSitesByFile(unresolved),
};

if (asJson) {
  process.stdout.write(JSON.stringify(report, null, 2));
  process.exit(0);
}

const line = (s) => console.log(s);
line("── i18n key audit ──────────────────────────────────────────────");
line(`EN / AR keys defined:        ${enKeys.size} / ${arKeys.size}`);
line(`Unique keys referenced:      ${used.size}`);
line(`Dynamic sites:               ${dynamicHits.length}  (resolved keys: ${resolvedFrom.size}, still opaque sites: ${unresolved.length})`);
line("");

function dump(title, arr, limit = 40) {
  line(`▸ ${title} (${arr.length})`);
  for (const k of arr.slice(0, limit)) line(`    ${k}`);
  if (arr.length > limit) line(`    … +${arr.length - limit} more`);
  line("");
}
dump("Keys used in code but MISSING in EN", missingInEn);
dump("Keys used in code but MISSING in AR", missingInAr);
dump("Keys in EN but missing in AR", arMissingVsEn);
dump("Keys in AR but missing in EN", enMissingVsAr);
dump("Keys defined in EN but UNUSED in code", unusedInEn, 60);

if (unresolved.length) {
  line(`▸ Dynamic sites we could NOT resolve (${unresolved.length}):`);
  for (const h of unresolved.slice(0, 20)) line(`    ${h.file}:${h.line}  ${h.snippet}`);
  if (unresolved.length > 20) line(`    … +${unresolved.length - 20} more`);
}

process.exit(missingInEn.length + missingInAr.length > 0 ? 1 : 0);
