import { createFileRoute, redirect } from "@tanstack/react-router";

/** Short-circuit: /dashboard/crm/leads is itself a shim → /leads. Skip the chain. */
export const Route = createFileRoute("/_authenticated/dashboard/crm/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/crm/leads", replace: true });
  },
});
