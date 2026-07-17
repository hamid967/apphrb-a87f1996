import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/documents. */
export const Route = createFileRoute("/_authenticated/documents/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/documents", replace: true });
  },
});
