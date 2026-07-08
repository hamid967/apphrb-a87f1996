/**
 * Compile-time usage example for <SaudiMap3D />.
 * Not routed — imported only for type verification / manual demos.
 */
import { SaudiMap3D } from "./SaudiMap3D";
import type { SaudiMap3DProps } from "./saudi-map.types";

// 1. Default usage — no props, `compact` falls back to `false`.
export function SaudiMap3DDefaultExample() {
  return <SaudiMap3D />;
}

// 2. Compact usage — shorter height for embedded contexts.
export function SaudiMap3DCompactExample() {
  return <SaudiMap3D compact />;
}

// 3. Explicit boolean — same as (2) but written long-form.
export function SaudiMap3DExplicitExample() {
  const props: SaudiMap3DProps = { compact: true };
  return <SaudiMap3D {...props} />;
}

// @ts-expect-error — `compact` must be a boolean, not a string.
const _invalid = <SaudiMap3D compact="yes" />;
void _invalid;
