import { createFileRoute } from "@tanstack/react-router";
import { apiList, apiCreateAuction, RESOURCE } from "@/lib/api-v1.server";
import { optionsCors } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/auctions")({
  server: {
    handlers: {
      OPTIONS: () => optionsCors(),
      GET: ({ request }) => apiList(request, RESOURCE.auctions),
      POST: ({ request }) => apiCreateAuction(request),
    },
  },
});
