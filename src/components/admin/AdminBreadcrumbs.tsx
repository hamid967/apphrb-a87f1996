import { Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { SmartBreadcrumbs, type SmartCrumb } from "@/components/breadcrumbs/SmartBreadcrumbs";
import { useAdminBreadcrumb } from "@/components/admin/AdminSidebar";

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
  const { group, item } = useAdminBreadcrumb();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const crumbs: SmartCrumb[] = [
    { href: "/admin", label: isAr ? "الإدارة" : "Admin" },
  ];
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
