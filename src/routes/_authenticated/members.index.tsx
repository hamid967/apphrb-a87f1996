import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/members/")({
  beforeLoad: () => {
    throw redirect({ to: "/team", replace: true });
  },
});
