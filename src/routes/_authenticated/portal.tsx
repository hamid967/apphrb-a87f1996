import { createFileRoute, Outlet } from "@tanstack/react-router";
import { portalHead } from "@/lib/portal-og-head";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { PortalTopbar } from "@/components/portal/PortalTopbar";
import { getPortalOverview } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => portalHead({ titleAr: 'محطات العملاء', titleEn: 'Portal', descAr: 'بوابة موحّدة للملاك والمستأجرين والموظفين.', path: '/portal' }),
  component: PortalLayout,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
});

function PortalLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  // Lightweight header data (name/avatar/unread). Full overview is loaded on /portal itself.
  const { data } = useQuery({
    queryKey: ["portal", "header"],
    queryFn: () => getPortalOverview(),
    staleTime: 60_000,
  });

  return (
    <div className="flex min-h-dvh bg-background">
      <PortalSidebar />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[260px] bg-card shadow-2xl rtl:left-auto rtl:right-0">
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <span className="text-sm font-semibold">{isAr ? "القائمة" : "Menu"}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={isAr ? "إغلاق" : "Close"}
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div onClick={() => setMobileOpen(false)}>
              <PortalSidebar />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <PortalTopbar
          onMenu={() => setMobileOpen(true)}
          fullName={data?.profile.full_name ?? null}
          avatarUrl={data?.profile.avatar_url ?? null}
          unread={data?.kpis.notifications_unread ?? 0}
        />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
