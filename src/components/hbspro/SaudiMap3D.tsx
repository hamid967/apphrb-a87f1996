import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { HBS } from "./tokens";
import type { SaudiMap3DProps } from "./saudi-map.types";

// Lazy, client-only import — keeps three.js out of the SSR/Nitro bundle.
const SceneLazy = lazy(() =>
  import("./SaudiMap3DScene").then((m) => ({ default: m.SaudiMap3DScene })),
);

export function SaudiMap3D({ compact = false }: SaudiMap3DProps) {
  const height = compact ? 380 : 560;
  const placeholder = (
    <div
      className="relative w-full overflow-hidden rounded-2xl"
      style={{
        height,
        background:
          "radial-gradient(1200px 600px at 50% 20%, rgba(30,136,229,0.18), transparent 60%), #050e18",
        border: `1px solid ${HBS.border}`,
      }}
    />
  );

  return (
    <ClientOnly fallback={placeholder}>
      <Suspense fallback={placeholder}>
        <SceneLazy compact={compact} />
      </Suspense>
    </ClientOnly>
  );
}

export default SaudiMap3D;
