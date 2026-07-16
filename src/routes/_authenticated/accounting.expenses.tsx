import { createFileRoute, redirect } from "@tanstack/react-router";

/** Short-circuit: /dashboard/expenses itself redirects → /dashboard/expenses/claim/correct. Skip the chain. */
export const Route = createFileRoute("/_authenticated/accounting/expenses")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/expenses/claim/correct", replace: true });
  },
});
