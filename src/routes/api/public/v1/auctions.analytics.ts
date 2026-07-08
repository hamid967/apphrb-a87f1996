import { createFileRoute } from "@tanstack/react-router";
import { apiAuctionsAnalytics } from "@/lib/api-v1.server";
import { optionsCors } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/auctions/analytics")({
  server: {
    handlers: {
      OPTIONS: () => optionsCors(),
      GET: ({ request }) => apiAuctionsAnalytics(request),
    },
  },
});
