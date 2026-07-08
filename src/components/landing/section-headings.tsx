import type { ReactNode } from "react";

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-xs font-medium uppercase tracking-[0.2em] text-primary/80">
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mx-auto mt-3 max-w-2xl text-balance text-center text-3xl font-semibold tracking-tight sm:text-4xl">
      {children}
    </h2>
  );
}
