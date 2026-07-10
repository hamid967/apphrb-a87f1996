import { createFileRoute } from "@tanstack/react-router";

// ---------------------------------------------------------------------------
// Dynamic Open Graph image endpoint — returns an SVG (1200x630) built at
// request time from ?title=&subtitle=&kind=&lang= search params.
// Works on the Cloudflare Worker runtime (no native binaries, no WASM).
// SVG is honored by Twitter/X, LinkedIn, Slack, Discord, Telegram and
// WhatsApp. Facebook's crawler still prefers raster; we accept that
// trade-off for a zero-dependency, edge-safe implementation.
// ---------------------------------------------------------------------------

const BRAND = "HRHBS · HBSpro";
const DEFAULT_KIND = "page";
const MAX_TITLE = 90;
const MAX_SUB = 140;

// XML/SVG safe text
function esc(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Naive word-wrap: split at spaces, hard-break long tokens.
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (w.length > maxChars) {
      // hard chunk long token
      for (let i = 0; i < w.length; i += maxChars) {
        lines.push(w.slice(i, i + maxChars));
      }
      line = "";
    } else {
      line = w;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length > maxLines) {
    const last = lines[maxLines - 1];
    lines.length = maxLines;
    lines[maxLines - 1] = last.length > 3 ? last.slice(0, -1) + "…" : last;
  }
  return lines;
}

type Kind = "page" | "listing" | "article" | "dashboard" | "auth" | "docs";

// Accent color per kind — semantic, subtle.
const KIND_ACCENT: Record<Kind, string> = {
  page: "#7C3AED",
  listing: "#10B981",
  article: "#3B82F6",
  dashboard: "#F59E0B",
  auth: "#EF4444",
  docs: "#0EA5E9",
};

function buildSvg({
  title,
  subtitle,
  kind,
  lang,
}: {
  title: string;
  subtitle: string;
  kind: Kind;
  lang: "ar" | "en";
}): string {
  const isAr = lang === "ar";
  const accent = KIND_ACCENT[kind] ?? KIND_ACCENT.page;
  const titleLines = wrap(title.slice(0, MAX_TITLE), isAr ? 34 : 30, 3);
  const subLines = wrap(subtitle.slice(0, MAX_SUB), isAr ? 60 : 56, 2);
  const dir = isAr ? "rtl" : "ltr";
  const anchor = isAr ? "end" : "start";
  const xText = isAr ? 1120 : 80;
  const fontStack = isAr
    ? "'Almarai','IBM Plex Sans Arabic','Segoe UI',system-ui,sans-serif"
    : "'Urbanist','Inter','Segoe UI',system-ui,sans-serif";

  const titleY = 240;
  const titleLh = 88;
  const subY = titleY + titleLines.length * titleLh + 40;
  const subLh = 44;

  const kindLabel = {
    page: isAr ? "صفحة" : "PAGE",
    listing: isAr ? "عقار" : "LISTING",
    article: isAr ? "مقال" : "ARTICLE",
    dashboard: isAr ? "لوحة" : "DASHBOARD",
    auth: isAr ? "حساب" : "ACCOUNT",
    docs: isAr ? "دليل" : "DOCS",
  }[kind];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F1B3D"/>
      <stop offset="55%" stop-color="#152556"/>
      <stop offset="100%" stop-color="#0B1230"/>
    </linearGradient>
    <radialGradient id="glow" cx="85%" cy="15%" r="55%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="70%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- accent bar -->
  <rect x="0" y="0" width="12" height="630" fill="${accent}"/>

  <!-- brand row -->
  <g font-family="${fontStack}" fill="#E8EDF3">
    <circle cx="80" cy="90" r="18" fill="${accent}"/>
    <text x="115" y="98" font-size="28" font-weight="700" letter-spacing="0.5">${esc(BRAND)}</text>
  </g>

  <!-- kind pill -->
  <g transform="translate(${isAr ? 1120 - 130 : 80}, 150)">
    <rect rx="18" ry="18" width="130" height="36" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.6"/>
    <text x="65" y="24" font-family="${fontStack}" font-size="18" font-weight="700" fill="${accent}" text-anchor="middle" letter-spacing="1">${esc(kindLabel)}</text>
  </g>

  <!-- title -->
  <g font-family="${fontStack}" fill="#FFFFFF" font-weight="800" direction="${dir}">
    ${titleLines
      .map(
        (l, i) =>
          `<text x="${xText}" y="${titleY + i * titleLh}" font-size="72" text-anchor="${anchor}">${esc(l)}</text>`,
      )
      .join("\n    ")}
  </g>

  <!-- subtitle -->
  ${
    subtitle
      ? `<g font-family="${fontStack}" fill="#B8C2D9" font-weight="500" direction="${dir}">
    ${subLines
      .map(
        (l, i) =>
          `<text x="${xText}" y="${subY + i * subLh}" font-size="30" text-anchor="${anchor}">${esc(l)}</text>`,
      )
      .join("\n    ")}
  </g>`
      : ""
  }

  <!-- footer -->
  <g font-family="${fontStack}" fill="#8A94B2" font-size="22">
    <text x="80" y="580">hrhbs.com</text>
    <text x="1120" y="580" text-anchor="end">${isAr ? "الحلول العقارية الذكية" : "Smart real-estate cloud"}</text>
  </g>
</svg>`;
}

export const Route = createFileRoute("/api/public/og/image.svg")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const p = url.searchParams;
        const title = (p.get("title") || "HRHBS — HBSpro").trim();
        const subtitle = (p.get("subtitle") || "").trim();
        const kindRaw = (p.get("kind") || DEFAULT_KIND).toLowerCase() as Kind;
        const kind: Kind = (
          ["page", "listing", "article", "dashboard", "auth", "docs"] as Kind[]
        ).includes(kindRaw)
          ? kindRaw
          : "page";
        const lang: "ar" | "en" = (p.get("lang") || "ar") === "en" ? "en" : "ar";

        const svg = buildSvg({ title, subtitle, kind, lang });

        return new Response(svg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            // 24h edge cache, allow long browser cache with revalidation.
            "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});