import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "aqari.dashboard.theme"; // "tech" | "default"
export type DashboardThemeMode = "tech" | "default";

export function readDashboardTheme(): DashboardThemeMode {
  if (typeof window === "undefined") return "default";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "tech" ? "tech" : "default";
}

// Track the pending "end of transition" timer so rapid toggles don't
// leave the html.theme-transitioning class stuck on.
let __themeTransitionTimer: number | null = null;

export function applyDashboardTheme(mode: DashboardThemeMode, animate = true) {
  const el = document.documentElement;
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (animate && !prefersReducedMotion) {
    el.classList.add("theme-transitioning");
    if (__themeTransitionTimer !== null) {
      window.clearTimeout(__themeTransitionTimer);
    }
    __themeTransitionTimer = window.setTimeout(() => {
      el.classList.remove("theme-transitioning");
      __themeTransitionTimer = null;
    }, 360);
  }

  if (mode === "tech") {
    el.classList.remove("theme-lux");
    el.classList.add("theme-tech", "dark");
  } else {
    el.classList.remove("theme-tech", "dark");
    el.classList.add("theme-lux");
  }
}

export function DashboardThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<DashboardThemeMode>(() => readDashboardTheme());
  const firstRun = useRef(true);

  useEffect(() => {
    // Skip the fade on the very first mount so we don't animate from the
    // default palette into tech on page load — only user-triggered swaps
    // should tween.
    applyDashboardTheme(mode, !firstRun.current);
    firstRun.current = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore quota / privacy mode
    }
    window.dispatchEvent(new CustomEvent("aqari:dashboard-theme", { detail: mode }));
  }, [mode]);

  // Keep this button's icon/label in sync when the theme is changed elsewhere:
  // another DashboardThemeToggle instance (e.g. Admin header vs Dashboard topbar),
  // another browser tab writing to localStorage, or programmatic dispatch.
  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<DashboardThemeMode>).detail;
      if (detail === "tech" || detail === "default") {
        setMode((prev) => (prev === detail ? prev : detail));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next: DashboardThemeMode = e.newValue === "default" ? "default" : "tech";
      setMode((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("aqari:dashboard-theme", onEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("aqari:dashboard-theme", onEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const isTech = mode === "tech";
  const label = isTech
    ? t("theme.dashboard.switchToDefault", "التبديل إلى الثيم الافتراضي")
    : t("theme.dashboard.switchToTech", "التبديل إلى Minimal Dark Tech");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setMode(isTech ? "default" : "tech")}
      className={cn("rounded-xl", className)}
    >
      {isTech ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
