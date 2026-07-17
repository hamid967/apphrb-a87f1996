/**
 * Central Redirect Map — Single Source of Truth
 *
 * All 301-style route redirects (shims) in the app are listed here.
 * Each entry corresponds to a route file under src/routes/ whose only
 * job is `throw redirect({ to, replace: true })` in beforeLoad.
 *
 * AUTO-GENERATED — do not edit by hand.
 *   Regenerate: bun run redirects:sync
 *   Verify:     bun run redirects:check
 *   Test:       bun run test src/lib/redirect-map.test.ts
 */

export type RedirectEntry = {
  /** Legacy path (what the user visits). */
  from: string;
  /** Canonical path (where we send them). */
  to: string;
  /** Whether the shim uses replace:true (301-equivalent). */
  replace: boolean;
  /** Whether the shim lives under the _authenticated layout. */
  authProtected: boolean;
  /** Source file for traceability. */
  file: string;
};

export const REDIRECT_MAP: readonly RedirectEntry[] = [
  { from: "/accounting/expenses", to: "/dashboard/expenses/claim/correct", replace: true, authProtected: true, file: "src/routes/_authenticated/accounting.expenses.tsx" },
  { from: "/contracts/$id", to: "/dashboard/contracts/$id", replace: true, authProtected: true, file: "src/routes/_authenticated/contracts.$id.tsx" },
  { from: "/dashboard/crm", to: "/dashboard/crm/leads", replace: true, authProtected: true, file: "src/routes/_authenticated/dashboard.crm.index.tsx" },
  { from: "/dashboard/renew", to: "/dashboard/settings/billing", replace: true, authProtected: true, file: "src/routes/_authenticated/dashboard.renew.tsx" },
  { from: "/dashboard/services-report", to: "/dashboard/services", replace: false, authProtected: true, file: "src/routes/_authenticated/dashboard.services-report.tsx" },
  { from: "/deals", to: "/dashboard/crm/deals", replace: true, authProtected: true, file: "src/routes/_authenticated/deals.index.tsx" },
  { from: "/deals/$id", to: "/dashboard/crm/deals/$id", replace: true, authProtected: true, file: "src/routes/_authenticated/deals.$id.tsx" },
  { from: "/documents", to: "/dashboard/documents", replace: true, authProtected: true, file: "src/routes/_authenticated/documents.index.tsx" },
  { from: "/documents/$id", to: "/dashboard/documents/$id", replace: true, authProtected: true, file: "src/routes/_authenticated/documents.$id.tsx" },
  { from: "/leads", to: "/dashboard/crm/leads", replace: true, authProtected: true, file: "src/routes/_authenticated/leads.index.tsx" },
  { from: "/leads/$id", to: "/dashboard/crm/leads/$id", replace: true, authProtected: true, file: "src/routes/_authenticated/leads.$id.tsx" },
  { from: "/leads/$id/edit", to: "/dashboard/crm/leads/$id/edit", replace: true, authProtected: true, file: "src/routes/_authenticated/leads.$id.edit.tsx" },
  { from: "/leads/new", to: "/dashboard/crm/leads/new", replace: true, authProtected: true, file: "src/routes/_authenticated/leads.new.tsx" },
  { from: "/listings", to: "/", replace: true, authProtected: false, file: "src/routes/listings.index.tsx" },
  { from: "/listings/$slug", to: "/", replace: true, authProtected: false, file: "src/routes/listings.$slug.tsx" },
  { from: "/listings/$slug/apply", to: "/", replace: true, authProtected: false, file: "src/routes/listings.$slug.apply.tsx" },
  { from: "/maintenance", to: "/dashboard/maintenance", replace: true, authProtected: true, file: "src/routes/_authenticated/maintenance.index.tsx" },
  { from: "/maintenance/technicians", to: "/dashboard/maintenance/technicians", replace: true, authProtected: true, file: "src/routes/_authenticated/maintenance.technicians.tsx" },
  { from: "/meetings", to: "/dashboard/crm/meetings", replace: true, authProtected: true, file: "src/routes/_authenticated/meetings.tsx" },
  { from: "/members", to: "/team", replace: true, authProtected: true, file: "src/routes/_authenticated/members.index.tsx" },
  { from: "/onboarding/company", to: "/onboarding/wizard", replace: true, authProtected: false, file: "src/routes/onboarding.company.tsx" },
  { from: "/onboarding/profile", to: "/onboarding/wizard", replace: true, authProtected: false, file: "src/routes/onboarding.profile.tsx" },
  { from: "/onboarding/welcome", to: "/onboarding/wizard", replace: true, authProtected: false, file: "src/routes/onboarding.welcome.tsx" },
  { from: "/onboarding/workspace", to: "/onboarding/wizard", replace: true, authProtected: false, file: "src/routes/onboarding.workspace.tsx" },
  { from: "/owner/portal", to: "/portal/owner", replace: true, authProtected: true, file: "src/routes/_authenticated/owner.portal.index.tsx" },
  { from: "/owner/portal/statements/$id", to: "/portal/owner/statements/$id", replace: true, authProtected: true, file: "src/routes/_authenticated/owner.portal.statements.$id.tsx" },
  { from: "/owners", to: "/dashboard/owners", replace: true, authProtected: true, file: "src/routes/_authenticated/owners.index.tsx" },
  { from: "/owners/$id", to: "/dashboard/owners/$id", replace: true, authProtected: true, file: "src/routes/_authenticated/owners.$id.tsx" },
  { from: "/owners/$id/ledger", to: "/dashboard/owners/$id/ledger", replace: true, authProtected: true, file: "src/routes/_authenticated/owners.$id.ledger.tsx" },
  { from: "/owners/contracts", to: "/dashboard/owners/contracts", replace: true, authProtected: true, file: "src/routes/_authenticated/owners.contracts.tsx" },
  { from: "/properties", to: "/dashboard/properties", replace: true, authProtected: true, file: "src/routes/_authenticated/properties.index.tsx" },
  { from: "/properties/$id", to: "/dashboard/properties/$id", replace: true, authProtected: true, file: "src/routes/_authenticated/properties.$id.tsx" },
  { from: "/properties/new", to: "/dashboard/properties/new", replace: true, authProtected: true, file: "src/routes/_authenticated/properties.new.tsx" },
  { from: "/register-company", to: "/onboarding/wizard", replace: true, authProtected: true, file: "src/routes/_authenticated/register-company.tsx" },
  { from: "/reports", to: "/dashboard/reports", replace: true, authProtected: true, file: "src/routes/_authenticated/reports.index.tsx" },
  { from: "/reports/builder", to: "/dashboard/reports/builder", replace: true, authProtected: true, file: "src/routes/_authenticated/reports.builder.tsx" },
  { from: "/reports/executive", to: "/dashboard/reports/executive", replace: true, authProtected: true, file: "src/routes/_authenticated/reports.executive.tsx" },
  { from: "/reports/pdf", to: "/dashboard/reports/pdf", replace: true, authProtected: true, file: "src/routes/_authenticated/reports.pdf.tsx" },
  { from: "/reports/preview", to: "/dashboard/reports/preview", replace: true, authProtected: true, file: "src/routes/_authenticated/reports.preview.tsx" },
  { from: "/reports/templates", to: "/dashboard/reports/templates", replace: true, authProtected: true, file: "src/routes/_authenticated/reports.templates.tsx" },
  { from: "/reports/templates/manage", to: "/dashboard/reports/templates/manage", replace: true, authProtected: true, file: "src/routes/_authenticated/reports.templates.manage.tsx" },
  { from: "/settings/import", to: "/dashboard/settings/import", replace: true, authProtected: true, file: "src/routes/_authenticated/settings.import.tsx" },
  { from: "/solutions/brokers", to: "/solutions/property-managers", replace: false, authProtected: false, file: "src/routes/solutions.brokers.tsx" },
  { from: "/tenant/portal", to: "/portal/tenant", replace: true, authProtected: true, file: "src/routes/_authenticated/tenant.portal.index.tsx" },
  { from: "/tenant/portal/maintenance", to: "/portal/tenant/maintenance", replace: true, authProtected: true, file: "src/routes/_authenticated/tenant.portal.maintenance.tsx" },
] as const;

/** Look up canonical target for a legacy path (exact match). */
export function getRedirectTarget(from: string): string | undefined {
  return REDIRECT_MAP.find((e) => e.from === from)?.to;
}

/**
 * Trace a redirect chain from a starting path. Returns the ordered list
 * of hops (including the start) and the final target. Detects loops.
 */
export function traceRedirectChain(from: string): {
  chain: string[];
  final: string;
  loop: boolean;
} {
  const chain: string[] = [from];
  const seen = new Set<string>([from]);
  let cur = from;
  // Bounded to guard against pathological input.
  for (let i = 0; i < 32; i++) {
    const next = getRedirectTarget(cur);
    if (!next) return { chain, final: cur, loop: false };
    if (seen.has(next)) {
      chain.push(next);
      return { chain, final: next, loop: true };
    }
    seen.add(next);
    chain.push(next);
    cur = next;
  }
  return { chain, final: cur, loop: true };
}
