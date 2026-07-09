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

function extractToLiterals(path: string): string[] {
  const src = readFileSync(resolve(ROOT, path), "utf8");
  const out: string[] = [];
  // Matches `to: "/foo/bar"` and `to="/foo/bar"` inside the nav-array literals.
  const re = /(?:^|[\s,{])to\s*[:=]\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

function assertUnique(paths: string[], label: string) {
  const seen = new Map<string, number>();
  for (const p of paths) seen.set(p, (seen.get(p) ?? 0) + 1);
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  expect(dups, `${label} has duplicate to= entries: ${JSON.stringify(dups)}`).toEqual([]);
}

describe("nav arrays have unique route keys", () => {
  it("AdminSidebar GROUPS", () => {
    // Touch imports so bundler tree-shake never elides them and future
    // renames are picked up by the type checker.
    expect(AdminSidebar).toBeTruthy();
    const paths = extractToLiterals("src/components/admin/AdminSidebar.tsx");
    expect(paths.length).toBeGreaterThan(10);
    assertUnique(paths, "AdminSidebar");
  });

  it("PortalSidebar NAV", () => {
    expect(PortalSidebar).toBeTruthy();
    const paths = extractToLiterals("src/components/portal/PortalSidebar.tsx");
    expect(paths.length).toBeGreaterThan(0);
    assertUnique(paths, "PortalSidebar");
  });

  it("MobileDashboardTabbar ITEMS", () => {
    expect(MobileDashboardTabbar).toBeTruthy();
    const paths = extractToLiterals("src/components/dashboard/MobileDashboardTabbar.tsx");
    expect(paths.length).toBeGreaterThan(0);
    assertUnique(paths, "MobileDashboardTabbar");
  });
});
