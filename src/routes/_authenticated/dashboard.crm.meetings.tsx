import { createFileRoute, redirect } from "@tanstack/react-router";

/** Consolidation shim — the full Meetings UI lives at /meetings. */
export const Route = createFileRoute("/_authenticated/dashboard/crm/meetings")({
  beforeLoad: () => {
    throw redirect({ to: "/meetings" });
  },
});
