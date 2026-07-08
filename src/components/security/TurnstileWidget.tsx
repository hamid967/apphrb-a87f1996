import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTurnstileSiteKey } from "@/lib/turnstile.functions";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.turnstile) return resolve();
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile_load_failed")));
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_URL;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile_load_failed"));
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({
  onToken,
  theme = "dark",
}: {
  onToken: (token: string | null) => void;
  theme?: "light" | "dark" | "auto";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["turnstile-site-key"],
    queryFn: () => getTurnstileSiteKey(),
    staleTime: Infinity,
  });
  const siteKey = data?.siteKey;

  useEffect(() => {
    let cancelled = false;
    if (!siteKey || !containerRef.current) return;
    (async () => {
      try {
        await loadScript();
        if (cancelled || !window.turnstile || !containerRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => onToken(token),
          "error-callback": () => onToken(null),
          "expired-callback": () => onToken(null),
          "timeout-callback": () => onToken(null),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "turnstile_error");
      }
    })();
    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* noop */
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, theme, onToken]);

  if (!siteKey) return null;
  return (
    <div className="flex justify-center">
      <div ref={containerRef} />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
