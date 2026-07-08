import { createFileRoute } from "@tanstack/react-router";
import { AutoDashboardPanel } from "@/components/dashboard/AutoDashboardPanel";
import { requireOnboardingComplete } from "@/lib/onboarding.functions";

import { sectionHead } from "@/lib/section-og-head";
function AutoDashboard() {
  return (
    <div className="mx-auto max-w-7xl p-4">
      <AutoDashboardPanel />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard/auto")({
  // Server-side guard: refuses to serve the KPIs page unless the caller's
  // onboarding_progress has profile/company/first_receipt marked done and
  // onboarding_completed_at is set. Throws a router redirect to
  // /onboarding/wizard otherwise.
  loader: () => requireOnboardingComplete(),
  head: () => sectionHead({ section: "dashboard", entityAr: "الأتمتة", entityEn: "Automation", path: "/dashboard/auto" }),
  component: AutoDashboard,
});
