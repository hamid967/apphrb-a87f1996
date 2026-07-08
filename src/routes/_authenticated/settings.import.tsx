import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/import")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/import", replace: true });
  },
});
