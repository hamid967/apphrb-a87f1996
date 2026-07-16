import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion, LayoutGroup } from "motion/react";
import { ShieldCheck } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { adminNavigationGroups } from "@/components/admin/adminNavigation";

export function AdminSidebar() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <Sidebar collapsible="icon" side={isAr ? "right" : "left"}>
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
            <ShieldCheck className="size-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">
                {isAr ? "لوحة الإدارة" : "Admin Panel"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {isAr ? "Super Admin" : "Super Admin"}
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <LayoutGroup id="admin-nav">
          {adminNavigationGroups.map((g) => {
            const groupActive = g.items.some((it) => isActive(it.to, it.exact));
            return (
              <SidebarGroup key={g.id}>
                {!collapsed && (
                  <SidebarGroupLabel className={groupActive ? "text-primary" : undefined}>
                    {isAr ? g.ar : g.en}
                  </SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {g.items.map((it) => {
                      const active = isActive(it.to, it.exact);
                      const Icon = it.icon;
                      return (
                        <SidebarMenuItem key={it.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={isAr ? it.ar : it.en}
                            className="relative data-[active=true]:bg-transparent"
                          >
                            <Link to={it.to} className="relative flex items-center gap-2">
                              {active && (
                                <motion.span
                                  layoutId="admin-nav-active"
                                  className="absolute inset-0 rounded-md bg-sidebar-accent"
                                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                  aria-hidden="true"
                                />
                              )}
                              {active && (
                                <motion.span
                                  layoutId="admin-nav-bar"
                                  className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-primary"
                                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                                  aria-hidden="true"
                                />
                              )}
                              <span className="relative z-10 flex items-center gap-2">
                                <Icon className="size-4 shrink-0" />
                                {!collapsed && (
                                  <span className="truncate">{isAr ? it.ar : it.en}</span>
                                )}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </LayoutGroup>
      </SidebarContent>
    </Sidebar>
  );
}
