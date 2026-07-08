import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tenant/portal/maintenance")({
  beforeLoad: () => {
    throw redirect({ to: "/portal/tenant/maintenance", replace: true });
  },
});
