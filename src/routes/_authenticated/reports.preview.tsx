import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/reports/preview. */
export const Route = createFileRoute("/_authenticated/reports/preview")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/reports/preview", replace: true });
  },
});
