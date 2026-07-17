import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { REDIRECT_MAP, getRedirectTarget, traceRedirectChain } from "./redirect-map";

/**
 * Auto-generated coverage: every entry in REDIRECT_MAP is validated for
 * shape, loop-freedom, target reachability, and file existence.
 *
 * Regenerate the map with `bun run redirects:sync` after adding/removing
 * a shim; the sibling `redirects:check` step guarantees CI catches drift.
 */

const ROOT = process.cwd();

// Collect the union of all known canonical route IDs from src/routes/**.
// This is a coarse check — enough to catch typos / dead targets.
function collectRoutePaths(): Set<string> {
  const out = new Set<string>();
  function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && p.endsWith(".tsx")) {
        const src = fs.readFileSync(p, "utf8");
        const m = src.match(/createFileRoute\(\s*["']([^"']+)["']\s*,?\s*\)/);
        if (m) {
          // Normalize: strip _authenticated, trailing slash, index suffix.
          const norm = m[1]
            .replace(/^\/_authenticated/, "")
            .replace(/\/$/, "");
          out.add(norm || "/");
        }
      }
    }
  }
  walk(path.join(ROOT, "src/routes"));
  return out;
}

const KNOWN_PATHS = collectRoutePaths();

/** Path may include $params; normalize the dynamic segments before matching. */
function matchesKnownRoute(pathToMatch: string): boolean {
  if (KNOWN_PATHS.has(pathToMatch)) return true;
  // Some targets include query strings (e.g. "/dashboard/expenses?x=y") — strip
  const noQuery = pathToMatch.split("?")[0]!.replace(/\/$/, "") || "/";
  if (KNOWN_PATHS.has(noQuery)) return true;
  // Replace concrete segments with $param and try again against every known path.
  const parts = noQuery.split("/");
  for (const known of KNOWN_PATHS) {
    const kParts = known.split("/");
    if (kParts.length !== parts.length) continue;
    const ok = kParts.every(
      (kp, i) => kp === parts[i] || kp.startsWith("$"),
    );
    if (ok) return true;
  }
  return false;
}

describe("REDIRECT_MAP shape", () => {
  it("is non-empty", () => {
    expect(REDIRECT_MAP.length).toBeGreaterThan(0);
  });

  it("every entry has non-empty from/to and file", () => {
    for (const e of REDIRECT_MAP) {
      expect(e.from, `entry ${JSON.stringify(e)}`).toMatch(/^\//);
      expect(e.to, `entry ${JSON.stringify(e)}`).toMatch(/^\//);
      expect(e.file).toMatch(/^src\/routes\//);
    }
  });

  it("has no duplicate `from` paths", () => {
    const seen = new Map<string, string>();
    for (const e of REDIRECT_MAP) {
      const prev = seen.get(e.from);
      expect(prev, `duplicate 'from' ${e.from} in ${prev} and ${e.file}`).toBeUndefined();
      seen.set(e.from, e.file);
    }
  });

  it("never redirects to itself", () => {
    for (const e of REDIRECT_MAP) {
      expect(e.to, `self-redirect in ${e.file}`).not.toBe(e.from);
    }
  });
});

describe("REDIRECT_MAP chain integrity", () => {
  it("has no redirect loops from any entry point", () => {
    const loops: string[] = [];
    for (const e of REDIRECT_MAP) {
      const t = traceRedirectChain(e.from);
      if (t.loop) loops.push(`${e.from} -> ${t.chain.join(" -> ")}`);
    }
    expect(loops, `redirect loops detected:\n${loops.join("\n")}`).toHaveLength(0);
  });

  it("chains resolve within a reasonable number of hops (<= 3)", () => {
    const long: string[] = [];
    for (const e of REDIRECT_MAP) {
      const t = traceRedirectChain(e.from);
      if (t.chain.length > 4) long.push(`${e.from} (${t.chain.length} hops)`);
    }
    expect(long, `long chains:\n${long.join("\n")}`).toHaveLength(0);
  });
});

describe("REDIRECT_MAP target reachability", () => {
  it("every final canonical target maps to an existing route file", () => {
    const missing: string[] = [];
    for (const e of REDIRECT_MAP) {
      const { final } = traceRedirectChain(e.from);
      if (!matchesKnownRoute(final)) missing.push(`${e.from} -> ${final} (from ${e.file})`);
    }
    expect(missing, `unreachable targets:\n${missing.join("\n")}`).toHaveLength(0);
  });
});

describe("REDIRECT_MAP source file integrity", () => {
  it("every listed shim file exists", () => {
    for (const e of REDIRECT_MAP) {
      expect(fs.existsSync(path.join(ROOT, e.file)), `missing shim file ${e.file}`).toBe(true);
    }
  });
});

describe("getRedirectTarget", () => {
  it("returns the canonical target for a known legacy path", () => {
    const sample = REDIRECT_MAP[0]!;
    expect(getRedirectTarget(sample.from)).toBe(sample.to);
  });

  it("returns undefined for an unknown path", () => {
    expect(getRedirectTarget("/definitely-not-a-shim-xyz")).toBeUndefined();
  });
});
