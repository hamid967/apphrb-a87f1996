import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";

// Idle auto-logout: 8h for super admins, 24h for everyone else.
const SUPER_ADMIN_MS = 8 * 60 * 60 * 1000;
const DEFAULT_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "aqari.lastActivity";

export function IdleLogout() {
  const { isSuper } = usePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const timeoutRef = useRef<number | null>(null);
  const limit = isSuper ? SUPER_ADMIN_MS : DEFAULT_MS;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const doLogout = async () => {
      try {
        await qc.cancelQueries();
        qc.clear();
        await supabase.auth.signOut();
      } finally {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
        toast.message("تم تسجيل الخروج تلقائيًا بسبب عدم النشاط");
        navigate({ to: "/auth", replace: true });
      }
    };

    const schedule = () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      let last = Date.now();
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const n = Number(raw);
          if (Number.isFinite(n) && n > 0) last = n;
        }
      } catch {}
      const elapsed = Date.now() - last;
      if (elapsed >= limit) {
        void doLogout();
        return;
      }
      timeoutRef.current = window.setTimeout(() => void doLogout(), limit - elapsed);
    };

    const bump = () => {
      try {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
      } catch {}
      schedule();
    };

    // Reset activity on mount so a stale timestamp from a previous session
    // (older than `limit`) doesn't sign the user out immediately after login.
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {}
    schedule();

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "focus",
      "visibilitychange",
    ] as const;
    events.forEach((ev) =>
      window.addEventListener(ev, bump, { passive: true } as AddEventListenerOptions),
    );
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) schedule();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      events.forEach((ev) => window.removeEventListener(ev, bump));
      window.removeEventListener("storage", onStorage);
    };
  }, [limit, navigate, qc]);

  return null;
}
