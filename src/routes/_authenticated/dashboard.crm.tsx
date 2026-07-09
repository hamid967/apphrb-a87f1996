import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/dashboard/crm")({
  component: CrmLayout,
});

function CrmLayout() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = [
    { to: "/dashboard/crm/leads", ar: "العملاء المحتملون", en: "Leads" },
    { to: "/dashboard/crm/deals", ar: "الصفقات", en: "Deals" },
    { to: "/dashboard/crm/meetings", ar: "الاجتماعات", en: "Meetings" },
  ] as const;

  return (
    <div className="min-h-full">
      <nav className="border-b border-border/60 bg-background/40 px-4 md:px-6">
        <ul className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = pathname === t.to || pathname.startsWith(t.to + "/");
            return (
              <li key={t.to}>
                <Link
                  to={t.to}
                  className={`inline-block border-b-2 px-4 py-3 text-sm transition ${
                    active
                      ? "border-primary text-foreground font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isAr ? t.ar : t.en}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
