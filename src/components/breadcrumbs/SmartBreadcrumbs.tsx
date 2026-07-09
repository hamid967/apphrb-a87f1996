import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { AnimatePresence, motion, LayoutGroup } from "motion/react";
import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SmartLabelMap = Record<string, { ar: string; en: string }>;

export function SmartBreadcrumbs({
  rootSegment,
  labels,
  layoutId,
  rootIcon: RootIcon,
  rootLabel,
  ariaHome,
  className,
}: {
  /** URL segment that starts the breadcrumb trail (e.g. "dashboard", "portal", "admin"). */
  rootSegment: string;
  /** Segment → label dictionary. Unknown segments fall back to a slug/hash. */
  labels: SmartLabelMap;
  /** Unique layoutId prefix so multiple breadcrumbs animate independently. */
  layoutId: string;
  /** Optional icon rendered inside the root pill/link. */
  rootIcon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Root text label { ar, en }. */
  rootLabel: { ar: string; en: string };
  /** aria-label for the root link { ar, en }. */
  ariaHome: { ar: string; en: string };
  className?: string;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const clean = pathname.split("?")[0].split("#")[0].replace(/\/$/, "");
  const parts = clean.split("/").filter(Boolean);
  const rootIdx = parts.indexOf(rootSegment);
  if (rootIdx === -1) return null;
  const segs = parts.slice(rootIdx);

  const labelFor = (seg: string): string => {
    const l = labels[seg];
    if (l) return isAr ? l.ar : l.en;
    if (/^[0-9a-f-]{8,}$/i.test(seg)) return "#" + seg.slice(0, 6);
    return decodeURIComponent(seg);
  };

  const crumbs = segs.map((seg, i) => ({
    href: "/" + parts.slice(0, rootIdx + i + 1).join("/"),
    label: seg === rootSegment ? (isAr ? rootLabel.ar : rootLabel.en) : labelFor(seg),
    isLast: i === segs.length - 1,
  }));

  const Sep = isAr ? ChevronLeft : ChevronRight;
  const dir = isAr ? -1 : 1;
  const spring = { type: "spring" as const, stiffness: 340, damping: 28 };

  const showEllipsis = crumbs.length > 2;
  const middle = showEllipsis ? crumbs.slice(1, -1) : [];
  const first = crumbs[0];
  const last = crumbs[crumbs.length - 1];

  const renderRootIcon = (): ReactNode =>
    RootIcon ? <RootIcon className="inline size-3.5 me-1 opacity-80" aria-hidden /> : null;

  return (
    <nav
      aria-label={isAr ? "مسار التنقّل" : "Breadcrumb"}
      className={"min-w-0 flex-1 " + (className ?? "")}
    >
      {/* Mobile compact view — scrollable mini strip with fade edges */}
      <MobileScrollStrip
        crumbs={crumbs}
        Sep={Sep}
        RootIcon={RootIcon}
        isAr={!!isAr}
        ariaHome={ariaHome}
        middle={middle}
        showEllipsis={showEllipsis}
      />


      {/* Desktop full view */}
      <LayoutGroup id={layoutId}>
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
                    layoutId={`${layoutId}-current`}
                    aria-current="page"
                    tabIndex={0}
                    transition={spring}
                    className="relative max-w-[16rem] truncate rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary ring-1 ring-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {i === 0 ? renderRootIcon() : null}
                    {c.label}
                  </motion.span>
                ) : (
                  <Link
                    to={c.href}
                    aria-label={i === 0 ? (isAr ? ariaHome.ar : ariaHome.en) : undefined}
                    className="max-w-[12rem] truncate rounded-md px-2 py-1 font-medium text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {i === 0 ? renderRootIcon() : null}
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
