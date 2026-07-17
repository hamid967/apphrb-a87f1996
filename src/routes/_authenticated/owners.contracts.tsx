import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/owners/contracts. */
export const Route = createFileRoute("/_authenticated/owners/contracts")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/owners/contracts", replace: true });
  },
});
