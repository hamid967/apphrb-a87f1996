import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tenant/portal/")({
  beforeLoad: () => {
    throw redirect({ to: "/portal/tenant", replace: true });
  },
});
