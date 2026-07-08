import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { supabase } from "@/integrations/supabase/client";
import i18n, { applyDirection } from "@/lib/i18n";
import {
  Home,
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  Wrench,
  Wallet,
  BarChart3,
  Sparkles,
  Shield,
  Globe,
  Moon,
  Sun,
  LogOut,
  LogIn,
  Search,
  Sigma,
  FolderKanban,
  Bot,
  Handshake,
  ListChecks,
} from "lucide-react";

type Item = {
  id: string;
  label: string;
  labelEn: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  group: "nav" | "dashboard" | "reports" | "admin" | "actions";
};

const PUBLIC_ITEMS: Item[] = [
  { id: "home", label: "الرئيسية", labelEn: "Home", to: "/", icon: Home, group: "nav" },
  { id: "services", label: "الخدمات", labelEn: "Services", to: "/services", icon: Sparkles, group: "nav" },
  { id: "pricing", label: "الأسعار", labelEn: "Pricing", to: "/pricing", icon: Wallet, group: "nav" },
  { id: "compare", label: "المقارنة", labelEn: "Compare", to: "/compare", icon: BarChart3, group: "nav" },
  { id: "listings", label: "العقارات المعروضة", labelEn: "Listings", to: "/listings", icon: Building2, group: "nav" },
  { id: "auth", label: "تسجيل الدخول", labelEn: "Sign in", to: "/auth", icon: LogIn, group: "nav" },
];

