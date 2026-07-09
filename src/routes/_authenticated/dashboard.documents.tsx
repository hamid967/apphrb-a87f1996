import { createFileRoute, redirect } from "@tanstack/react-router";

/** Consolidation shim — the full Documents UI lives at /documents. */
export const Route = createFileRoute("/_authenticated/dashboard/documents")({
  beforeLoad: () => {
    throw redirect({ to: "/documents" });
  },
});
