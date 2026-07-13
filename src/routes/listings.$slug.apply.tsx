import { createFileRoute, redirect } from "@tanstack/react-router";

// Public tenant application intake via listings is disabled — HBSpro
// manages private portfolios; applications happen inside the tenant flow.
export const Route = createFileRoute("/listings/$slug/apply")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
