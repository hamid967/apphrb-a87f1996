import { createFileRoute, redirect } from "@tanstack/react-router";

/** Consolidation shim — the full Leads UI lives at /leads. */
export const Route = createFileRoute("/_authenticated/dashboard/crm/leads")({
  beforeLoad: () => {
    throw redirect({ to: "/leads" });
  },
});
