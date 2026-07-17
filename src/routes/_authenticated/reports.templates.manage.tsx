import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/reports/templates/manage. */
export const Route = createFileRoute("/_authenticated/reports/templates/manage")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/reports/templates/manage", replace: true });
  },
});
