import { createFileRoute } from "@tanstack/react-router";

// ---------------------------------------------------------------------------
// Dynamic Open Graph image endpoint — returns a PNG (1200x630) rendered
// with @vercel/og (Satori + resvg-wasm). Same ?title=&subtitle=&kind=&lang=
// contract as image.svg. Serve this to Facebook / iMessage / older
// scrapers that don't render SVG.
// ---------------------------------------------------------------------------

const BRAND = "HRHBS · Aqari";
const MAX_TITLE = 90;
const MAX_SUB = 140;

type Kind = "page" | "listing" | "article" | "dashboard" | "auth" | "docs";

const KIND_ACCENT: Record<Kind, string> = {
  page: "#7C3AED",
  listing: "#10B981",
  article: "#3B82F6",
  dashboard: "#F59E0B",
  auth: "#EF4444",
  docs: "#0EA5E9",
};

const KIND_LABEL: Record<Kind, { ar: string; en: string }> = {
  page: { ar: "صفحة", en: "PAGE" },
  listing: { ar: "عقار", en: "LISTING" },
  article: { ar: "مقال", en: "ARTICLE" },
  dashboard: { ar: "لوحة", en: "DASHBOARD" },
  auth: { ar: "حساب", en: "ACCOUNT" },
  docs: { ar: "دليل", en: "DOCS" },
};

export const Route = createFileRoute("/api/public/og/image.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const p = url.searchParams;
        const title = (p.get("title") || "HRHBS — Aqari").slice(0, MAX_TITLE).trim();
        const subtitle = (p.get("subtitle") || "").slice(0, MAX_SUB).trim();
        const kindRaw = (p.get("kind") || "page").toLowerCase() as Kind;
        const kind: Kind = (
          ["page", "listing", "article", "dashboard", "auth", "docs"] as Kind[]
        ).includes(kindRaw)
          ? kindRaw
          : "page";
        const lang: "ar" | "en" = (p.get("lang") || "ar") === "en" ? "en" : "ar";

        const isAr = lang === "ar";
        const accent = KIND_ACCENT[kind];
        const kindLabel = KIND_LABEL[kind][lang];
        const dir = isAr ? "rtl" : "ltr";
        const align = isAr ? "flex-end" : "flex-start";
        const textAlign = isAr ? "right" : "left";

        try {
          const { ImageResponse } = await import("@vercel/og");

          return new ImageResponse(
            {
              type: "div",
              props: {
                style: {
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "70px 80px",
                  background:
                    "linear-gradient(135deg, #0F1B3D 0%, #152556 55%, #0B1230 100%)",
                  color: "#FFFFFF",
                  fontFamily: "sans-serif",
                  position: "relative",
                },
                children: [
                  // accent bar
                  {
                    type: "div",
                    props: {
                      style: {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: 12,
                        height: "100%",
                        background: accent,
                        display: "flex",
                      },
                    },
                  },
                  // brand + kind pill
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: isAr ? "row-reverse" : "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                      },
                      children: [
                        {
                          type: "div",
                          props: {
                            style: {
                              display: "flex",
                              flexDirection: isAr ? "row-reverse" : "row",
                              alignItems: "center",
                              gap: 16,
                            },
                            children: [
                              {
                                type: "div",
                                props: {
                                  style: {
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    background: accent,
                                    display: "flex",
                                  },
                                },
                              },
                              {
                                type: "div",
                                props: {
                                  style: {
                                    fontSize: 28,
                                    fontWeight: 700,
                                    letterSpacing: 0.5,
                                    color: "#E8EDF3",
                                  },
                                  children: BRAND,
                                },
                              },
                            ],
                          },
                        },
                        {
                          type: "div",
                          props: {
                            style: {
                              padding: "8px 20px",
                              borderRadius: 999,
                              background: `${accent}2E`,
                              border: `2px solid ${accent}99`,
                              color: accent,
                              fontSize: 18,
                              fontWeight: 700,
                              letterSpacing: 1,
                              display: "flex",
                            },
                            children: kindLabel,
                          },
                        },
                      ],
                    },
                  },
                  // title + subtitle
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: "column",
                        alignItems: align,
                        gap: 30,
                        width: "100%",
                      },
                      children: [
                        {
                          type: "div",
                          props: {
                            style: {
                              fontSize: 72,
                              fontWeight: 800,
                              lineHeight: 1.15,
                              color: "#FFFFFF",
                              maxWidth: "90%",
                              textAlign,
                              direction: dir,
                              display: "flex",
                            },
                            children: title,
                          },
                        },
                        subtitle
                          ? {
                              type: "div",
                              props: {
                                style: {
                                  fontSize: 30,
                                  fontWeight: 500,
                                  lineHeight: 1.35,
                                  color: "#B8C2D9",
                                  maxWidth: "90%",
                                  textAlign,
                                  direction: dir,
                                  display: "flex",
                                },
                                children: subtitle,
                              },
                            }
                          : null,
                      ].filter(Boolean),
                    },
                  },
                  // footer
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        flexDirection: isAr ? "row-reverse" : "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        color: "#8A94B2",
                        fontSize: 22,
                      },
                      children: [
                        {
                          type: "div",
                          props: { style: { display: "flex" }, children: "hrhbs.com" },
                        },
                        {
                          type: "div",
                          props: {
                            style: { display: "flex" },
                            children: isAr
                              ? "الحلول العقارية الذكية"
                              : "Smart real-estate cloud",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            } as unknown as React.ReactElement,
            {
              width: 1200,
              height: 630,
              headers: {
                "Cache-Control":
                  "public, max-age=3600, s-maxage=86400, immutable",
                "X-Content-Type-Options": "nosniff",
              },
            },
          );
        } catch (err) {
          // Fallback: redirect to the SVG endpoint so the page still has an image.
          const svgUrl = new URL("/api/public/og/image.svg", url.origin);
          svgUrl.search = url.search;
          return Response.redirect(svgUrl.toString(), 307);
        }
      },
    },
  },
});
