import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/crm/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/crm/leads" });
  },
});
