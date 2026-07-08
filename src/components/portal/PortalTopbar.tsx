import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Bell, Menu, Search, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AdminGlobalSearch } from "@/components/admin/AdminGlobalSearch";

export function PortalTopbar({
  onMenu,
  fullName,
  avatarUrl,
  unread,
  isAdmin,
}: {
  onMenu: () => void;
  fullName: string | null;
  avatarUrl: string | null;
  unread: number;
  isAdmin?: boolean;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const initials =
    (fullName ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={isAr ? "فتح القائمة" : "Open menu"}
            onClick={onMenu}
          >
            <Menu className="size-4" />
          </Button>
        </div>

        <div className="min-w-0">
          {isAdmin ? (
            <AdminGlobalSearch isAr={!!isAr} />
          ) : (
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground rtl:left-auto rtl:right-3" />
              <input
                type="search"
                placeholder={isAr ? "ابحث في كل شيء…" : "Search everything…"}
                aria-label={isAr ? "بحث" : "Search"}
                className="h-9 w-full rounded-full border border-border/70 bg-muted/40 pl-10 pr-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background rtl:pl-3 rtl:pr-10"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            to="/portal/assistant"
            className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/10 sm:inline-flex"
          >
            <Bot className="size-3.5" />
            {isAr ? "المساعد" : "AI"}
          </Link>
          <ThemeToggle />
          <LanguageSwitcher />
          <Link
            to="/portal/notifications"
            className="relative inline-grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={
              isAr
                ? `الإشعارات${unread ? ` — ${unread} غير مقروءة` : ""}`
                : `Notifications${unread ? ` — ${unread} unread` : ""}`
            }
          >
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <Link
            to="/portal/settings"
            aria-label={isAr ? "الملف الشخصي" : "Profile"}
            className="grid size-9 place-items-center overflow-hidden rounded-full border border-border/60 bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-bold text-primary transition hover:ring-2 hover:ring-primary/30"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName ?? "avatar"}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              initials
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
