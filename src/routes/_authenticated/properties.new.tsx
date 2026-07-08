import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/properties/new")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/properties/new", replace: true });
  },
});
