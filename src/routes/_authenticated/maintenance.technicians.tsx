import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/maintenance/technicians")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/maintenance/technicians", replace: true });
  },
});
