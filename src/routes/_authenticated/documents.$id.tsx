import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/documents/$id. */
export const Route = createFileRoute("/_authenticated/documents/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/documents/$id",
      params: params as { id: string },
      replace: true,
    });
  },
});
