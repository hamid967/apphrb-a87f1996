/**
 * Static invariants for the nav-array constants that back sidebars and
 * bottom tabs. Each of these renders with `key={item.to}` (or equivalent),
 * so duplicate `to` values would surface as React "same key" warnings and
 * eat clicks on the second-registered tile.
 *
 * The regression on 2026-07 was two duplicate console errors on every
 * /admin/* page — this test locks the invariant so a rename can't
 * silently re-introduce it.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — importing the module for its constant, not its component.
import * as AdminSidebar from "@/components/admin/AdminSidebar";
// @ts-expect-error — same intent.
import * as PortalSidebar from "@/components/portal/PortalSidebar";
// @ts-expect-error — same intent.
import * as MobileDashboardTabbar from "@/components/dashboard/MobileDashboardTabbar";

// The nav constants are module-private; re-exporting them just for a test
// would leak internals. Instead we assert against the parsed source, which
// is faster and gives file:line context on failure.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * Extract path literals from the object entries of a single named array
 * constant, e.g. `const NAV = [ { to: "/x" }, ... ]` — matches only inside
 * that literal so a `to="..."` prop elsewhere in the file is ignored.
 */
function extractArrayPaths(
  path: string,
  arrayName: string,
  keys: readonly string[],
): string[] {
  const src = readFileSync(resolve(ROOT, path), "utf8");
  const opener = new RegExp(`const\\s+${arrayName}[^=]*=\\s*\\[`).exec(src);
  if (!opener) throw new Error(`Could not find const ${arrayName} in ${path}`);
  const start = opener.index + opener[0].length - 1; // position of "["
  let depth = 0;
  let end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`Unbalanced brackets in ${path}`);
  const body = src.slice(start, end);
  const alt = keys.map((k) => `${k}\\s*:`).join("|");
  const re = new RegExp(`(?:${alt})\\s*"([^"]+)"`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}

function assertUnique(paths: string[], label: string) {
  const seen = new Map<string, number>();
  for (const p of paths) seen.set(p, (seen.get(p) ?? 0) + 1);
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  expect(dups, `${label} has duplicate keys: ${JSON.stringify(dups)}`).toEqual([]);
}

describe("nav arrays have unique route keys", () => {
  it("AdminSidebar GROUPS — item paths unique across all groups", () => {
    expect(AdminSidebar).toBeTruthy();
    const paths = extractArrayPaths(
      "src/components/admin/AdminSidebar.tsx",
      "GROUPS",
      ["to"],
    );
    expect(paths.length).toBeGreaterThan(10);
    assertUnique(paths, "AdminSidebar.GROUPS");
  });

  it("PortalSidebar NAV", () => {
    expect(PortalSidebar).toBeTruthy();
    const paths = extractArrayPaths(
      "src/components/portal/PortalSidebar.tsx",
      "NAV",
      ["to"],
    );
    expect(paths.length).toBeGreaterThan(0);
    assertUnique(paths, "PortalSidebar.NAV");
  });

  it("MobileDashboardTabbar ITEMS — url+search combos unique", () => {
    expect(MobileDashboardTabbar).toBeTruthy();
    // `url` alone can repeat when `search` differentiates entries
    // (e.g. /dashboard vs /dashboard?view=smart), so react-keys use
    // `url + search`. Assert that composite is unique.
    const src = readFileSync(
      resolve(ROOT, "src/components/dashboard/MobileDashboardTabbar.tsx"),
      "utf8",
    );
    const opener = /const\s+ITEMS[^=]*=\s*\[/.exec(src)!;
    const start = opener.index + opener[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = start; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = src.slice(start, end);
    // Split by top-level `{` blocks to line up url with its inline search.
    const blocks = body.split(/\},\s*\{/).map((b, i, arr) => {
      if (i === 0) return b + "}";
      if (i === arr.length - 1) return "{" + b;
      return "{" + b + "}";
    });
    const keys = blocks
      .map((blk) => {
        const url = /url\s*:\s*"([^"]+)"/.exec(blk)?.[1] ?? "";
        const search = /search\s*:\s*(\{[^}]*\})/.exec(blk)?.[1] ?? "";
        return url + "::" + search;
      })
      .filter((k) => k !== "::");
    expect(keys.length).toBeGreaterThan(0);
    assertUnique(keys, "MobileDashboardTabbar.ITEMS");
  });
});

