/**
 * Build the absolute URL for a dynamically-generated Open Graph image.
 * Points at the /api/public/og/image.svg edge route which renders an SVG
 * on the Cloudflare Worker runtime — no native deps, cached at the edge.
 *
 * Use in a route's head():
 *   { property: "og:image", content: buildOgImageUrl({ title, subtitle, kind }) }
 */

export type OgKind = "page" | "listing" | "article" | "dashboard" | "auth" | "docs";

export type OgParams = {
  title: string;
  subtitle?: string;
  kind?: OgKind;
  lang?: "ar" | "en";
  /** Force a base origin. Defaults to the canonical production host. */
  origin?: string;
  /** "png" (default, best cross-platform support incl. Facebook/iMessage)
   *  or "svg" (lighter, honored by X/LinkedIn/Slack/Discord/Telegram). */
  format?: "png" | "svg";
  /** Override og:type. Defaults derived from kind (see KIND_OG_TYPE). */
  ogType?: string;
  /** Absolute canonical URL for og:url. */
  url?: string;
  /** Override og:site_name (defaults to brand). */
  siteName?: string;
  /** Additional locales (e.g. the other language you also render). */
  alternateLocales?: string[];
  /** Twitter @handle (without @). */
  twitterSite?: string;
};

const DEFAULT_ORIGIN = "https://hrhbs.com";
const DEFAULT_SITE_NAME = "HRHBS · Aqari";
const DEFAULT_TWITTER_SITE = "hrhbs";

// Smart og:type per kind. Facebook's Open Graph spec: only a small set
// of top-level object types are honored; anything else falls back to
// "website". We stick to spec-valid values.
const KIND_OG_TYPE: Record<OgKind, string> = {
  page: "website",
  listing: "product",
  article: "article",
  dashboard: "website",
  auth: "website",
  docs: "article",
};

// og:locale expects `xx_YY` (BCP-47-ish with underscore).
const LOCALE_MAP: Record<"ar" | "en", string> = {
  ar: "ar_SA",
  en: "en_US",
};

/** Resolve the og:locale for a given lang (default "ar"). */
export function ogLocale(lang?: "ar" | "en"): string {
  return LOCALE_MAP[lang ?? "ar"];
}

export function buildOgImageUrl(params: OgParams): string {
  const base = (params.origin || DEFAULT_ORIGIN).replace(/\/+$/, "");
  const format = params.format ?? "png";
  const qs = new URLSearchParams();
  qs.set("title", params.title);
  if (params.subtitle) qs.set("subtitle", params.subtitle);
  qs.set("kind", params.kind ?? "page");
  qs.set("lang", params.lang ?? "ar");
  return `${base}/api/public/og/image.${format}?${qs.toString()}`;
}

/**
 * Return the full set of Open Graph + Twitter meta entries for a route's
 * head(). Includes:
 *  - og:image (+ width/height/type/alt) and twitter:image
 *  - og:type            (smart default per kind)
 *  - og:locale          (from lang) + optional og:locale:alternate
 *  - og:site_name
 *  - og:title / og:description mirrors (only if title/subtitle passed —
 *    routes usually set these themselves; safe to override.)
 *  - og:url             (only when `url` is passed)
 *  - twitter:card, twitter:site
 *
 * Defaults to PNG (Facebook/iMessage compatible). Pass { format: "svg" }
 * for the lighter SVG variant.
 */
export function ogImageMeta(params: OgParams) {
  const url = buildOgImageUrl(params);
  const isPng = (params.format ?? "png") === "png";
  const lang = params.lang ?? "ar";
  const kind = params.kind ?? "page";
  const ogType = params.ogType ?? KIND_OG_TYPE[kind];
  const siteName = params.siteName ?? DEFAULT_SITE_NAME;
  const twitterSite = params.twitterSite ?? DEFAULT_TWITTER_SITE;
  const primaryLocale = ogLocale(lang);
  const alternates =
    params.alternateLocales ??
    // Auto-pair AR↔EN when only one lang is given.
    (lang === "ar" ? ["en_US"] : ["ar_SA"]);

  const meta: Array<
    | { property: string; content: string }
    | { name: string; content: string }
  > = [
    // Image
    { property: "og:image", content: url },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:type", content: isPng ? "image/png" : "image/svg+xml" },
    { property: "og:image:alt", content: params.title },
    // Type + brand + locale
    { property: "og:type", content: ogType },
    { property: "og:site_name", content: siteName },
    { property: "og:locale", content: primaryLocale },
    // Twitter
    { name: "twitter:image", content: url },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: `@${twitterSite}` },
    { name: "twitter:creator", content: `@${twitterSite}` },
  ];

  for (const loc of alternates) {
    if (loc && loc !== primaryLocale) {
      meta.push({ property: "og:locale:alternate", content: loc });
    }
  }

  if (params.url) {
    meta.push({ property: "og:url", content: params.url });
  }

  return meta;
}