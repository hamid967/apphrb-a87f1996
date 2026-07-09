import { useEffect } from "react";
import { motion, useSpring, useMotionValueEvent, useReducedMotion } from "motion/react";
import { useState } from "react";

export type AnimatedNumberProps = {
  value: number;
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  /** Spring config. Defaults tuned for KPI counters. */
  stiffness?: number;
  damping?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * Springs a numeric value from its previous state to the new one using
 * framer-motion's `useSpring`. Respects `prefers-reduced-motion` — in that
 * case the target value is displayed immediately.
 */
export function AnimatedNumber({
  value,
  format,
  prefix = "",
  suffix = "",
  stiffness = 120,
  damping = 24,
  className,
  ...rest
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, {
    stiffness,
    damping,
    mass: 0.6,
    restDelta: 0.5,
  });
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduce) {
      spring.jump(value);
      setDisplay(value);
    } else {
      spring.set(value);
    }
  }, [value, reduce, spring]);

  useMotionValueEvent(spring, "change", (latest) => {
    setDisplay(latest);
  });

  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString());
  return (
    <motion.span
      className={className}
      aria-label={rest["aria-label"] ?? `${prefix}${fmt(value)}${suffix}`}
    >
      {prefix}
      {fmt(display)}
      {suffix}
    </motion.span>
  );
}
