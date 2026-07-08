import { createFileRoute } from "@tanstack/react-router";
import { apiGetById, apiUpdateAuction, RESOURCE } from "@/lib/api-v1.server";
import { optionsCors } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/auctions/$id")({
  server: {
    handlers: {
      OPTIONS: () => optionsCors(),
      GET: ({ request, params }) => apiGetById(request, RESOURCE.auctions, params.id),
      PATCH: ({ request, params }) => apiUpdateAuction(request, params.id),
    },
  },
});
