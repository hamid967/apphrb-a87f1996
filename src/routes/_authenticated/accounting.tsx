import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FileText, Receipt, Percent, LineChart } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { ADMIN_ROLES } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/accounting")({
  component: AccountingLayout,
});

const TABS = [
  { to: "/accounting", labelKey: "accountingPage.tabInvoices", icon: FileText, exact: true },
  { to: "/accounting/expenses", labelKey: "accountingPage.tabExpenses", icon: Receipt, exact: false },
  { to: "/accounting/vat", labelKey: "accountingPage.tabVat", icon: Percent, exact: false },
  { to: "/accounting/pnl", labelKey: "accountingPage.tabPnl", icon: LineChart, exact: false },
] as const;

function AccountingLayout() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <RequireRole
      roles={ADMIN_ROLES}
      title={t("accountingPage.restrictedTitle")}
      description={t("accountingPage.restrictedDesc")}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t("accountingPage.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("accountingPage.sub")}</p>
        </header>
        <nav className="flex flex-wrap gap-1 rounded-2xl border border-border/50 bg-card/40 p-1 backdrop-blur-xl">
          {TABS.map((tab) => {
            const active = tab.exact
              ? pathname === tab.to
              : pathname === tab.to || pathname.startsWith(tab.to + "/");
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="accounting-tab-indicator"
                    className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-primary/15 via-primary/10 to-accent/10 shadow-[0_0_0_1px_theme(colors.primary/20)]"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon className="size-4" /> {t(tab.labelKey)}
              </Link>
            );
          })}
        </nav>
        <Outlet />
      </div>
    </RequireRole>
  );
}
