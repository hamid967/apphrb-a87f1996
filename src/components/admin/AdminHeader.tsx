import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAdminBreadcrumb } from "@/components/admin/AdminSidebar";
import { DashboardThemeToggle } from "@/components/dashboard-theme-toggle";

/**
 * Sticky top bar for /admin/* with sidebar trigger + animated breadcrumb.
 * The chevron gently loops toward the next segment and each segment
 * fades/slides in when the path changes.
 */
export function AdminHeader() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { group, item } = useAdminBreadcrumb();
  const Chevron = isAr ? ChevronLeft : ChevronRight;
  const dir = isAr ? -1 : 1; // arrow drift + segment slide direction

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger />
      <nav
        aria-label={isAr ? "مسار التنقّل" : "Breadcrumb"}
        className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0"
      >
        <span className="font-medium">{isAr ? "الإدارة" : "Admin"}</span>

        <AnimatePresence mode="popLayout" initial={false}>
          {group && (
            <motion.span
              key={`sep-group-${group}`}
              className="inline-flex"
              initial={{ opacity: 0, x: -6 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 * dir }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              aria-hidden="true"
            >
              <motion.span
                animate={{ x: [0, 3 * dir, 0], opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="inline-flex text-primary/70"
              >
                <Chevron className="size-3.5 shrink-0" />
              </motion.span>
            </motion.span>
          )}
          {group && (
            <motion.span
              key={`group-${group}`}
              layout
              initial={{ opacity: 0, x: -8 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 * dir }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="truncate"
            >
              {group}
            </motion.span>
          )}
          {item && (
            <motion.span
              key={`sep-item-${item}`}
              className="inline-flex"
              initial={{ opacity: 0, x: -6 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 * dir }}
              transition={{ type: "spring", stiffness: 380, damping: 30, delay: 0.04 }}
              aria-hidden="true"
            >
              <motion.span
                animate={{ x: [0, 3 * dir, 0], opacity: [0.6, 1, 0.6] }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.4,
                }}
                className="inline-flex text-primary"
              >
                <Chevron className="size-3.5 shrink-0" />
              </motion.span>
            </motion.span>
          )}
          {item && (
            <motion.span
              key={`item-${item}`}
              layout
              initial={{ opacity: 0, x: -10 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 * dir }}
              transition={{ type: "spring", stiffness: 320, damping: 26, delay: 0.05 }}
              className="truncate text-foreground font-medium"
            >
              {item}
            </motion.span>
          )}
        </AnimatePresence>
      </nav>
      <div className="ms-auto flex items-center gap-1">
        <DashboardThemeToggle />
      </div>
    </header>
  );
}
