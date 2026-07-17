import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/crm/leads. */
export const Route = createFileRoute("/_authenticated/leads/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/crm/leads", replace: true });
  },
});
