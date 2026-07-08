/**
 * Soft-delete integration invariants.
 *
 * Static-analysis guards to make sure future edits don't regress the
 * soft-delete contract documented in `docs/api/soft-delete.md`:
 *
 *   1. Every SELECT against a soft-delete table (contracts, payments,
 *      units, tenants, owners) in the server-fn / server-only layer
 *      MUST explicitly filter `deleted_at`, EXCEPT the archived-view
 *      helpers (`listArchived*`) which invert the filter, and
 *      admin-audit paths that opt in via `includeDeleted`.
 *
 *   2. Every soft-delete resource exposes the expected surface:
 *      `listArchived*` + `restore*` (+ `archive*` where applicable).
 *
 * These tests read source directly (no DB round-trip), so they run in
 * every environment and fail deterministically the moment a new query
 * forgets the filter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LIB = path.resolve(__dirname, "../src/lib");
const SOFT_DELETE_TABLES = ["contracts", "payments", "units", "tenants", "owners"] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(functions|server)\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Split source into "query builder chains" starting at each
 * `.from("<table>")` call and running until the terminating `;`.
 * Naive but sufficient for the fluent supabase-js call style used
 * across this codebase.
 */
function extractChains(source: string, table: string): string[] {
  const chains: string[] = [];
  const re = new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const start = m.index;
    // Walk forward to the next semicolon at depth 0 (paren-balanced).
    let i = start;
    let depth = 0;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === ";" && depth <= 0) break;
    }
    chains.push(source.slice(start, i));
  }
  return chains;
}

function isMutation(chain: string): boolean {
  return /\.(insert|update|delete|upsert)\s*\(/.test(chain);
}

function hasDeletedFilter(chain: string): boolean {
  return (
    /\.is\(\s*["']deleted_at["']\s*,\s*null\s*\)/.test(chain) ||
    /\.not\(\s*["']deleted_at["']\s*,\s*["']is["']\s*,\s*null\s*\)/.test(chain)
  );
}

/** Files/functions that legitimately opt out of the default filter. */
const OPT_OUT_MARKERS = [
  "includeDeleted", // conditional filter branch
];

describe("soft-delete read invariants", () => {
  const files = walk(LIB);

  for (const table of SOFT_DELETE_TABLES) {
    it(`every SELECT on "${table}" filters deleted_at (or is archived/mutation/opt-in)`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        const chains = extractChains(source, table);
        for (const chain of chains) {
          if (isMutation(chain)) continue;
          if (hasDeletedFilter(chain)) continue;
          // Skip archived helpers — they invert the filter and pass an
          // explicit `.not("deleted_at", "is", null)` OR live inside a
          // handler that we accept as archive-scoped.
          const surrounding = source.slice(
            Math.max(0, source.indexOf(chain) - 400),
            source.indexOf(chain) + chain.length + 100,
          );
          if (/listArchived|archived-only|OPT_OUT_SOFT_DELETE/.test(surrounding)) continue;
          if (OPT_OUT_MARKERS.some((m) => surrounding.includes(m))) continue;
          offenders.push(`${path.relative(process.cwd(), file)}\n  chain: ${chain.slice(0, 200)}`);
        }
      }
      expect(offenders, `Unfiltered ${table} reads found:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});

describe("soft-delete surface exports", () => {
  const expectedExports: Record<string, string[]> = {
    "contracts.functions.ts": ["listArchivedContracts", "archiveContracts", "restoreContracts"],
    "rent-payments.functions.ts": ["listArchivedPayments", "archivePayments", "restorePayments"],
    "tenants.functions.ts": ["listArchivedTenants", "restoreTenants"],
    "units.functions.ts": ["listArchivedUnits", "archiveUnits", "restoreUnits"],
  };

  for (const [file, names] of Object.entries(expectedExports)) {
    it(`${file} exports ${names.join(", ")}`, () => {
      const source = readFileSync(path.join(LIB, file), "utf8");
      for (const name of names) {
        expect(source, `missing export ${name} in ${file}`).toMatch(
          new RegExp(`export const ${name}\\b`),
        );
      }
    });
  }
});

describe("archive/restore handlers use guarded UPDATE", () => {
  const cases: Array<{ file: string; fns: string[] }> = [
    { file: "contracts.functions.ts", fns: ["archiveContracts", "restoreContracts"] },
    { file: "rent-payments.functions.ts", fns: ["archivePayments", "restorePayments"] },
    { file: "units.functions.ts", fns: ["archiveUnits", "restoreUnits"] },
    { file: "tenants.functions.ts", fns: ["restoreTenants"] },
  ];

  for (const { file, fns } of cases) {
    const source = readFileSync(path.join(LIB, file), "utf8");
    for (const fn of fns) {
      it(`${fn} guards the UPDATE by deleted_at state`, () => {
        const idx = source.indexOf(`export const ${fn}`);
        expect(idx, `${fn} not found`).toBeGreaterThan(-1);
        const body = source.slice(idx, idx + 1200);
        expect(body).toMatch(/\.update\(\s*\{\s*deleted_at:/);
        if (fn.startsWith("archive")) {
          expect(body).toMatch(/\.is\(\s*["']deleted_at["']\s*,\s*null\s*\)/);
        } else {
          expect(body).toMatch(
            /\.not\(\s*["']deleted_at["']\s*,\s*["']is["']\s*,\s*null\s*\)/,
          );
        }
      });
    }
  }
});