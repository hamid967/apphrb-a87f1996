import { t } from "@/lib/i18n";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/renew")({
  // The billing page already contains the full renewal flow (plans + payment
  // submission). This route is a stable shortcut for the "جدّد الآن" CTA.
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings/billing", replace: true });
  },
  head: () => sectionHead({ section: "dashboard", entityAr: "تجديد العقود", entityEn: "Contract Renewals", path: "/dashboard/renew" }),
  component: () => null,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});
