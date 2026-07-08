import { createFileRoute } from "@tanstack/react-router";
import { apiList, RESOURCE } from "@/lib/api-v1.server";
import { optionsCors } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/public/v1/invoices")({
  server: {
    handlers: {
      OPTIONS: () => optionsCors(),
      GET: ({ request }) => apiList(request, RESOURCE.invoices),
    },
  },
});