const AUTH_ITEMS: Item[] = [
  { id: "dashboard", label: "لوحة التحكم", labelEn: "Dashboard", to: "/dashboard", icon: LayoutDashboard, group: "dashboard" },
  { id: "properties", label: "العقارات", labelEn: "Properties", to: "/properties", icon: Building2, group: "dashboard" },
  { id: "tenants", label: "المستأجرون", labelEn: "Tenants", to: "/tenants", icon: Users, group: "dashboard" },
  { id: "contracts", label: "العقود", labelEn: "Contracts", to: "/contracts", icon: FileText, group: "dashboard" },
  { id: "maintenance", label: "الصيانة", labelEn: "Maintenance", to: "/dashboard/maintenance", icon: Wrench, group: "dashboard" },
  { id: "accounting", label: "المحاسبة", labelEn: "Accounting", to: "/accounting", icon: Wallet, group: "dashboard" },
  { id: "tasks", label: "المهام", labelEn: "Tasks", to: "/tasks", icon: ListChecks, group: "dashboard" },
  { id: "deals", label: "الصفقات", labelEn: "Deals", to: "/deals", icon: Handshake, group: "dashboard" },
  { id: "assistant", label: "المساعد الذكي", labelEn: "AI Assistant", to: "/assistant", icon: Bot, group: "dashboard" },
  {
    id: "reports-services",
    label: "مركز التقارير",
    labelEn: "Reports hub",
    to: "/dashboard/services-report",
    icon: FolderKanban,
    group: "reports",
  },
  {
    id: "reports-builder",
    label: "منشئ التقارير",
    labelEn: "Report builder",
    to: "/reports/builder",
    icon: Sigma,
    group: "reports",
  },
  {
    id: "reports-templates",
    label: "قوالب التقارير",
    labelEn: "Report templates",
    to: "/reports/templates",
    icon: FileText,
    group: "reports",
  },
  { id: "admin", label: "لوحة المشرف", labelEn: "Super admin", to: "/admin", icon: Shield, group: "admin" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { i18n: i18nInstance } = useTranslation();
  const isAr = (i18nInstance.language || "ar").startsWith("ar");

  // ⌘K / Ctrl+K / "/" toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !meta) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const editable =
          target?.isContentEditable ||
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT";
        if (editable) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<Item[]>(
    () => (user ? [...AUTH_ITEMS, ...PUBLIC_ITEMS] : PUBLIC_ITEMS),
    [user],
  );

  const grouped = useMemo(() => {
    const g: Record<Item["group"], Item[]> = {
      nav: [],
      dashboard: [],
      reports: [],
      admin: [],
      actions: [],
    };
    for (const it of items) g[it.group].push(it);
    return g;
  }, [items]);

  const go = (to: string) => {
    setOpen(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: to as any });
  };

  const toggleLang = () => {
    const next = isAr ? "en" : "ar";
    i18n.changeLanguage(next);
    applyDirection(next);
    try {
      localStorage.setItem("i18nextLng", next);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
    setOpen(false);
  };

  const signOut = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const label = (it: Item) => (isAr ? it.label : it.labelEn);
  const groupTitle = (ar: string, en: string) => (isAr ? ar : en);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={
          isAr
            ? "ابحث عن صفحة أو أمر…  (⌘K)"
            : "Search pages and commands…  (⌘K)"
        }
      />
      <CommandList>
        <CommandEmpty>{isAr ? "لا توجد نتائج." : "No results."}</CommandEmpty>

        {user && grouped.dashboard.length > 0 && (
          <CommandGroup heading={groupTitle("لوحة التحكم", "Dashboard")}>
            {grouped.dashboard.map((it) => (
              <CommandItem
                key={it.id}
                value={`${it.label} ${it.labelEn} ${it.to}`}
                onSelect={() => go(it.to)}
              >
                <it.icon className="me-2 size-4 opacity-70" />
                {label(it)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {user && grouped.reports.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={groupTitle("التقارير", "Reports")}>
              {grouped.reports.map((it) => (
                <CommandItem
                  key={it.id}
                  value={`${it.label} ${it.labelEn} ${it.to}`}
                  onSelect={() => go(it.to)}
                >
                  <it.icon className="me-2 size-4 opacity-70" />
                  {label(it)}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {user && grouped.admin.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={groupTitle("الإدارة", "Admin")}>
              {grouped.admin.map((it) => (
                <CommandItem
                  key={it.id}
                  value={`${it.label} ${it.labelEn} ${it.to}`}
                  onSelect={() => go(it.to)}
                >
                  <it.icon className="me-2 size-4 opacity-70" />
                  {label(it)}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading={groupTitle("التنقل", "Navigation")}>
          {grouped.nav
            .filter((it) => (user ? it.id !== "auth" : true))
            .map((it) => (
              <CommandItem
                key={it.id}
                value={`${it.label} ${it.labelEn} ${it.to}`}
                onSelect={() => go(it.to)}
              >
                <it.icon className="me-2 size-4 opacity-70" />
                {label(it)}
              </CommandItem>
            ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading={groupTitle("إجراءات", "Actions")}>
          <CommandItem value="toggle theme dark light" onSelect={toggleTheme}>
            {theme === "dark" ? (
              <Sun className="me-2 size-4 opacity-70" />
            ) : (
              <Moon className="me-2 size-4 opacity-70" />
            )}
            {isAr
              ? theme === "dark"
                ? "الوضع الفاتح"
                : "الوضع الداكن"
              : theme === "dark"
                ? "Switch to light"
                : "Switch to dark"}
            <CommandShortcut>⌘J</CommandShortcut>
          </CommandItem>
          <CommandItem value="language arabic english" onSelect={toggleLang}>
            <Globe className="me-2 size-4 opacity-70" />
            {isAr ? "English" : "العربية"}
          </CommandItem>
          {user && (
            <CommandItem value="sign out logout logoff" onSelect={signOut}>
              <LogOut className="me-2 size-4 opacity-70" />
              {isAr ? "تسجيل الخروج" : "Sign out"}
            </CommandItem>
          )}
          {!user && (
            <CommandItem value="search focus" onSelect={() => setOpen(false)}>
              <Search className="me-2 size-4 opacity-70" />
              {isAr ? "إغلاق" : "Close"}
              <CommandShortcut>Esc</CommandShortcut>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;