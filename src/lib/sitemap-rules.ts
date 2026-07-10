export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: ChangeFreq;
  priority?: string;
}

/**
 * Rule-based defaults so that any new public route added to `PUBLIC_PATHS`
 * (or any future dynamic path) gets sensible priority/changefreq automatically
 * without touching each entry. Rules are evaluated in order; first match wins.
 */
export const RULES: Array<{
  test: (path: string) => boolean;
  changefreq: ChangeFreq;
  priority: string;
}> = [
  { test: (p) => p === "/", changefreq: "weekly", priority: "1.0" },
  // High-intent conversion pages
  {
    test: (p) => /^\/(request-demo|signup|get-started|trial|checkout)$/.test(p),
    changefreq: "weekly",
    priority: "0.9",
  },
  // Core product / commercial pages
  {
    test: (p) => /^\/(features|platform|services|pricing|solutions|product)(\/|$)/.test(p),
    changefreq: "weekly",
    priority: "0.9",
  },
  // Frequently-updated listings/catalogs
  {
    test: (p) => /^\/(listings|catalog|properties|search)(\/|$)/.test(p),
    changefreq: "daily",
    priority: "0.9",
  },
  // Blog index & posts
  { test: (p) => p === "/blog", changefreq: "weekly", priority: "0.8" },
  { test: (p) => p.startsWith("/blog/"), changefreq: "monthly", priority: "0.6" },
  // Comparison / evaluation
  { test: (p) => /^\/(compare|vs)(\/|$)/.test(p), changefreq: "monthly", priority: "0.7" },
  // Company / info
  {
    test: (p) => /^\/(about|team|careers|partners)(\/|$)/.test(p),
    changefreq: "monthly",
    priority: "0.7",
  },
  // Support / low-priority evergreen
  {
    test: (p) => /^\/(faq|help|support|contact|docs)(\/|$)/.test(p),
    changefreq: "monthly",
    priority: "0.6",
  },
  // Legal
  {
    test: (p) => /^\/(privacy|terms|legal|cookies)(\/|$)/.test(p),
    changefreq: "yearly",
    priority: "0.3",
  },
];

export const DEFAULT_RULE = { changefreq: "monthly" as ChangeFreq, priority: "0.5" };

export function classify(path: string, overrides?: Partial<SitemapEntry>): SitemapEntry {
  const match = RULES.find((r) => r.test(path)) ?? DEFAULT_RULE;
  return {
    path,
    changefreq: overrides?.changefreq ?? match.changefreq,
    priority: overrides?.priority ?? match.priority,
    lastmod: overrides?.lastmod,
  };
}
