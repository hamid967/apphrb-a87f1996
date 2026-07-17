import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/owners. */
export const Route = createFileRoute("/_authenticated/owners/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/owners", replace: true });
  },
});
