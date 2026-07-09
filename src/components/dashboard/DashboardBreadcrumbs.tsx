import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Home, MoreHorizontal } from "lucide-react";
import { AnimatePresence, motion, LayoutGroup } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LABELS: Record<string, { ar: string; en: string }> = {
  dashboard: { ar: "الرئيسية", en: "Dashboard" },
  units: { ar: "الوحدات", en: "Units" },
  contracts: { ar: "العقود", en: "Contracts" },
  payments: { ar: "المدفوعات", en: "Payments" },
  expenses: { ar: "المصروفات", en: "Expenses" },
  tenants: { ar: "المستأجرون", en: "Tenants" },
  settings: { ar: "الإعدادات", en: "Settings" },
  new: { ar: "جديد", en: "New" },
};

function labelFor(seg: string, isAr: boolean): string {
  const l = LABELS[seg];
  if (l) return isAr ? l.ar : l.en;
  if (/^[0-9a-f-]{8,}$/i.test(seg)) return "#" + seg.slice(0, 6);
  return decodeURIComponent(seg);
}

type Crumb = { href: string; label: string; isLast: boolean };

export function DashboardBreadcrumbs() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const clean = pathname.split("?")[0].split("#")[0].replace(/\/$/, "");
  const parts = clean.split("/").filter(Boolean);
  const dashIdx = parts.indexOf("dashboard");
  if (dashIdx === -1) return null;
  const segs = parts.slice(dashIdx);

  const crumbs: Crumb[] = segs.map((seg, i) => ({
    href: "/" + parts.slice(0, dashIdx + i + 1).join("/"),
    label: labelFor(seg, !!isAr),
    isLast: i === segs.length - 1,
  }));

  const Sep = isAr ? ChevronLeft : ChevronRight;
  const dir = isAr ? -1 : 1;
  const spring = { type: "spring" as const, stiffness: 340, damping: 28 };

  // Mobile: root + ellipsis dropdown (middle) + current, when > 2 crumbs
  const showEllipsis = crumbs.length > 2;
  const middle = showEllipsis ? crumbs.slice(1, -1) : [];
  const first = crumbs[0];
  const last = crumbs[crumbs.length - 1];

  return (
    <nav aria-label={isAr ? "مسار التنقّل" : "Breadcrumb"} className="min-w-0 flex-1">
      {/* Mobile compact view */}
      <ol className="flex min-w-0 items-center gap-1 text-sm sm:hidden">
        <li className="flex shrink-0 items-center">
          {crumbs.length === 1 ? (
            <span
              aria-current="page"
              tabIndex={0}
              className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary ring-1 ring-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <Home className="size-3.5 me-1 opacity-80" aria-hidden />
              {first.label}
            </span>
          ) : (
            <Link
              to={first.href}
              aria-label={isAr ? "الانتقال إلى الرئيسية" : "Go to Dashboard home"}
              className="inline-flex items-center rounded-md px-2 py-1 text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Home className="size-4" aria-hidden />
            </Link>
          )}
        </li>

        {showEllipsis && (
          <>
            <li aria-hidden="true" className="inline-flex shrink-0 text-muted-foreground/60">
              <Sep className="size-3.5" />
            </li>
            <li className="flex shrink-0 items-center">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={isAr ? "عرض المسارات الوسيطة" : "Show intermediate pages"}
                  className="inline-flex items-center rounded-md px-1.5 py-1 text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isAr ? "end" : "start"} className="min-w-[10rem]">
                  {middle.map((c) => (
                    <DropdownMenuItem key={c.href} asChild>
                      <Link to={c.href} className="cursor-pointer">
                        {c.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          </>
        )}

        {crumbs.length > 1 && (
          <>
            <li aria-hidden="true" className="inline-flex shrink-0 text-muted-foreground/60">
              <Sep className="size-3.5" />
            </li>
            <li className="flex min-w-0 items-center">
              <span
                aria-current="page"
                tabIndex={0}
                className="truncate rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary ring-1 ring-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                {last.label}
              </span>
            </li>
          </>
        )}
      </ol>

      {/* Desktop full view */}
      <LayoutGroup id="dashboard-breadcrumb">
        <ol className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
          <AnimatePresence mode="popLayout" initial={false}>
            {crumbs.map((c, i) => (
              <motion.li
                key={c.href}
                layout
                initial={{ opacity: 0, x: -10 * dir, filter: "blur(4px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 10 * dir, filter: "blur(4px)" }}
                transition={spring}
                className="flex min-w-0 items-center gap-1.5"
              >
                {i > 0 && (
                  <motion.span
                    aria-hidden="true"
                    role="presentation"
                    className="inline-flex text-muted-foreground/60"
                    animate={{ x: [0, 3 * dir, 0], opacity: [0.5, 1, 0.5] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.15,
                    }}
                  >
                    <Sep className="size-3.5 shrink-0" />
                  </motion.span>
                )}
                {c.isLast ? (
                  <motion.span
                    layoutId="dashboard-breadcrumb-current"
                    aria-current="page"
                    tabIndex={0}
                    transition={spring}
                    className="relative max-w-[16rem] truncate rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary ring-1 ring-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {i === 0 ? (
                      <Home className="inline size-3.5 me-1 opacity-80" aria-hidden />
                    ) : null}
                    {c.label}
                  </motion.span>
                ) : (
                  <Link
                    to={c.href}
                    aria-label={
                      i === 0
                        ? isAr
                          ? "الانتقال إلى الرئيسية"
                          : "Go to Dashboard home"
                        : undefined
                    }
                    className="max-w-[12rem] truncate rounded-md px-2 py-1 font-medium text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {i === 0 ? (
                      <Home className="inline size-3.5 me-1 opacity-80" aria-hidden />
                    ) : null}
                    {c.label}
                  </Link>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </LayoutGroup>
    </nav>
  );
}
