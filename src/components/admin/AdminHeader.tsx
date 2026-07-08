import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAdminBreadcrumb } from "@/components/admin/AdminSidebar";

/**
 * Sticky top bar for /admin/* with sidebar trigger + breadcrumb.
 * Extracted from admin.tsx for readability — no behavior change.
 */
export function AdminHeader() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { group, item } = useAdminBreadcrumb();
  const Chevron = isAr ? ChevronLeft : ChevronRight;
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger />
      <nav
        aria-label={isAr ? "مسار التنقّل" : "Breadcrumb"}
        className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0"
      >
        <span className="font-medium">{isAr ? "الإدارة" : "Admin"}</span>
        {group && (
          <>
            <Chevron className="size-3.5 shrink-0" />
            <span className="truncate">{group}</span>
          </>
        )}
        {item && (
          <>
            <Chevron className="size-3.5 shrink-0" />
            <span className="truncate text-foreground font-medium">{item}</span>
          </>
        )}
      </nav>
    </header>
  );
}
