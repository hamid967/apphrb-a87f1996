import { Shield } from "lucide-react";
import { SmartBreadcrumbs, type SmartCrumb } from "@/components/breadcrumbs/SmartBreadcrumbs";
import { useAdminBreadcrumb } from "@/components/admin/AdminSidebar";
import { useRouterState } from "@tanstack/react-router";

/**
 * Unified admin breadcrumb built on top of SmartBreadcrumbs, so /admin
 * shares the same visual style, focus/keyboard behavior, mobile scroll
 * strip and overflow menu as /portal and /dashboard.
 *
 * The trail comes from `useAdminBreadcrumb` (sidebar-driven group + item)
 * instead of raw URL segments, since admin URLs are flat (/admin.xxx).
 */
export function AdminBreadcrumbs() {
  const { group, item } = useAdminBreadcrumb();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const crumbs: SmartCrumb[] = [{ href: "/admin", label: "" /* filled by rootLabel */ }];
  // The group segment is not a route, but we still show it as a passive crumb
  // by pointing it back to /admin (safe fallback that keeps navigation working).
  if (group) crumbs.push({ href: "/admin", label: group });
  if (item) crumbs.push({ href: pathname, label: item });

  // Fill the first crumb label so the shared component treats it uniformly.
  crumbs[0].label = ""; // rootLabel wins when label is empty

  return (
    <SmartBreadcrumbs
      layoutId="admin-breadcrumb"
      crumbs={crumbs.map((c, i) =>
        i === 0 ? { ...c, label: c.label || "__root__" } : c,
      )}
      rootIcon={Shield}
      rootLabel={{ ar: "الإدارة", en: "Admin" }}
      ariaHome={{ ar: "الانتقال إلى لوحة الإدارة", en: "Go to Admin home" }}
    />
  );
}
