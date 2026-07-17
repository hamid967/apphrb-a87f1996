import { createFileRoute, redirect } from "@tanstack/react-router";

/** Phase 2 canonical shim — content moved to /dashboard/crm/meetings. */
export const Route = createFileRoute("/_authenticated/meetings")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/crm/meetings", replace: true });
  },
});
