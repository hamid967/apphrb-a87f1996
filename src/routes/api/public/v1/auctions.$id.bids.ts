import { createFileRoute } from "@tanstack/react-router";
import { apiListAuctionBids, apiPlaceBid } from "@/lib/api-v1.server";
import { optionsCors } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/auctions/$id/bids")({
  server: {
    handlers: {
      OPTIONS: () => optionsCors(),
      GET: ({ request, params }) => apiListAuctionBids(request, params.id),
      POST: ({ request, params }) => apiPlaceBid(request, params.id),
    },
  },
});
