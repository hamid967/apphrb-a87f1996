import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/crm/leads/$id/edit. */
export const Route = createFileRoute("/_authenticated/leads/$id/edit")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/crm/leads/$id/edit",
      params: params as { id: string },
      replace: true,
    });
  },
});
