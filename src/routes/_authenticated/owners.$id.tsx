import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/owners/$id. */
export const Route = createFileRoute("/_authenticated/owners/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/owners/$id",
      params: params as { id: string },
      replace: true,
    });
  },
});
