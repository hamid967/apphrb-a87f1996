import { createFileRoute } from "@tanstack/react-router";
import { apiGetById, RESOURCE } from "@/lib/api-v1.server";
import { optionsCors } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/contracts/$id")({
  server: {
    handlers: {
      OPTIONS: () => optionsCors(),
      GET: ({ request, params }) => apiGetById(request, RESOURCE.contracts, params.id),
    },
  },
});
