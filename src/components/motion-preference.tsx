import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { Sparkles, SparklesIcon, Monitor, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Mode = "user" | "always" | "never";
const KEY = "hbspro:motion-pref";

const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void; toggle: () => void }>({
  mode: "user",
  setMode: () => {},
  toggle: () => {},
});

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("user");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY) as Mode | null;
      if (stored === "user" || stored === "always" || stored === "never") {
        setModeState(stored);
      }
    } catch {
      /* ignore */
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      const v = e.newValue as Mode | null;
      if (v === "user" || v === "always" || v === "never") setModeState(v);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* ignore */
    }
  };

  const toggle = () => {
    const reduced =
      mode === "never"
        ? true
        : mode === "always"
          ? false
          : typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMode(reduced ? "always" : "never");
  };

  return (
    <Ctx.Provider value={{ mode, setMode, toggle }}>
      <MotionConfig reducedMotion={mode}>{children}</MotionConfig>
    </Ctx.Provider>
  );
}

export function useMotionPreference() {
  return useContext(Ctx);
}

export function MotionToggle({ className = "" }: { className?: string }) {
  const { mode, setMode } = useMotionPreference();
  // Track system reduced-motion on the client only. Reading matchMedia during
  // render would produce different output on the server (false) vs the client,
  // causing a hydration mismatch in the landing header.
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemReduced(mq.matches);
    const onChange = () => setSystemReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const reduced = mode === "never" ? true : mode === "always" ? false : systemReduced;
  const modeLabel = mode === "always" ? "on" : mode === "never" ? "off" : "system default";
  const ariaLabel = `Animations: ${modeLabel} (${reduced ? "reduced" : "full motion"}). Change animation preference.`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        className={`inline-flex size-9 items-center justify-center rounded-md border border-border/60 bg-background/60 text-muted-foreground backdrop-blur transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
        suppressHydrationWarning
      >
        <span suppressHydrationWarning className="inline-flex">
          {reduced ? (
            <SparklesIcon aria-hidden="true" className="size-4 opacity-40" />
          ) : (
            <Sparkles aria-hidden="true" className="size-4 text-primary" />
          )}
        </span>
        <span className="sr-only" suppressHydrationWarning>
          Animations: {modeLabel}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" aria-label="Animation preference">
        <DropdownMenuLabel>Animations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setMode("always")}
          aria-checked={mode === "always"}
          role="menuitemradio"
        >
          <Sparkles aria-hidden="true" className="size-4" /> On
          {mode === "always" && <Check aria-hidden="true" className="ms-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setMode("never")}
          aria-checked={mode === "never"}
          role="menuitemradio"
        >
          <SparklesIcon aria-hidden="true" className="size-4 opacity-50" /> Off
          {mode === "never" && <Check aria-hidden="true" className="ms-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setMode("user")}
          aria-checked={mode === "user"}
          role="menuitemradio"
        >
          <Monitor aria-hidden="true" className="size-4" /> Use system setting
          {mode === "user" && <Check aria-hidden="true" className="ms-auto size-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
