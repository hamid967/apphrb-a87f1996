#!/usr/bin/env node
/**
 * i18n CI gate — runs the string audit and the keys audit, compares the
 * numbers to `.i18n-baseline.json`, and reports:
 *
 *   ✅ equal or improved  → exit 0 (also updates baseline when --update)
 *   ⚠️  regression        → exit 1 (or exit 0 when `I18N_WARN_ONLY=1`)
 *
 * Modes
 *   default              strict: regressions fail with exit 1
 *   I18N_WARN_ONLY=1     warn-only: prints ⚠️ but always exits 0 (CI default)
 *   --update             rewrite baseline to current counts (local use)
 *
 * Usage
 *   node scripts/i18n-ci-check.mjs
 *   I18N_WARN_ONLY=1 node scripts/i18n-ci-check.mjs
 *   node scripts/i18n-ci-check.mjs --update
 */
import { spawnSync } from "node:child_process";
import { openSync, closeSync, readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASELINE = ".i18n-baseline.json";
const WARN_ONLY = process.env.I18N_WARN_ONLY === "1" || process.env.I18N_WARN_ONLY === "true";
const UPDATE = process.argv.includes("--update");

// spawnSync's default 1MB maxBuffer truncates the audit output (arabic
// strings push it well past that), and even a huge maxBuffer occasionally
// clips on some Node builds. Redirect stdout to a temp file so we always
// get the full report, then parse it from disk.
const tmp = mkdtempSync(join(tmpdir(), "i18n-ci-"));
function runJson(script) {
  const out = join(tmp, script.replace(/[\/.]/g, "_") + ".json");
  const fd = openSync(out, "w");
  const res = spawnSync(process.execPath, [script, "--json"], {
    stdio: ["ignore", fd, "inherit"],
  });
  closeSync(fd);
  if (res.status !== 0 && res.status !== null) {
    console.error(`${script} exited with ${res.status}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(out, "utf8"));
}

const strings = runJson("scripts/i18n-audit.mjs");
const keys = runJson("scripts/i18n-keys-audit.mjs");

const current = {
  hardcodedStrings: {
    total: strings.total,
    filesWithFindings: strings.files,
  },
  keys: {
    missingInEn: keys.totals.missingInEn,
    missingInAr: keys.totals.missingInAr,
    arMissingVsEn: keys.totals.arMissingVsEn,
    enMissingVsAr: keys.totals.enMissingVsAr,
    dynamicUnresolvedSites: keys.totals.dynamicUnresolvedSites,
  },
};

if (!existsSync(BASELINE)) {
  console.error(`No ${BASELINE} found. Run: node scripts/i18n-ci-check.mjs --update`);
  process.exit(1);
}
const baselineFile = JSON.parse(readFileSync(BASELINE, "utf8"));
const baseline = { hardcodedStrings: baselineFile.hardcodedStrings, keys: baselineFile.keys };

const rows = [];
const regressions = [];
for (const [group, bucket] of Object.entries(current)) {
  for (const [metric, cur] of Object.entries(bucket)) {
    const base = baseline[group]?.[metric] ?? 0;
    const delta = cur - base;
    rows.push({ metric: `${group}.${metric}`, baseline: base, current: cur, delta });
    if (delta > 0) regressions.push({ metric: `${group}.${metric}`, base, cur, delta });
  }
}

console.log("── i18n CI gate ──────────────────────────────────────────────");
console.log("metric".padEnd(42), "baseline".padStart(10), "current".padStart(10), "delta".padStart(8));
for (const r of rows) {
  const arrow = r.delta > 0 ? "▲" : r.delta < 0 ? "▼" : "=";
  console.log(
    r.metric.padEnd(42),
    String(r.baseline).padStart(10),
    String(r.current).padStart(10),
    `${arrow}${String(r.delta).padStart(6)}`,
  );
}

if (UPDATE) {
  const next = {
    ...baselineFile,
    $schema: { ...(baselineFile.$schema ?? {}), generatedAt: new Date().toISOString().slice(0, 10) },
    hardcodedStrings: current.hardcodedStrings,
    keys: current.keys,
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
  console.log(`\n✅ Baseline updated: ${BASELINE}`);
  process.exit(0);
}

if (regressions.length === 0) {
  rmSync(tmp, { recursive: true, force: true });
  console.log("\n✅ No regressions vs baseline.");
  // If everything improved, remind the human to lower the baseline.
  const improvements = rows.filter((r) => r.delta < 0);
  if (improvements.length) {
    console.log(`   ${improvements.length} metric(s) improved. Lock in the win locally with:`);
    console.log("     bun run i18n:ci:update  &&  commit .i18n-baseline.json");
  }
  process.exit(0);
}

console.log(`\n⚠️  ${regressions.length} i18n regression(s) vs baseline:`);
for (const r of regressions) {
  console.log(`   ${r.metric}: ${r.base} → ${r.cur}  (+${r.delta})`);
}
console.log("\nFix: wrap new strings with t(), add missing keys to src/lib/i18n.ts,");
console.log("or, if intentional, raise the baseline with `bun run i18n:ci:update`.");

if (WARN_ONLY) {
  rmSync(tmp, { recursive: true, force: true });
  console.log("\n(I18N_WARN_ONLY=1 — reporting only, not failing the build.)");
  process.exit(0);
}
rmSync(tmp, { recursive: true, force: true });
process.exit(1);