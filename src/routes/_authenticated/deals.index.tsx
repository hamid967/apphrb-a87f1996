import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/crm/deals. */
export const Route = createFileRoute("/_authenticated/deals/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/crm/deals", replace: true });
  },
});
