import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/reports. */
export const Route = createFileRoute("/_authenticated/reports/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/reports", replace: true });
  },
});
