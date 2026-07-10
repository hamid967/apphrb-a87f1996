import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listPublishedPosts } from "@/lib/marketing.functions";
import { classify, type SitemapEntry } from "@/lib/sitemap-rules";

const BASE_URL = "https://hrhbs.com";

/**
 * Evaluated at module init (deploy time). Serves as a floor for `lastmod`
 * on any static route that doesn't declare an explicit date — so a fresh
 * deploy naturally advances the sitemap timestamps.
 */
const BUILD_DATE = new Date().toISOString();

/**
 * Static public routes with optional per-path `lastmod` (ISO date). Bump the
 * date here when a page's content changes materially; routes without a date
 * fall back to `BUILD_DATE`. Priority/changefreq come from `classify()`.
 */
const PUBLIC_PATHS: Array<{ path: string; lastmod?: string }> = [
  { path: "/" },
  { path: "/about" },
  { path: "/platform" },
  { path: "/features", lastmod: "2026-07-10" },
  { path: "/request-demo", lastmod: "2026-07-10" },
  { path: "/services" },
  { path: "/pricing" },
  { path: "/compare" },
  { path: "/listings" },
  { path: "/blog" },
  { path: "/faq" },
  { path: "/contact" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = PUBLIC_PATHS.map(({ path, lastmod }) =>
          classify(path, { lastmod: lastmod ?? BUILD_DATE }),
        );

        try {
          const res = await listPublishedPosts();
          for (const post of res.posts ?? []) {
            entries.push(
              classify(`/blog/${post.slug}`, {
                lastmod: post.published_at ?? BUILD_DATE,
              }),
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

        // Force XML content-type explicitly. Some hosting layers (Cloudflare
        // Workers / SSR wrappers) default to text/html when the framework's
        // outer response wins — set both the Response headers AND a matching
        // charset so intermediaries can't downgrade the type.
        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "X-Content-Type-Options": "nosniff",
            Vary: "Accept-Encoding",
          },
        });

      },
    },
  },
});
