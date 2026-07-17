import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/crm/leads/$id. */
export const Route = createFileRoute("/_authenticated/leads/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/crm/leads/$id",
      params: params as { id: string },
      replace: true,
    });
  },
});
