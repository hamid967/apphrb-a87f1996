import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { portalHead } from "@/lib/portal-og-head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/portal/tenant")({
  head: () => portalHead({ titleAr: 'محطة المستأجر', titleEn: 'Tenant Portal', descAr: 'بوابة المستأجر: الإيجار، الصيانة، والمستندات.', path: '/portal/tenant' }),
  component: TenantPortalLayout,
});

const TABS = [
  { to: "/portal/tenant", labelKey: "tenantPortal.tabs.overview", exact: true },
  { to: "/portal/tenant/payments", labelKey: "tenantPortal.tabs.payments", exact: false },
  { to: "/portal/tenant/maintenance", labelKey: "tenantPortal.tabs.maintenance", exact: false },
] as const;

function TenantPortalLayout() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-dvh bg-background">
      <nav className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2">
          {TABS.map((tab) => {
            const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t(tab.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
