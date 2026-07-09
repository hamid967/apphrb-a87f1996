import { createFileRoute } from "@tanstack/react-router";

const RESOURCES = ["properties", "units", "contracts", "invoices", "payments", "auctions"] as const;

function pathsFor(name: string) {
  const Cap = name[0].toUpperCase() + name.slice(1);
  return {
    [`/api/public/v1/${name}`]: {
      get: {
        summary: `List ${name}`,
        tags: [Cap],
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
        ],
        responses: {
          "200": {
            description: "Paginated list",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ListResponse" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    [`/api/public/v1/${name}/{id}`]: {
      get: {
        summary: `Get ${name.slice(0, -1)} by id`,
        tags: [Cap],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Item" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { description: "Not found" },
        },
      },
    },
  };
}

const spec: {
  openapi: string;
  info: object;
  servers: object[];
  security: object[];
  tags: object[];
  paths: Record<string, Record<string, unknown>>;
  components: object;
} = {
  openapi: "3.1.0",
  info: {
    title: "Aqari (Aqari) Public API",
    version: "1.0.0",
    description:
      "Read-only API for real-estate portfolio data. Authenticate with `Authorization: Bearer <api_key>`. Rate limit: 60 requests/minute per key.",
    contact: { name: "HRHBS", url: "https://hrhbs.com" },
  },
  servers: [{ url: "https://receipt-rhapsody-suite.lovable.app" }],
  security: [{ bearerAuth: [] }],
  tags: RESOURCES.map((r) => ({ name: r[0].toUpperCase() + r.slice(1) })),
  paths: {
    ...RESOURCES.reduce((acc, r) => Object.assign(acc, pathsFor(r)), {} as Record<string, unknown>),
    "/api/public/v1/auctions/{id}/bids": {
      get: {
        summary: "List bids for an auction (chronological history)",
        description:
          "Returns every bid placed on the given auction, most-recent first. Requires the auction to belong to the API key's organization. `bidder_id` is intentionally omitted to protect bidder privacy.",
        tags: ["Auctions"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Auction id",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
        ],
        responses: {
          "200": {
            description: "Paginated bid history",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/AuctionBid" } },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "404": { description: "Auction not found in your organization" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" },
    },
    schemas: {
      ListResponse: {
        type: "object",
        properties: {
          data: { type: "array", items: { type: "object" } },
          limit: { type: "integer" },
          offset: { type: "integer" },
          total: { type: "integer" },
        },
      },
      Auction: {
        type: "object",
        description:
          "Real-estate auction. `status` is one of draft, scheduled, live, ended, cancelled.",
        properties: {
          id: { type: "string", format: "uuid" },
          property_id: { type: "string", format: "uuid", nullable: true },
          title_ar: { type: "string" },
          title_en: { type: "string" },
          description: { type: "string", nullable: true },
          starting_price: { type: "number" },
          reserve_price: {
            type: "number",
            nullable: true,
            description: "Minimum acceptable winning bid; hidden from bidders.",
          },
          min_increment: { type: "number", description: "Smallest bid step above current high." },
          current_high: { type: "number", nullable: true, description: "Highest bid so far." },
          currency: { type: "string", example: "SAR" },
          start_at: { type: "string", format: "date-time" },
          end_at: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["draft", "scheduled", "live", "ended", "cancelled"] },
          winner_user_id: { type: "string", format: "uuid", nullable: true },
          winner_bid_id: { type: "string", format: "uuid", nullable: true },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      AuctionBid: {
        type: "object",
        description:
          "A single bid on an auction. Bidder identity is not exposed via the public API.",
        properties: {
          id: { type: "string", format: "uuid" },
          auction_id: { type: "string", format: "uuid" },
          amount: { type: "number" },
          placed_at: { type: "string", format: "date-time" },
        },
      },
      AuctionCreate: {
        type: "object",
        required: ["title_ar", "title_en", "starting_price", "min_increment", "start_at", "end_at"],
        properties: {
          property_id: { type: "string", format: "uuid", nullable: true },
          title_ar: { type: "string", minLength: 2, maxLength: 200 },
          title_en: { type: "string", minLength: 2, maxLength: 200 },
          description: { type: "string", nullable: true, maxLength: 2000 },
          starting_price: { type: "number", minimum: 0 },
          reserve_price: { type: "number", minimum: 0, nullable: true },
          min_increment: { type: "number", exclusiveMinimum: 0 },
          start_at: { type: "string", format: "date-time" },
          end_at: { type: "string", format: "date-time" },
        },
      },
      AuctionUpdate: {
        type: "object",
        description: "All properties are optional; at least one must be provided.",
        properties: {
          reserve_price: { type: "number", minimum: 0, nullable: true },
          min_increment: { type: "number", exclusiveMinimum: 0 },
          start_at: { type: "string", format: "date-time" },
          end_at: { type: "string", format: "date-time" },
          title_ar: { type: "string", minLength: 2, maxLength: 200 },
          title_en: { type: "string", minLength: 2, maxLength: 200 },
          description: { type: "string", nullable: true, maxLength: 2000 },
        },
      },
      PlaceBid: {
        type: "object",
        required: ["amount", "bidder_id"],
        properties: {
          amount: { type: "number", exclusiveMinimum: 0 },
          bidder_id: { type: "string", format: "uuid" },
        },
      },
      Error: { type: "object", properties: { error: { type: "string" } } },
      AuctionsAnalytics: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            properties: {
              from: { type: "string", format: "date-time", nullable: true },
              to: { type: "string", format: "date-time", nullable: true },
              status: { type: "string", nullable: true },
              bidder_id: { type: "string", format: "uuid", nullable: true },
            },
          },
          totals: {
            type: "object",
            properties: {
              total: { type: "integer" },
              draft: { type: "integer" },
              scheduled: { type: "integer" },
              live: { type: "integer" },
              ended: { type: "integer" },
              finalized: { type: "integer" },
              cancelled: { type: "integer" },
              total_bids: { type: "integer" },
              avg_final_price: { type: "number" },
              success_rate: {
                type: "number",
                description: "finalized / (finalized+cancelled+ended) × 100",
              },
            },
          },
          by_status: {
            type: "array",
            items: {
              type: "object",
              properties: { status: { type: "string" }, count: { type: "integer" } },
            },
          },
          by_day: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "string", example: "2026-07-06" },
                count: { type: "integer" },
                bids: { type: "integer" },
              },
            },
          },
          top_bidders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                bidder_id: { type: "string", format: "uuid" },
                bids: { type: "integer" },
                total_amount: { type: "number" },
              },
            },
          },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      RateLimited: {
        description: "Rate limit exceeded",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
};

