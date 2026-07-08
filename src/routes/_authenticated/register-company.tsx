import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/register-company")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding/wizard", replace: true });
  },
});
