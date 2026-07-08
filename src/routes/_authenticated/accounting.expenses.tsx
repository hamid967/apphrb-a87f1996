import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/accounting/expenses")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/expenses" });
  },
});
