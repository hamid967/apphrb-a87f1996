import { createFileRoute, redirect } from "@tanstack/react-router";

// Public listing detail pages are disabled — HBSpro manages private
// portfolios and does not surface for-rent/for-sale listings publicly.
export const Route = createFileRoute("/listings/$slug")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
