import { useEffect, useState, useCallback } from "react";

const KEY = "hrhbs.impersonation";

export type ImpersonationState = {
  session_id: string;
  target: { id: string; email: string | null; full_name: string | null };
  started_at: string;
  expires_at: string;
} | null;

function read(): ImpersonationState {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ImpersonationState) : null;
  } catch {
    return null;
  }
}

export function useImpersonation() {
  const [state, setState] = useState<ImpersonationState>(null);

  useEffect(() => {
    setState(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(read());
    };
    const onCustom = () => setState(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener("impersonation-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("impersonation-changed", onCustom);
    };
  }, []);

  const set = useCallback((s: ImpersonationState) => {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("impersonation-changed"));
    setState(s);
  }, []);

  return { state, set };
}
