import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion, LayoutGroup } from "motion/react";
import {
  LayoutDashboard,
  KeyRound,
  FileText,
  Coins,
  Receipt,
  Users2,
  Settings,
  Building2,
  Sparkles,
  Headphones,
  LogOut,
  ClipboardList,
  BarChart3,
  Home,
  Wallet,
  Target,
  CheckSquare,
  FolderOpen,
  CalendarClock,
  Gauge,
  Handshake,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { Button } from "@/components/ui/button";

const DASHBOARD_ROOT = "/dashboard";

function normalizePath(raw: string): string {
  const noQuery = raw.split("?")[0].split("#")[0];
  if (noQuery.length > 1 && noQuery.endsWith("/")) return noQuery.slice(0, -1);
  return noQuery;
}

export function isNavItemActive(currentPath: string, itemUrl: string): boolean {
  const path = normalizePath(currentPath);
  const url = normalizePath(itemUrl);
  if (url === DASHBOARD_ROOT) return path === DASHBOARD_ROOT;
  return path === url || path.startsWith(url + "/");
}

export function DashboardSidebar() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const groups: {
    labelAr: string;
    labelEn: string;
    items: readonly {
      url: string;
      icon: typeof Home;
      ar: string;
      en: string;
      search?: { view: "smart" };
    }[];
  }[] = [
    {
      labelAr: "الرئيسية",
      labelEn: "Overview",
      items: [
        { url: "/dashboard", icon: LayoutDashboard, ar: "الرئيسية", en: "Overview" },
        { url: "/dashboard", search: { view: "smart" }, icon: Sparkles, ar: "لوحة ذكية", en: "Smart Dashboard" },
        { url: "/dashboard/reports", icon: BarChart3, ar: "التقارير", en: "Reports" },
      ],
    },
    {
      labelAr: "العقارات",
      labelEn: "Properties",
      items: [
        { url: "/dashboard/properties", icon: Home, ar: "العقارات", en: "Properties" },
        { url: "/dashboard/units", icon: KeyRound, ar: "الوحدات", en: "Units" },
        { url: "/dashboard/owners", icon: Users2, ar: "الملّاك", en: "Owners" },
        { url: "/dashboard/valuations", icon: Gauge, ar: "التقييمات", en: "Valuations" },
        { url: "/dashboard/viewings", icon: CalendarClock, ar: "المعاينات", en: "Viewings" },
      ],
    },
    {
      labelAr: "العقود والمالية",
      labelEn: "Contracts & Finance",
      items: [
        { url: "/dashboard/contracts", icon: FileText, ar: "العقود", en: "Contracts" },
        { url: "/dashboard/payments", icon: Coins, ar: "المدفوعات", en: "Payments" },
        { url: "/dashboard/vouchers", icon: Wallet, ar: "السندات", en: "Vouchers" },
        { url: "/dashboard/expenses", icon: Receipt, ar: "المصروفات", en: "Expenses" },
        { url: "/dashboard/commissions", icon: Target, ar: "العمولات", en: "Commissions" },
      ],
    },
    {
      labelAr: "المستأجرون و CRM",
      labelEn: "Tenants & CRM",
      items: [
        { url: "/dashboard/tenants", icon: Users2, ar: "المستأجرون", en: "Tenants" },
        { url: "/dashboard/applications", icon: ClipboardList, ar: "طلبات السكن", en: "Applications" },
        { url: "/dashboard/crm/leads", icon: Target, ar: "العملاء المحتملون", en: "Leads" },
        { url: "/dashboard/crm/deals", icon: Handshake, ar: "الصفقات", en: "Deals" },
        { url: "/dashboard/crm/meetings", icon: CalendarClock, ar: "الاجتماعات", en: "Meetings" },
      ],
    },
    {
      labelAr: "العمليات",
      labelEn: "Operations",
      items: [
        { url: "/dashboard/tasks", icon: CheckSquare, ar: "المهام", en: "Tasks" },
        { url: "/dashboard/documents", icon: FolderOpen, ar: "المستندات", en: "Documents" },
        { url: "/dashboard/maintenance", icon: Settings, ar: "الصيانة", en: "Maintenance" },
      ],
    },
    {
      labelAr: "الإعدادات",
      labelEn: "Settings",
      items: [{ url: "/dashboard/settings", icon: Settings, ar: "الإعدادات", en: "Settings" }],
    },
  ];
  const items = groups.flatMap((g) => g.items);


  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const currentView = (search?.view as string | undefined) ?? "classic";
  const isActive = (item: (typeof items)[number]) => {
    if (item.url !== "/dashboard") return isNavItemActive(pathname, item.url);
    // Both /dashboard entries share the same URL — disambiguate by view param
    const wantSmart = (item as { search?: { view?: string } }).search?.view === "smart";
    if (pathname !== "/dashboard") return false;
    return wantSmart ? currentView === "smart" : currentView !== "smart";
  };

  return (
    <Sidebar
      collapsible="icon"
      side={isAr ? "right" : "left"}
      aria-label={isAr ? "قائمة لوحة التحكم" : "Dashboard navigation"}
      className="[&>[data-sidebar=sidebar]]:!bg-sidebar [&>[data-sidebar=sidebar]]:!border-sidebar-border"
    >
      <SidebarHeader className="relative z-10 px-3 pt-5 pb-2">
        <Link
          to="/dashboard"
          className="group flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-sidebar-accent"
        >
          <div
            className="grid size-9 shrink-0 place-items-center rounded-xl text-primary-foreground shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.55)] transition group-hover:scale-105"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Building2 className="size-4" aria-hidden />
          </div>
          {!collapsed && (
            <span className="truncate text-lg font-extrabold tracking-tight text-sidebar-foreground">
              HRHBS
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent
        role="navigation"
        aria-label={isAr ? "أقسام لوحة التحكم" : "Dashboard sections"}
        className="relative z-10 px-1.5"
      >
        {groups.map((group) => (
          <SidebarGroup key={group.labelEn}>
            {!collapsed && (
              <SidebarGroupLabel className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {isAr ? group.labelAr : group.labelEn}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const label = isAr ? item.ar : item.en;
                  const active = isActive(item);
                  return (
                    <SidebarMenuItem
                      key={item.url + (item.search?.view ?? "")}
                    >
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={label}
                        className={[
                          "group relative h-10 rounded-xl px-3 text-sidebar-foreground/80 transition-colors duration-200",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold",
                        ].join(" ")}
                      >
                        <Link
                          to={item.url}
                          search={item.search as any}
                          aria-label={label}
                          aria-current={active ? "page" : undefined}
                          className="flex items-center gap-3 focus-visible:outline-none min-w-0"
                        >
                          <item.icon
                            className={`size-[18px] shrink-0 transition ${active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-primary"}`}
                            aria-hidden="true"
                            focusable="false"
                          />
                          <span className="truncate text-[13px]">{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

      </SidebarContent>

      <SidebarFooter className="relative z-10 gap-3 p-3">
        {!collapsed && (
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-3.5 text-center">
            <div className="mx-auto mb-2 grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
              <Headphones className="size-5" aria-hidden />
            </div>
            <div className="text-[13px] font-semibold text-sidebar-foreground">
              {isAr ? "مركز الدعم" : "Support Center"}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {isAr ? "تحتاج مساعدة؟ تواصل معنا الآن" : "Need help? Contact us now"}
            </p>
            <Button
              size="sm"
              className="mt-2.5 h-8 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isAr ? "تواصل معنا" : "Contact us"}
            </Button>
          </div>
        )}
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-sidebar-foreground/80 transition hover:bg-sidebar-accent"
        >
          <LogOut className="size-[18px] text-sidebar-foreground/60" aria-hidden />
          {!collapsed && <span>{isAr ? "تسجيل خروج" : "Logout"}</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
