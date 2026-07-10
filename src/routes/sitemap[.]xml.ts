import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listPublishedPosts } from "@/lib/marketing.functions";

const BASE_URL = "https://hrhbs.com";

type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

interface SitemapEntry {
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
const RULES: Array<{
  test: (path: string) => boolean;
  changefreq: ChangeFreq;
  priority: string;
}> = [
  { test: (p) => p === "/", changefreq: "weekly", priority: "1.0" },
  // High-intent conversion pages
  { test: (p) => /^\/(request-demo|signup|get-started|trial|checkout)$/.test(p), changefreq: "weekly", priority: "0.9" },
  // Core product / commercial pages
  { test: (p) => /^\/(features|platform|services|pricing|solutions|product)(\/|$)/.test(p), changefreq: "weekly", priority: "0.9" },
  // Frequently-updated listings/catalogs
  { test: (p) => /^\/(listings|catalog|properties|search)(\/|$)/.test(p), changefreq: "daily", priority: "0.9" },
  // Blog index & posts
  { test: (p) => p === "/blog", changefreq: "weekly", priority: "0.8" },
  { test: (p) => p.startsWith("/blog/"), changefreq: "monthly", priority: "0.6" },
  // Comparison / evaluation
  { test: (p) => /^\/(compare|vs)(\/|$)/.test(p), changefreq: "monthly", priority: "0.7" },
  // Company / info
  { test: (p) => /^\/(about|team|careers|partners)(\/|$)/.test(p), changefreq: "monthly", priority: "0.7" },
  // Support / low-priority evergreen
  { test: (p) => /^\/(faq|help|support|contact|docs)(\/|$)/.test(p), changefreq: "monthly", priority: "0.6" },
  // Legal
  { test: (p) => /^\/(privacy|terms|legal|cookies)(\/|$)/.test(p), changefreq: "yearly", priority: "0.3" },
];

const DEFAULT_RULE = { changefreq: "monthly" as ChangeFreq, priority: "0.5" };

function classify(path: string, overrides?: Partial<SitemapEntry>): SitemapEntry {
  const match = RULES.find((r) => r.test(path)) ?? DEFAULT_RULE;
  return {
    path,
    changefreq: overrides?.changefreq ?? match.changefreq,
    priority: overrides?.priority ?? match.priority,
    lastmod: overrides?.lastmod,
  };
}

/**
 * Static public routes. Add a path here (or let it come from a loader below)
 * and it automatically inherits the right priority/changefreq via `classify()`.
 */
const PUBLIC_PATHS: string[] = [
  "/",
  "/about",
  "/platform",
  "/features",
  "/request-demo",
  "/services",
  "/pricing",
  "/compare",
  "/listings",
  "/blog",
  "/faq",
  "/contact",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = PUBLIC_PATHS.map((p) => classify(p));

        try {
          const res = await listPublishedPosts();
          for (const post of res.posts ?? []) {
            entries.push(
              classify(`/blog/${post.slug}`, { lastmod: post.published_at ?? undefined }),
            );
          }
        } catch {
          // Ignore — omit dynamic entries if backend unavailable.
        }


        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
