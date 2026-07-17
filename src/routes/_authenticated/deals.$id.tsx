import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/crm/deals/$id. */
export const Route = createFileRoute("/_authenticated/deals/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/crm/deals/$id",
      params: params as { id: string },
      replace: true,
    });
  },
});
