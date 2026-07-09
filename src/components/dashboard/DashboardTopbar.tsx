import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import {
  Search,
  Sparkles,
  Calendar as CalendarIcon,
  MessageSquare,
  Bell,
  Building2,
  ChevronDown,
  Check,
  User as UserIcon,
  LogOut,
  Settings as SettingsIcon,
  LayoutDashboard,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { HoloIntensityToggle } from "@/components/holo-intensity-toggle";
import { DashboardThemeToggle } from "@/components/dashboard-theme-toggle";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";
import { formatDistanceToNow } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { ThreadDrawer } from "./ThreadDrawer";

type Org = { id: string; name: string; slug: string; logo_url?: string | null };
type Membership = { role: string; org: Org };

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="absolute -top-1 -end-1 grid min-w-[18px] h-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-md ring-2 ring-background"
    >
      {count > 99 ? "99+" : count}
    </motion.span>
  );
}

function IconButton({
  onClick,
  ariaLabel,
  count,
  children,
  asChild,
}: {
  onClick?: () => void;
  ariaLabel: string;
  count?: number;
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const btn = (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="luxe-icon-btn">
      {children}
      {count !== undefined ? <Badge count={count} /> : null}
    </button>
  );
  if (asChild) return btn;
  return btn;
}

export function DashboardTopbar({
  user,
  orgs,
  activeOrg,
  onOrgChange,
}: {
  user: User;
  orgs: Membership[];
  activeOrg: Org | undefined;
  onOrgChange?: (orgId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  // Restore last-selected branch per org
  useEffect(() => {
    if (!activeOrg?.id) return;
    try {
      setActiveBranchId(localStorage.getItem(`aqary:active-branch:${activeOrg.id}`));
    } catch {
      setActiveBranchId(null);
    }
  }, [activeOrg?.id]);

  const notifQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["topbar-notif-count", user.id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, count } = await supabase
        .from("notifications")
        .select("id, title, body, created_at, read_at, link", { count: "exact" })
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(6);
      const unread = (data ?? []).filter((n) => !n.read_at).length;
      return { list: data ?? [], count: count ?? 0, unread };
    },
  });

  const msgQ = useQuery({
    enabled: !!activeOrg?.id,
    queryKey: ["topbar-msg-count", activeOrg?.id, user.id],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, count } = await supabase
        .from("assistant_threads")
        .select("id, title, updated_at", { count: "exact" })
        .eq("org_id", activeOrg!.id)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(6);
      return { list: data ?? [], count: count ?? 0 };
    },
  });

  const [calDate, setCalDate] = useState<Date | undefined>(new Date());
  const dfLocale = isAr ? ar : enUS;
  const notifUnread = notifQ.data?.unread ?? 0;
  const msgCount = msgQ.data?.count ?? 0;
  const [openThread, setOpenThread] = useState<{ id: string; title: string | null } | null>(null);

  const branchesQ = useQuery({
    enabled: !!activeOrg?.id,
    queryKey: ["topbar-branches", activeOrg?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches")
        .select("id, name, code")
        .eq("org_id", activeOrg!.id)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as Array<{ id: string; name: string; code: string | null }>;
    },
  });

  const branches = branchesQ.data ?? [];
  const activeBranch = useMemo(
    () => branches.find((b) => b.id === activeBranchId) ?? null,
    [branches, activeBranchId],
  );

  const initials =
    (user.email ?? "?")
      .split("@")[0]
      .split(/[._-]/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "U";
  const displayName =
    (user.user_metadata as { full_name?: string; name?: string })?.full_name ??
    (user.user_metadata as { name?: string })?.name ??
    user.email ??
    "";
  const avatarUrl = (user.user_metadata as { avatar_url?: string })?.avatar_url;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const value = q.trim();
    if (!value) return;
    nav({ to: "/dashboard/properties", search: { q: value } as never });
  };
  const openAiSearch = () => {
    const query = q.trim();
    nav({
      to: "/assistant",
      search: query ? ({ q: query } as never) : (undefined as never),
    });
  };

  return (
    <header
      className="sticky top-0 z-30 hidden px-4 py-3 md:flex md:items-center md:gap-3"
      style={{
        background: "linear-gradient(180deg, rgba(17,24,39,0.78) 0%, rgba(7,19,32,0.72) 100%)",
        backdropFilter: "blur(22px) saturate(160%)",
        borderBottom: "1px solid rgba(212,175,55,0.18)",
        boxShadow: "0 20px 60px -40px rgba(0,0,0,0.6)",
      }}
    >
      {/* Search + AI chip */}
      <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
        <div className="relative flex-1 max-w-[560px]">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-amber-300/70" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              isAr
                ? "البحث في العقارات، العقود، المستأجرين..."
                : "Search properties, contracts, tenants..."
            }
            className="h-10 rounded-xl border-[rgba(212,175,55,0.22)] bg-white/[0.04] ps-9 pe-32 text-sm text-white placeholder:text-slate-400 backdrop-blur-xl transition focus-visible:border-[rgba(212,175,55,0.55)] focus-visible:ring-2 focus-visible:ring-[rgba(212,175,55,0.25)]"
            aria-label={t("search", { defaultValue: "Search" })}
          />
          <button
            type="button"
            onClick={openAiSearch}
            className="absolute end-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 transition-transform hover:-translate-y-[calc(50%+2px)]"
            style={{
              background: "linear-gradient(135deg, #D4AF37 0%, #E9C866 100%)",
              boxShadow: "0 8px 24px -6px rgba(212,175,55,0.55)",
            }}
          >
            <Sparkles className="size-3.5" />
            {isAr ? "بحث بالذكاء الاصطناعي" : "AI Search"}
          </button>
        </div>
      </form>

      <div className="flex items-center gap-2">
        {/* Calendar */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("sidebar.calendar", { defaultValue: "Calendar" })}
              className="luxe-icon-btn"
            >
              <CalendarIcon className="size-[18px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-2">
            <Calendar mode="single" selected={calDate} onSelect={setCalDate} />
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => nav({ to: "/tasks" })}>
                {isAr ? "فتح المهام" : "Open tasks"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Messages / Assistant */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Messages" className="luxe-icon-btn">
              <MessageSquare className="size-[18px]" />
              <Badge count={msgCount} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{isAr ? "المحادثات" : "Conversations"}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {msgCount} {isAr ? "محادثة" : "threads"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-72">
              {(msgQ.data?.list ?? []).length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {isAr ? "لا توجد محادثات بعد" : "No conversations yet"}
                </div>
              ) : (
                (msgQ.data?.list ?? []).map((th) => (
                  <DropdownMenuItem
                    key={th.id}
                    onSelect={() => setOpenThread({ id: th.id, title: th.title })}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <div className="line-clamp-1 text-sm font-medium">
                      {th.title || (isAr ? "محادثة" : "Thread")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(th.updated_at), {
                        addSuffix: true,
                        locale: dfLocale,
                      })}
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </ScrollArea>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => nav({ to: "/assistant" })}
              className="justify-center text-primary"
            >
              {isAr ? "فتح المساعد" : "Open assistant"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Notifications" className="luxe-icon-btn">
              <Bell className="size-[18px]" />
              <Badge count={notifUnread} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{isAr ? "الإشعارات" : "Notifications"}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {notifUnread === 0
                  ? isAr
                    ? "لا جديد"
                    : "All caught up"
                  : `${notifUnread} ${isAr ? "غير مقروءة" : "unread"}`}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-80">
              {(notifQ.data?.list ?? []).length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {isAr ? "لا توجد إشعارات" : "No notifications"}
                </div>
              ) : (
                (notifQ.data?.list ?? []).map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onSelect={() => {
                      if (n.link) nav({ to: n.link as never });
                      else nav({ to: "/dashboard/notifications" });
                    }}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <div className="line-clamp-1 text-sm font-medium">{n.title}</div>
                      {!n.read_at ? <span className="size-1.5 rounded-full bg-primary" /> : null}
                    </div>
                    {n.body ? (
                      <div className="line-clamp-2 text-[11px] text-muted-foreground">{n.body}</div>
                    ) : null}
                    <div className="text-[10px] text-muted-foreground/80">
                      {formatDistanceToNow(new Date(n.created_at), {
                        addSuffix: true,
                        locale: dfLocale,
                      })}
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </ScrollArea>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard/settings" className="cursor-pointer">
                {isAr ? "فتح مركز الإشعارات" : "Open notification center"}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-6 w-px bg-[rgba(212,175,55,0.25)]" />

        <LanguageSwitcher />
        <ThemeToggle />
        <DashboardThemeToggle />
        <HoloIntensityToggle />



        <div className="mx-1 h-6 w-px bg-[rgba(212,175,55,0.25)]" />

        {/* Company switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="luxe-pill">
              <Building2 className="size-4 text-amber-300" />
              <span className="max-w-[140px] truncate">
                {activeOrg?.name ?? (isAr ? "الشركة" : "Company")}
              </span>
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{isAr ? "الشركات" : "Companies"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {orgs.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {isAr ? "لا توجد شركات" : "No companies"}
              </div>
            ) : (
              orgs.map((m) => (
                <DropdownMenuItem
                  key={m.org.id}
                  onSelect={() => onOrgChange?.(m.org.id)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Building2 className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{m.org.name}</span>
                  </span>
                  {activeOrg?.id === m.org.id ? <Check className="size-3.5 text-primary" /> : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Branch switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="luxe-pill">
              <MapPin className="size-4 text-amber-300" />
              <span className="max-w-[120px] truncate">
                {activeBranch?.name ?? (isAr ? "كل الفروع" : "All branches")}
              </span>
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{isAr ? "الفروع" : "Branches"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setActiveBranchId(null);
                if (activeOrg?.id) localStorage.removeItem(`aqary:active-branch:${activeOrg.id}`);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span>{isAr ? "كل الفروع" : "All branches"}</span>
              {activeBranchId === null ? <Check className="size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
            {branches.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {isAr ? "لا توجد فروع" : "No branches"}
              </div>
            ) : (
              branches.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  onSelect={() => {
                    setActiveBranchId(b.id);
                    if (activeOrg?.id)
                      localStorage.setItem(`aqary:active-branch:${activeOrg.id}`, b.id);
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MapPin className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{b.name}</span>
                    {b.code ? (
                      <span className="text-[10px] text-muted-foreground">{b.code}</span>
                    ) : null}
                  </span>
                  {activeBranchId === b.id ? <Check className="size-3.5 text-primary" /> : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="User menu" className={cn("luxe-pill pe-3 ps-1")}>
              <Avatar className="size-8 border border-[rgba(212,175,55,0.45)]">
                <AvatarImage src={avatarUrl} alt={displayName} />
                <AvatarFallback
                  className="text-xs font-bold text-slate-900"
                  style={{ background: "linear-gradient(135deg,#D4AF37,#E9C866)" }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden max-w-[140px] text-start lg:block">
                <div className="truncate text-sm font-semibold leading-tight text-white">
                  {displayName}
                </div>
                <div className="truncate text-[10px] text-amber-300/70">{orgs[0]?.role ?? ""}</div>
              </div>
              <ChevronDown className="size-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard" className="cursor-pointer">
                <LayoutDashboard className="me-2 size-4" />
                {isAr ? "لوحة التحكم" : "Dashboard"}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/dashboard/settings" className="cursor-pointer">
                <UserIcon className="me-2 size-4" />
                {isAr ? "الملف الشخصي" : "Profile"}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/dashboard/settings/import" className="cursor-pointer">
                <SettingsIcon className="me-2 size-4" />
                {isAr ? "الإعدادات" : "Settings"}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => supabase.auth.signOut()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="me-2 size-4" />
              {isAr ? "تسجيل الخروج" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ThreadDrawer
        threadId={openThread?.id ?? null}
        title={openThread?.title ?? null}
        open={!!openThread}
        onOpenChange={(v) => !v && setOpenThread(null)}
        isAr={!!isAr}
      />
    </header>
  );
}
