import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/owners/$id/ledger. */
export const Route = createFileRoute("/_authenticated/owners/$id/ledger")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/owners/$id/ledger",
      params: params as { id: string },
      replace: true,
    });
  },
});
