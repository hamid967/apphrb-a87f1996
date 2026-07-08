/**
 * Shared head() helper for portal (المحطات) pages. Emits per-station
 * dynamic OG images plus title/description meta, using the smart
 * ogImageMeta defaults (og:type, og:locale, og:site_name…).
 */
import { ogImageMeta } from "@/lib/og-image";

export type PortalHeadInput = {
  /** Arabic title (used as the visible page title). */
  titleAr: string;
  /** English title (fallback for og if lang override needed). */
  titleEn: string;
  /** Arabic description / subtitle. */
  descAr: string;
  /** Optional canonical URL for og:url + <link canonical>. */
  path?: string;
};

const BASE = "https://hrhbs.com";

export function portalHead(input: PortalHeadInput) {
  const { titleAr, titleEn, descAr, path } = input;
  const fullTitle = `${titleAr} — محطات Aqari`;
  const url = path ? `${BASE}${path}` : undefined;

  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: descAr },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: descAr },
      ...ogImageMeta({
        title: titleAr,
        subtitle: `${titleEn} · محطات Aqari`,
        kind: "dashboard",
        lang: "ar",
        url,
      }),
    ],
    ...(url ? { links: [{ rel: "canonical", href: url }] } : {}),
  };
}
