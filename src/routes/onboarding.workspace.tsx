import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy onboarding step — unified into /onboarding/wizard.
export const Route = createFileRoute("/onboarding/workspace")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding/wizard", replace: true });
  },
  component: () => null,
});
