#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const checks = [
  {
    name: "admin",
    source: "src/components/admin/adminNavigation.ts",
    base: "/admin",
    indexRoute: "admin.index.tsx",
    routePrefix: "admin",
    blocked: new Set([
      "/admin/subscription-diagnostics",
      "/admin/intro-analytics",
      "/admin/filter-analytics",
      "/admin/realtime-diagnostics",
      "/admin/telemetry-emails",
      "/admin/route-map",
    ]),
  },
  {
    name: "portal",
    source: "src/components/portal/PortalSidebar.tsx",
    base: "/portal",
    indexRoute: "portal.index.tsx",
    routePrefix: "portal",
    blocked: new Set(["/portal/employees", "/portal/appointments", "/portal/assistant"]),
  },
];

let failed = false;

for (const check of checks) {
  const sourcePath = path.join(root, check.source);
  if (!existsSync(sourcePath)) {
    fail(`${check.name}: missing navigation source ${check.source}`);
    continue;
  }

  const content = readFileSync(sourcePath, "utf8");
  const links = [...new Set([...content.matchAll(/to:\s*["']([^"']+)["']/g)].map((match) => match[1]))];

  if (links.length === 0) {
    fail(`${check.name}: no navigation links found in ${check.source}`);
    continue;
  }

  for (const link of links) {
    if (!link.startsWith(check.base)) continue;

    if (check.blocked.has(link)) {
      fail(`${check.name}: blocked non-essential page is visible in navigation: ${link}`);
    }

    const routeFile =
      link === check.base
        ? check.indexRoute
        : `${check.routePrefix}.${link.slice(check.base.length + 1).replaceAll("/", ".")}.tsx`;
    const routePath = path.join(root, "src/routes/_authenticated", routeFile);
    if (!existsSync(routePath)) {
      fail(`${check.name}: navigation link has no matching route: ${link} -> ${routeFile}`);
    }
  }

  console.log(`OK ${check.name}: ${links.length} visible links audited`);
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Navigation audit passed.");
}

function fail(message) {
  failed = true;
  console.error(`FAIL ${message}`);
}
