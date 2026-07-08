import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/properties/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/properties", replace: true });
  },
});
