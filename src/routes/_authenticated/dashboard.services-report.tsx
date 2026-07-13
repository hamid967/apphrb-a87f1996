import { createFileRoute, redirect } from "@tanstack/react-router";

/** Consolidation shim — unified services hub now lives at /dashboard/services. */
export const Route = createFileRoute("/_authenticated/dashboard/services-report")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/services" });
  },
});