// Overlay write operations on top of read paths.
spec.paths["/api/public/v1/auctions"] = {
  ...(spec.paths["/api/public/v1/auctions"] as Record<string, unknown>),
  post: {
    summary: "Create an auction (draft)",
    tags: ["Auctions"],
    description:
      "Requires the `auctions:write` scope on the API key. New auctions are created in `draft` status.",
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/AuctionCreate" } } },
    },
    responses: {
      "201": {
        description: "Created",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Auction" } } },
      },
      "400": { description: "Validation failed" },
      "401": { $ref: "#/components/responses/Unauthorized" },
      "403": { description: "Missing scope" },
      "429": { $ref: "#/components/responses/RateLimited" },
    },
  },
};
spec.paths["/api/public/v1/auctions/{id}"] = {
  ...(spec.paths["/api/public/v1/auctions/{id}"] as Record<string, unknown>),
  patch: {
    summary: "Update auction rules (draft/scheduled only)",
    tags: ["Auctions"],
    description:
      "Requires the `auctions:write` scope. Only `draft` or `scheduled` auctions may be updated.",
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
    ],
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/AuctionUpdate" } } },
    },
    responses: {
      "200": { description: "Updated" },
      "400": { description: "Validation failed" },
      "401": { $ref: "#/components/responses/Unauthorized" },
      "403": { description: "Missing scope" },
      "404": { description: "Not found" },
      "409": { description: "Auction has already started" },
      "429": { $ref: "#/components/responses/RateLimited" },
    },
  },
};
spec.paths["/api/public/v1/auctions/{id}/bids"] = {
  ...(spec.paths["/api/public/v1/auctions/{id}/bids"] as Record<string, unknown>),
  post: {
    summary: "Place a bid on a live auction",
    tags: ["Auctions"],
    description:
      "Requires the `auctions:bid` scope. Only `live` auctions accept bids; `amount` must be at least `current_high + min_increment`.",
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
    ],
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/PlaceBid" } } },
    },
    responses: {
      "201": { description: "Bid placed" },
      "400": { description: "Validation failed or amount too low" },
      "401": { $ref: "#/components/responses/Unauthorized" },
      "403": { description: "Missing scope" },
      "404": { description: "Auction not found" },
      "409": { description: "Auction not live or already ended" },
      "429": { $ref: "#/components/responses/RateLimited" },
    },
  },
};

spec.paths["/api/public/v1/auctions/analytics"] = {
  get: {
    summary: "Auctions analytics summary",
    tags: ["Auctions"],
    description:
      "Aggregated metrics for the API key's organization: totals per status, total bids, average finalized price, success rate, daily time-series, and top 10 bidders. All filters are optional.",
    parameters: [
      {
        name: "from",
        in: "query",
        schema: { type: "string", format: "date-time" },
        description: "ISO datetime; filters on auction start_at ≥ from",
      },
      {
        name: "to",
        in: "query",
        schema: { type: "string", format: "date-time" },
        description: "ISO datetime; filters on auction start_at ≤ to",
      },
      {
        name: "status",
        in: "query",
        schema: {
          type: "string",
          enum: ["draft", "scheduled", "live", "ended", "finalized", "cancelled"],
        },
      },
      {
        name: "bidder_id",
        in: "query",
        schema: { type: "string", format: "uuid" },
        description: "Narrow to auctions this bidder participated in",
      },
    ],
    responses: {
      "200": {
        description: "Aggregated analytics",
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/AuctionsAnalytics" } },
        },
      },
      "400": { description: "Invalid filter" },
      "401": { $ref: "#/components/responses/Unauthorized" },
      "403": { description: "Missing scope: auctions:read" },
      "429": { $ref: "#/components/responses/RateLimited" },
    },
  },
};

export const Route = createFileRoute("/api/public/v1/openapi.json")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(spec, null, 2), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=300",
          },
        }),
    },
  },
});
