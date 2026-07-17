import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/reports/templates. */
export const Route = createFileRoute("/_authenticated/reports/templates")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/reports/templates", replace: true });
  },
});
