import { useTranslation } from "react-i18next";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AdminBreadcrumbs } from "@/components/admin/AdminBreadcrumbs";
import { DashboardThemeToggle } from "@/components/dashboard-theme-toggle";

/**
 * Sticky top bar for /admin/* with sidebar trigger + unified breadcrumb.
 * The breadcrumb uses the same shared component as /dashboard and /portal
 * (SmartBreadcrumbs) so styling, focus, keyboard nav and mobile overflow
 * stay consistent across every authenticated surface.
 */
export function AdminHeader() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger />
      <AdminBreadcrumbs />
      <div className="ms-auto flex items-center gap-1">
        <DashboardThemeToggle />
      </div>
      {/* aria-live region kept so RTL screen readers still announce updates */}
      <span className="sr-only" aria-live="polite">
        {isAr ? "تم تحديث المسار" : "Breadcrumb updated"}
      </span>
    </header>
  );
}
