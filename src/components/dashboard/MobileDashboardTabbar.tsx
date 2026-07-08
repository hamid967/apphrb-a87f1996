import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  KeyRound,
  FileText,
  Coins,
  Receipt,
  Users2,
  Settings,
  Sparkles,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { isNavItemActive } from "./DashboardSidebar";
import { useRequestBadgeCounts } from "@/hooks/use-request-badge-counts";

type Item = {
  url: string;
  search?: Record<string, unknown>;
  icon: typeof LayoutDashboard;
  ar: string;
  en: string;
  badge?: "myPending" | "approval";
};

const ITEMS: readonly Item[] = [
  { url: "/dashboard", icon: LayoutDashboard, ar: "الرئيسية", en: "Overview" },
  { url: "/dashboard", search: { view: "smart" }, icon: Sparkles, ar: "ذكي", en: "Smart" },
  { url: "/dashboard/units", icon: KeyRound, ar: "الوحدات", en: "Units" },
  { url: "/dashboard/contracts", icon: FileText, ar: "العقود", en: "Contracts" },
  { url: "/dashboard/payments", icon: Coins, ar: "المدفوعات", en: "Payments" },
  { url: "/dashboard/expenses", icon: Receipt, ar: "المصروفات", en: "Expenses", badge: "myPending" },
  { url: "/dashboard/tenants", icon: Users2, ar: "المستأجرون", en: "Tenants" },
  { url: "/dashboard/applications", icon: ClipboardList, ar: "الطلبات", en: "Applications", badge: "approval" },
  { url: "/reports/builder", icon: BarChart3, ar: "التقارير", en: "Reports" },
  { url: "/dashboard/settings", icon: Settings, ar: "الإعدادات", en: "Settings" },
] as const;

function formatBadge(n: number) {
  if (n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

function AnimatedBadge({ text, kind }: { text: string; kind?: Item["badge"] }) {
  const isDestructive = kind === "approval";
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={text}
        aria-hidden
        initial={{ opacity: 0, scale: 0.5, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.5, y: 6 }}
        transition={{ type: "spring", stiffness: 360, damping: 22, mass: 0.8 }}
        className={[
          "absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums shadow-sm",
          isDestructive
            ? "bg-destructive text-destructive-foreground"
            : "bg-primary text-primary-foreground",
        ].join(" ")}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  );
}

export function MobileDashboardTabbar() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const currentView = (search?.view as string | undefined) ?? "classic";
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const { myPendingRequests, approvalRequests } = useRequestBadgeCounts();

  const isActive = (item: Item) => {
    if (item.url !== "/dashboard") return isNavItemActive(pathname, item.url);
    const wantSmart = item.search?.view === "smart";
    if (pathname !== "/dashboard") return false;
    return wantSmart ? currentView === "smart" : currentView !== "smart";
  };

  const badgeCount = (kind?: Item["badge"]) => {
    if (kind === "myPending") return myPendingRequests;
    if (kind === "approval") return approvalRequests;
    return 0;
  };

  const badgeLabel = (item: Item, count: number) => {
    if (count <= 0) return item.en;
    if (item.badge === "myPending") {
      return isAr
        ? `${item.ar} — ${count} طلب معلّق`
        : `${item.en} — ${count} pending request${count === 1 ? "" : "s"}`;
    }
    if (item.badge === "approval") {
      return isAr
        ? `${item.ar} — ${count} طلب موافقة`
        : `${item.en} — ${count} approval request${count === 1 ? "" : "s"}`;
    }
    return isAr ? item.ar : item.en;
  };

  // Center the active pill in view as the route changes.
  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [pathname, currentView]);

  // Hide the bar when the virtual keyboard opens so it doesn't cover inputs.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => {
      const full = window.innerHeight;
      setKeyboardOpen(full > 0 && vv.height / full < 0.78);
    };
    vv.addEventListener("resize", check);
    window.addEventListener("resize", check);
    check();
    return () => {
      vv.removeEventListener("resize", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  return (
    <nav
      role="navigation"
      aria-label={isAr ? "تنقّل سريع" : "Quick navigation"}
      className={[
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        "transition-transform duration-300 ease-out will-change-transform",
        keyboardOpen ? "translate-y-[110%]" : "translate-y-0",
      ].join(" ")}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
    >
      <div
        className="mx-2 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/85 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        style={{ borderColor: "rgba(212,175,55,0.22)" }}
      >
        <div
          ref={scrollerRef}
          dir={isAr ? "rtl" : "ltr"}
          className="flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain px-2 py-2 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        >
          {ITEMS.map((item) => {
            const label = isAr ? item.ar : item.en;
            const active = isActive(item);
            const Icon = item.icon;
            const count = badgeCount(item.badge);
            const badgeText = formatBadge(count);
            const ariaLabel = badgeLabel(item, count);
            return (
              <Link
                key={item.url + (item.search?.view ?? "")}
                to={item.url}
                search={item.search as any}
                ref={active ? activeRef : undefined}
                aria-label={ariaLabel}
                aria-current={active ? "page" : undefined}
                className={[
                  "group relative flex min-w-[68px] shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-xl px-3 py-1.5",
                  "touch-manipulation select-none transition-all duration-200 active:scale-95",
                  active
                    ? "bg-gradient-to-b from-amber-500/20 to-amber-500/5 text-white shadow-[inset_0_0_0_1px_rgba(212,175,55,0.35)]"
                    : "text-slate-300 hover:text-white",
                ].join(" ")}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <span className="relative">
                  <Icon
                    className={`h-5 w-5 shrink-0 transition ${active ? "text-amber-300" : "text-slate-400 group-hover:text-amber-200"}`}
                    aria-hidden="true"
                  />
                  {badgeText && (
                    <AnimatedBadge text={badgeText} kind={item.badge} />
                  )}
                </span>
                <span className="text-[10px] font-medium leading-none">{label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 bottom-0.5 h-[2px] rounded-full"
                    style={{
                      background: "linear-gradient(90deg, #D4AF37 0%, #E9C866 100%)",
                      boxShadow: "0 0 8px rgba(212,175,55,0.7)",
                    }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
