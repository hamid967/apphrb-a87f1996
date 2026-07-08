import { createFileRoute } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/og-image";

export const Route = createFileRoute("/docs/api")({
  head: () => ({
    meta: [
      { title: "Aqari API Docs — HBSpro" },
      {
        name: "description",
        content:
          "Public REST API for properties, units, contracts, invoices, payments, and auctions (create, update, place bids). Bearer authentication, scoped API keys, 60 req/min rate limit.",
      },
      { property: "og:title", content: "Aqari API Docs" },
      {
        property: "og:description",
        content: "OpenAPI 3.1 reference for the Aqari real-estate cloud.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://hrhbs.com/docs/api" },
      ...ogImageMeta({
        title: "Aqari API",
        subtitle: "OpenAPI 3.1 · REST reference",
        kind: "docs",
        lang: "en",
      }),
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/docs/api" }],
  }),
  component: ApiDocs,
});

function ApiDocs() {
  return (
    <div className="min-h-screen bg-background">
      <script
        id="api-reference"
        data-url="/api/public/v1/openapi.json"
        data-configuration='{"theme":"purple","layout":"modern","hideDownloadButton":false}'
      />
      <script
        // Scalar API reference CDN — renders the OpenAPI spec into a docs UI.
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
        async
      />
      <noscript>
        <div className="p-6">
          <h1 className="text-2xl font-semibold">Aqari API</h1>
          <p className="mt-2 text-muted-foreground">
            Enable JavaScript to view interactive docs, or fetch the raw spec at{" "}
            <a className="underline" href="/api/public/v1/openapi.json">
              /api/public/v1/openapi.json
            </a>
            .
          </p>
        </div>
      </noscript>
    </div>
  );
}
