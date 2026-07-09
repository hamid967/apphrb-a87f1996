import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crown, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "aqari.dashboard.theme"; // "royal" | "tech" | "default"
export type DashboardThemeMode = "royal" | "tech" | "default";

const ALL_MODE_CLASSES = ["theme-tech", "theme-lux", "theme-royal", "dark"] as const;
const CYCLE: DashboardThemeMode[] = ["royal", "tech", "default"];

export function readDashboardTheme(): DashboardThemeMode {
  if (typeof window === "undefined") return "royal";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "tech" || v === "default" || v === "royal") return v;
  return "royal";
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
  if (mode === "tech") el.classList.add("theme-tech", "dark");
  else if (mode === "default") el.classList.add("theme-lux");
  else el.classList.add("theme-royal");
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
      const detail = (e as CustomEvent<DashboardThemeMode>).detail;
      if (detail === "tech" || detail === "default" || detail === "royal") {
        setMode((prev) => (prev === detail ? prev : detail));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue;
      const next: DashboardThemeMode =
        v === "tech" || v === "default" || v === "royal" ? v : "royal";
      setMode((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("aqari:dashboard-theme", onEvent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("aqari:dashboard-theme", onEvent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const next = CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
  const nextLabel: Record<DashboardThemeMode, string> = {
    royal: t("theme.dashboard.switchToRoyal", "التبديل إلى الثيم الملكي"),
    tech: t("theme.dashboard.switchToTech", "التبديل إلى الثيم الداكن"),
    default: t("theme.dashboard.switchToLux", "التبديل إلى الثيم الفاتح"),
  };
  const label = nextLabel[next];

  const Icon = mode === "royal" ? Crown : mode === "tech" ? Moon : Sun;

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
