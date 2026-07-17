import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/reports/builder. */
export const Route = createFileRoute("/_authenticated/reports/builder")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/reports/builder", replace: true });
  },
});
