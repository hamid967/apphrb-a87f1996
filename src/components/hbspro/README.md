# HBSpro Components

## `SaudiMap3D`

Interactive 3D map of Saudi Arabia rendered with `@react-three/fiber` + `three`, wrapped in Framer Motion entrance transitions. Lazy-loaded and client-only so it never enters the SSR bundle.

```tsx
import { SaudiMap3D } from "@/components/hbspro/SaudiMap3D";
```

### Props (`SaudiMap3DProps`)

Defined in [`saudi-map.types.ts`](./saudi-map.types.ts).

| Prop      | Type      | Default | Description                                                       |
| --------- | --------- | ------- | ----------------------------------------------------------------- |
| `compact` | `boolean` | `false` | Renders the map at a shorter height (`380px`) for embedded slots. |

### Usage

See [`SaudiMap3D.example.tsx`](./SaudiMap3D.example.tsx) for typed examples.

```tsx
// 1. Default — full height (560px)
<SaudiMap3D />

// 2. Compact — shorter height (380px)
<SaudiMap3D compact />

// 3. Spread via the shared type
import type { SaudiMap3DProps } from "./saudi-map.types";
const props: SaudiMap3DProps = { compact: true };
<SaudiMap3D {...props} />
```

### Architecture

- `SaudiMap3D.tsx` — thin wrapper: `<ClientOnly>` + `React.lazy` + `<Suspense>` placeholder. Safe to import from any route or server file.
- `SaudiMap3DScene.tsx` — the actual `<Canvas>` scene (three.js, OrbitControls, city markers, network arcs). Loaded on the client only, split into its own chunk so `three` never enters the Nitro/SSR bundle.
- `saudi-map.types.ts` — shared `SaudiMap3DProps` interface consumed by both.

### Behavior

- Respects `prefers-reduced-motion` — disables auto-rotate, pulsing markers, and animated network packets.
- Mobile-friendly: `touch-action: none`, pinch-to-zoom, drag-to-rotate.
- Emits an SSR-safe placeholder (radial-gradient panel at the correct height) until the client chunk hydrates — no layout shift.
