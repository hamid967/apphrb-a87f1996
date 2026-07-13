import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/solutions/brokers")({
  beforeLoad: () => {
    throw redirect({ to: "/solutions/property-managers" });
  },
  component: () => null,
});
