import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock } from "lucide-react";
import { getMyActiveSubscription } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardBreadcrumbs } from "@/components/dashboard/DashboardBreadcrumbs";
import { MobileDashboardTabbar } from "@/components/dashboard/MobileDashboardTabbar";
import { useClaimsRealtime } from "@/hooks/use-claims-realtime";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { t, i18n } = useTranslation();
  useClaimsRealtime({ isAr: i18n.language?.startsWith("ar") });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const subQ = useQuery({
    queryKey: ["my-subscription-status"],
    queryFn: () => getMyActiveSubscription(),
    staleTime: 60_000,
  });
  const sub = subQ.data;
  const expired = sub?.status === "expired";
  const inGrace = !!sub?.in_grace;
  const daysRemaining = sub?.days_remaining ?? null;
  const warningDays = sub?.warning_days ?? 7;
  const graceDays = sub?.grace_days ?? 3;
  const showWarning =
    !expired &&
    sub?.status === "active" &&
    daysRemaining != null &&
    daysRemaining <= warningDays &&
    daysRemaining > 0;
  const onBillingPage =
    pathname === "/dashboard/settings/billing" ||
    pathname.startsWith("/dashboard/settings/billing/") ||
    pathname === "/dashboard/renew";

  return (
    <SidebarProvider>
      <div data-testid="dashboard-shell" className="flex min-h-dvh w-full bg-background">
        <div className="hidden md:contents">
          <DashboardSidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border/60 bg-background/70 px-3 backdrop-blur-xl">
            <SidebarTrigger className="hidden md:inline-flex" />
            <div className="mx-2 hidden h-4 w-px bg-border/60 md:block" />
            <DashboardBreadcrumbs />
          </header>
          {expired && (
            <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4" />
              <span className="flex-1">{t("billing.expiredBanner")}</span>
              <Button asChild size="sm" variant="secondary">
                <Link to="/dashboard/settings/billing">{t("billing.renew")}</Link>
              </Button>
            </div>
          )}
          {!expired && inGrace && (
            <div className="flex flex-wrap items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              <span className="flex-1">{t("billing.graceBanner", { days: graceDays })}</span>
              <Button asChild size="sm" variant="secondary">
                <Link to="/dashboard/settings/billing">{t("billing.renew")}</Link>
              </Button>
            </div>
          )}
          {showWarning && (
            <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
              <Clock className="size-4" />
              <span className="flex-1">
                {t("billing.warningBanner", {
                  days: daysRemaining,
                  unit: daysRemaining === 1 ? t("billing.dayOne") : t("billing.dayMany"),
                })}
              </span>
              <Button asChild size="sm" variant="secondary">
                <Link to="/dashboard/settings/billing">{t("billing.renewNow")}</Link>
              </Button>
            </div>
          )}
          <main className="min-w-0 flex-1 pb-28 md:pb-0">
            {expired && !onBillingPage ? (
              <div className="mx-auto max-w-lg p-8 text-center">
                <h2 className="text-xl font-semibold">{t("billing.restricted")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t("billing.restrictedBody")}</p>
                <Button asChild className="mt-4">
                  <Link to="/dashboard/settings/billing">{t("billing.goToBilling")}</Link>
                </Button>
              </div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
        <MobileDashboardTabbar />
      </div>
    </SidebarProvider>
  );
}
