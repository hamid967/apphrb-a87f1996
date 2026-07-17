import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/crm/leads/new. */
export const Route = createFileRoute("/_authenticated/leads/new")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/crm/leads/new", replace: true });
  },
});
