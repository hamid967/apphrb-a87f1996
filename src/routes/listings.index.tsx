import { createFileRoute, redirect } from "@tanstack/react-router";

// Public property-marketplace surface is disabled: HBSpro is a property
// management + expense tracking system, not a listings/rental marketplace.
// Any inbound link to /listings redirects to the home page.
export const Route = createFileRoute("/listings/")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
