/**
 * Guardrail: every `to: "/..."` literal used by dashboard/admin UI must resolve
 * to a real TanStack route (extracted from src/routeTree.gen.ts's
 * FileRoutesByFullPath). Prevents shipping cards / buttons that navigate to
 * 404 pages (e.g. the removed /admin/seed, /admin/systest tiles).
 *
 * Scan surface: src/routes/_authenticated/** and src/components/**.
 * Skips dynamic values (`to={foo}`), template strings, and non-absolute paths.
 * `$param` segments in the route table match any concrete value.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

function extractRoutePaths(): string[] {
  const gen = readFileSync(path.join(ROOT, "src/routeTree.gen.ts"), "utf8");
  const start = gen.indexOf("interface FileRoutesByFullPath");
  const block = gen.slice(start, gen.indexOf("}", start));
  const paths = new Set<string>();
  for (const m of block.matchAll(/'([^']+)':/g)) {
    let p = m[1];
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    paths.add(p);
  }
  paths.add("/"); // root
  return [...paths];
}

function matchesRoute(target: string, routes: string[]): boolean {
  // Strip query/hash
  const clean = target.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  const parts = clean.split("/");
  return routes.some((r) => {
    const rParts = r.split("/");
    if (rParts.length !== parts.length) return false;
    return rParts.every((seg, i) => seg.startsWith("$") || seg === parts[i]);
  });
}

const IGNORE_PREFIXES = [
  "/api/",           // server routes (not in FileRoutesByFullPath)
  "/lovable/",       // internal
  "mailto:",
  "tel:",
  "http://",
  "https://",
  "#",
];

function collectToLiterals(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const found = new Set<string>();
  // JSX:  to="/path"
  for (const m of src.matchAll(/\bto=(?:"|')(\/[^"'\s{}$`]*)(?:"|')/g)) {
    found.add(m[1]);
  }
  // Object literal:  to: "/path"
  for (const m of src.matchAll(/\bto\s*:\s*(?:"|')(\/[^"'\s{}$`]*)(?:"|')/g)) {
    found.add(m[1]);
  }
  // navigate({ to: "/path" }) — already covered by object-literal regex above.
  return [...found].filter(
    (p) => !IGNORE_PREFIXES.some((prefix) => p.startsWith(prefix)),
  );
}

describe("UI link integrity: every `to` literal resolves to a real route", () => {
  const routes = extractRoutePaths();
  const scanDirs = [
    path.join(ROOT, "src/routes/_authenticated"),
    path.join(ROOT, "src/components"),
  ];
  const files = scanDirs.flatMap((d) => walk(d));

  const offenders: Array<{ file: string; to: string }> = [];
  for (const file of files) {
    for (const to of collectToLiterals(file)) {
      if (!matchesRoute(to, routes)) {
        offenders.push({ file: path.relative(ROOT, file), to });
      }
    }
  }

  it("has no dead `to` links", () => {
    expect(
      offenders,
      `Dead route references — remove or fix them:\n${offenders
        .map((o) => `  - ${o.to}  (in ${o.file})`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
