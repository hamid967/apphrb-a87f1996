import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/owner/portal/")({
  beforeLoad: () => {
    throw redirect({ to: "/portal/owner", replace: true });
  },
});
