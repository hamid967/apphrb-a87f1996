import { createFileRoute, redirect } from "@tanstack/react-router";

/** Consolidation shim — the full Deals UI lives at /deals. */
export const Route = createFileRoute("/_authenticated/dashboard/crm/deals")({
  beforeLoad: () => {
    throw redirect({ to: "/deals" });
  },
});
