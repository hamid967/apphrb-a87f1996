import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  FileClock,
  FolderOpen,
  Receipt,
  Bell,
  LifeBuoy,
  Settings,
  Sparkles,
  CreditCard,
} from "lucide-react";

type Item = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  ar: string;
  en: string;
};

const NAV: Item[] = [
  { to: "/portal", icon: LayoutDashboard, ar: "نظرة عامة", en: "Overview" },
  { to: "/portal/requests", icon: FileClock, ar: "طلباتي", en: "Requests" },
  { to: "/portal/documents", icon: FolderOpen, ar: "الوثائق", en: "Documents" },
  { to: "/portal/invoices", icon: Receipt, ar: "الفواتير", en: "Invoices" },
  { to: "/portal/billing", icon: CreditCard, ar: "الاشتراك والدفع", en: "Billing" },
  { to: "/portal/notifications", icon: Bell, ar: "الإشعارات", en: "Notifications" },
  { to: "/portal/support", icon: LifeBuoy, ar: "الدعم", en: "Support" },
  { to: "/portal/settings", icon: Settings, ar: "الإعدادات", en: "Settings" },
];

export function PortalSidebar({
  collapsed = false,
  mobile = false,
}: {
  collapsed?: boolean;
  mobile?: boolean;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <aside
      aria-label={isAr ? "شريط التنقل" : "Primary navigation"}
      className={
        (mobile
          ? "h-full border-border/60 bg-card"
          : "sticky top-0 hidden h-dvh shrink-0 border-r border-border/60 bg-card/60 backdrop-blur-xl lg:block ") +
        (collapsed ? "w-[76px]" : "w-[248px]")
      }
    >
      <div className="flex h-14 items-center gap-2 border-b border-border/60 px-4">
        <div className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-[var(--shadow-glow)]">
          <Sparkles className="size-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">HR HBSH</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {isAr ? "بوابة الأعمال" : "Business Portal"}
            </div>
          </div>
        )}
      </div>

      <nav className="p-2">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = item.to === "/portal" ? path === "/portal" : path.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all " +
                    (active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
                  }
                  aria-current={active ? "page" : undefined}
                >
                  {active && (
                    <motion.span
                      layoutId="portal-nav-pill"
                      className="absolute inset-y-1 left-0 w-1 rounded-full bg-primary rtl:left-auto rtl:right-0"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  )}
                  <Icon className="size-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{isAr ? item.ar : item.en}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {!collapsed && !mobile && <PortalHelpCard isAr={isAr} />}
    </aside>
  );
}

function PortalHelpCard({ isAr }: { isAr: boolean }) {
  return (
    <div className="mx-3 mt-4 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 to-accent/10 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        {isAr ? "تحتاج مساعدة؟" : "Need help?"}
      </div>
      <p className="mt-1 text-xs text-foreground/80">
        {isAr
          ? "افتح تذكرة دعم من البوابة وسنراجع طلبك."
          : "Open a support ticket and we will review your request."}
      </p>
      <Link
        to="/portal/support"
        className="mt-2 inline-flex text-[11px] font-semibold text-primary hover:underline"
      >
        {isAr ? "الدعم ←" : "Support →"}
      </Link>
    </div>
  );
}
