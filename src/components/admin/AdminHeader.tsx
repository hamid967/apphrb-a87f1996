import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAdminBreadcrumb } from "@/components/admin/AdminSidebar";
import { DashboardThemeToggle } from "@/components/dashboard-theme-toggle";

/**
 * Sticky top bar for /admin/* with sidebar trigger + animated breadcrumb.
 * Each segment is a clickable link back to that level; the current page
 * (leaf) is highlighted with a filled violet pill and aria-current="page".
 */
export function AdminHeader() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { group, item } = useAdminBreadcrumb();
  const Chevron = isAr ? ChevronLeft : ChevronRight;
  const dir = isAr ? -1 : 1;

  const rootLabel = isAr ? "الإدارة" : "Admin";

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger />
      <nav aria-label={isAr ? "مسار التنقّل" : "Breadcrumb"} className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-xs">
          {/* Root: always clickable → /admin (icon-only on mobile) */}
          <li className="flex shrink-0 items-center">
            <Link
              to="/admin"
              aria-label={isAr ? "الانتقال إلى لوحة الإدارة" : "Go to Admin home"}
              title={rootLabel}
              className="rounded-md px-2 py-1 font-medium text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="hidden sm:inline">{rootLabel}</span>
              <span className="sm:hidden" aria-hidden>⌂</span>
            </Link>
          </li>

          <AnimatePresence mode="popLayout" initial={false}>
            {group && (
              <motion.li
                key={`sep-group-${group}`}
                className="hidden shrink-0 text-muted-foreground/60 sm:inline-flex"
                initial={{ opacity: 0, x: -6 * dir }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 * dir }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                aria-hidden="true"
                role="presentation"
              >
                <motion.span
                  animate={{ x: [0, 3 * dir, 0], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex"
                >
                  <Chevron className="size-3.5 shrink-0" />
                </motion.span>
              </motion.li>
            )}
            {group && (
              <motion.li
                key={`group-${group}`}
                layout
                initial={{ opacity: 0, x: -8 * dir }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 * dir }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                title={group}
                className="hidden max-w-[10rem] shrink-0 truncate rounded-md px-2 py-0.5 text-muted-foreground sm:inline-block"
              >
                {group}
              </motion.li>
            )}
            {/* Mobile-only compact chip: hint that a group exists without stealing width */}
            {group && item && (
              <motion.li
                key={`group-chip-${group}`}
                className="inline-flex shrink-0 items-center gap-1 text-muted-foreground/70 sm:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-hidden="true"
                title={group}
              >
                <Chevron className="size-3 shrink-0" />
                <span className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium">
                  {group.length > 8 ? group.slice(0, 6) + "…" : group}
                </span>
              </motion.li>
            )}
            {item && (
              <motion.li
                key={`sep-item-${item}`}
                className="inline-flex shrink-0 text-primary/70"
                initial={{ opacity: 0, x: -6 * dir }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 * dir }}
                transition={{ type: "spring", stiffness: 380, damping: 30, delay: 0.04 }}
                aria-hidden="true"
                role="presentation"
              >
                <motion.span
                  animate={{ x: [0, 3 * dir, 0], opacity: [0.6, 1, 0.6] }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.4,
                  }}
                  className="inline-flex"
                >
                  <Chevron className="size-3.5 shrink-0" />
                </motion.span>
              </motion.li>
            )}
            {item && (
              <motion.li
                key={`item-${item}`}
                layout
                initial={{ opacity: 0, x: -10 * dir }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 * dir }}
                transition={{ type: "spring", stiffness: 320, damping: 26, delay: 0.05 }}
                aria-current="page"
                tabIndex={0}
                title={item}
                className="min-w-0 max-w-[12rem] truncate rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary ring-1 ring-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:max-w-[16rem]"
              >
                {item}
              </motion.li>
            )}
          </AnimatePresence>
        </ol>
      </nav>
      <div className="ms-auto flex items-center gap-1">
        <DashboardThemeToggle />
      </div>
    </header>
  );
}


