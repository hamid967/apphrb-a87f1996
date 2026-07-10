import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listPublishedPosts } from "@/lib/marketing.functions";
import { classify, type SitemapEntry } from "@/lib/sitemap-rules";

const BASE_URL = "https://hrhbs.com";


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
