import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useTranslation } from "react-i18next";
import { Settings, User, ShieldCheck, Bell as BellIcon } from "lucide-react";
import { PortalPageHeader } from "@/components/portal/PortalPageHeader";

export const Route = createFileRoute("/_authenticated/portal/settings")({
  head: () => portalHead({ titleAr: 'إعدادات المحطة', titleEn: 'Portal Settings', descAr: 'خصّص محطتك: الأمان، الإشعارات، والتفضيلات.', path: '/portal/settings' }),
  component: SettingsLayout,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
});

function SettingsLayout() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const path = useRouterState({ select: (r) => r.location.pathname });
  const tabs = [
    { to: "/portal/settings", ar: "الملف الشخصي", en: "Profile", icon: User, exact: true },
    { to: "/portal/settings/security", ar: "الأمان", en: "Security", icon: ShieldCheck },
    { to: "/portal/settings/notifications", ar: "الإشعارات", en: "Notifications", icon: BellIcon },
  ];
  return (
    <div className="mx-auto max-w-[1100px] p-4 sm:p-6 lg:p-8">
      <PortalPageHeader
        icon={<Settings className="size-5" />}
        title={isAr ? "الإعدادات" : "Settings"}
        subtitle={isAr ? "الحساب والأمان والتفضيلات" : "Account, security & preferences"}
      />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label={isAr ? "أقسام الإعدادات" : "Settings sections"}
          className="surface-card h-fit p-2"
        >
          <ul className="space-y-0.5">
            {tabs.map((t) => {
              const active = t.exact ? path === t.to : path.startsWith(t.to);
              return (
                <li key={t.to}>
                  <Link
                    to={t.to}
                    aria-current={active ? "page" : undefined}
                    className={
                      "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition " +
                      (active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
                    }
                  >
                    <t.icon className="size-4" />
                    {isAr ? t.ar : t.en}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
