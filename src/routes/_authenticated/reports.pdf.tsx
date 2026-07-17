import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/reports/pdf. */
export const Route = createFileRoute("/_authenticated/reports/pdf")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/reports/pdf", replace: true });
  },
});
