/**
 * Reads `prefers-reduced-motion` and keeps updating if the user toggles it.
 * Returns `true` when the OS/browser signals a preference for reduced
 * motion — components should shorten animations, skip repeated pulses, and
 * prefer instant scroll behavior.
 */
import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    // Safari <14 uses addListener/removeListener
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  return reduced;
}
