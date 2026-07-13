import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gem, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Two-mode dashboard theme:
//   "emerald" — Emerald Prestige (theme-tech + dark) — default
//   "luxe"    — Luxe (theme-luxe navy/gold marketing skin)
// Selection is persisted in localStorage so it survives reloads and new sessions.
const STORAGE_KEY = "aqari.dashboard.theme";
export type DashboardThemeMode = "emerald" | "luxe";

const ALL_MODE_CLASSES = [
  "theme-tech",
  "theme-lux",
  "theme-luxe",
  "theme-royal",
  "dark",
] as const;

export function normalizeDashboardTheme(v: string | null | undefined): DashboardThemeMode {
  if (v === "luxe") return "luxe";
  // Migrate legacy values (tech/royal/default/lux) → emerald
  return "emerald";
}

export function readDashboardTheme(): DashboardThemeMode {
  if (typeof window === "undefined") return "emerald";
  try {
    return normalizeDashboardTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "emerald";
  }
}

let __themeTransitionTimer: number | null = null;

export function applyDashboardTheme(mode: DashboardThemeMode, animate = true) {
  const el = document.documentElement;
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (animate && !prefersReducedMotion) {
    el.classList.add("theme-transitioning");
    if (__themeTransitionTimer !== null) window.clearTimeout(__themeTransitionTimer);
    __themeTransitionTimer = window.setTimeout(() => {
      el.classList.remove("theme-transitioning");
      __themeTransitionTimer = null;
    }, 360);
  }

  el.classList.remove(...ALL_MODE_CLASSES);
  if (mode === "luxe") {
    el.classList.add("theme-luxe");
  } else {
    // Emerald Prestige = HRHBS Premium SaaS light canvas (no `dark` class)
    el.classList.add("theme-tech");
  }

}

export function DashboardThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<DashboardThemeMode>(() => readDashboardTheme());
  const firstRun = useRef(true);

  useEffect(() => {
    applyDashboardTheme(mode, !firstRun.current);
    firstRun.current = false;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("aqari:dashboard-theme", { detail: mode }));
  }, [mode]);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = normalizeDashboardTheme((e as CustomEvent<string>).detail);
      setMode((prev) => (prev === detail ? prev : detail));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = normalizeDashboardTheme(e.newValue);
      setMode((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("aqari:dashboard-theme", onEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("aqari:dashboard-theme", onEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const next: DashboardThemeMode = mode === "emerald" ? "luxe" : "emerald";
  const label =
    next === "luxe"
      ? t("theme.dashboard.switchToLuxe", "التبديل إلى ثيم Luxe")
      : t("theme.dashboard.switchToEmerald", "التبديل إلى Emerald Prestige");
  const Icon = mode === "emerald" ? Gem : Sparkles;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setMode(next)}
      className={cn("rounded-xl", className)}
    >
      <Icon className="size-4" />
    </Button>
  );
}
