import { Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { SmartBreadcrumbs, type SmartCrumb } from "@/components/breadcrumbs/SmartBreadcrumbs";
import { adminNavigationGroups } from "@/components/admin/adminNavigation";

/**
 * Unified admin breadcrumb built on top of SmartBreadcrumbs so /admin
 * shares the same visual style, focus/keyboard behavior, mobile scroll
 * strip and overflow menu as /portal and /dashboard.
 *
 * The trail comes from `useAdminBreadcrumb` (sidebar-driven group + item)
 * instead of raw URL segments, since admin URLs are flat (/admin.xxx).
 */
export function AdminBreadcrumbs() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { group, item } = getAdminBreadcrumb(pathname, isAr);

  const crumbs: SmartCrumb[] = [{ href: "/admin", label: isAr ? "الإدارة" : "Admin" }];
  // The group is a section label, not a route — point it back to /admin
  // so it stays clickable and keyboard-navigable.
  if (group) crumbs.push({ href: "/admin", label: group });
  if (item) crumbs.push({ href: pathname, label: item });

  return (
    <SmartBreadcrumbs
      layoutId="admin-breadcrumb"
      crumbs={crumbs}
      rootIcon={Shield}
      rootLabel={{ ar: "الإدارة", en: "Admin" }}
      ariaHome={{ ar: "الانتقال إلى لوحة الإدارة", en: "Go to Admin home" }}
    />
  );
}

function getAdminBreadcrumb(pathname: string, isAr: boolean) {
  for (const group of adminNavigationGroups) {
    for (const item of group.items) {
      const active = item.exact
        ? pathname === item.to
        : pathname === item.to || pathname.startsWith(item.to + "/");
      if (active) {
        return {
          group: isAr ? group.ar : group.en,
          item: isAr ? item.ar : item.en,
        };
      }
    }
  }
  return { group: isAr ? "الإدارة" : "Admin", item: "" };
}
