import { createFileRoute, redirect } from "@tanstack/react-router";

/** Consolidation shim — the full Owners UI lives at /owners. */
export const Route = createFileRoute("/_authenticated/dashboard/owners")({
  beforeLoad: () => {
    throw redirect({ to: "/owners" });
  },
});
