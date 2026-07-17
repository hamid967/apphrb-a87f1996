import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/reports/executive. */
export const Route = createFileRoute("/_authenticated/reports/executive")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/reports/executive", replace: true });
  },
});
