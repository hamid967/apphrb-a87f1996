import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "aqari.dashboard.theme"; // "tech" | "default"
export type DashboardThemeMode = "tech" | "default";

export function readDashboardTheme(): DashboardThemeMode {
  if (typeof window === "undefined") return "tech";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "default" ? "default" : "tech";
}

export function applyDashboardTheme(mode: DashboardThemeMode) {
  const el = document.documentElement;
  if (mode === "tech") {
    el.classList.add("theme-tech", "dark");
  } else {
    el.classList.remove("theme-tech", "dark");
  }
}

export function DashboardThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<DashboardThemeMode>(() => readDashboardTheme());

  useEffect(() => {
    applyDashboardTheme(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore quota / privacy mode
    }
    window.dispatchEvent(new CustomEvent("aqari:dashboard-theme", { detail: mode }));
  }, [mode]);

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
      {isTech ? <Square className="size-4" /> : <Sparkles className="size-4" />}
    </Button>
  );
}
