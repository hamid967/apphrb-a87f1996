// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";
import { imagetools } from "vite-imagetools";
import { loadEnv } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
// Load ALL env vars (no VITE_ prefix filter) into process.env so server routes
// can read secrets like SUPABASE_SERVICE_ROLE_KEY. Do NOT expose these to client.
const serverEnv = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

const ANALYZE = process.env.ANALYZE === "true";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    routeFileIgnorePattern: "\\.test\\.",
  },
  vite: {
    plugins: [
      imagetools(),
      ...(ANALYZE
        ? [
            visualizer({
              filename: "dist/bundle-stats.html",
              template: "treemap",
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : []),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        strategies: "generateSW",
        devOptions: { enabled: false },
        manifest: false,
        workbox: {
          navigateFallback: "/offline.html",
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          // Ensure the offline shell is always precached and available.
          additionalManifestEntries: [{ url: "/offline.html", revision: null }],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
          // Exclude heavy on-demand chunks and marketing imagery from the
          // service-worker precache. They still cache at runtime the first
          // time they load, so this only trims the offline install payload.
          globIgnores: [
            "**/vendor-three-*.js",
            "**/vendor-editor-*.js",
            "**/vendor-charts-*.js",
            "**/vendor-pdf-*.js",
            "**/xlsx-*.js",
            "**/jspdf*.js",
            "**/html2canvas*.js",
            "**/PhoneVerifyInput-*.js",
            "**/service-*.webp",
            "**/*-riyadh-*.jpg",
            "**/*-dammam-*.jpg",
            "**/*-jeddah-*.jpg",
          ],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "html-navigations",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
            {
              urlPattern: ({ url, sameOrigin }) => sameOrigin && /\.(?:js|css|woff2|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "static-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com" || url.origin === "https://fonts.googleapis.com",
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts" },
            },
          ],
        },
      }),
    ],
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            // React MUST be its own chunk loaded before Radix/TanStack. Otherwise
            // Radix modules that read `React.useLayoutEffect` at top-level can crash
            // with "Cannot read properties of undefined (reading 'useLayoutEffect')".
            if (
              /[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|react-is)[\\/]/.test(id)
            )
              return "vendor-react";
            if (id.includes("three") || id.includes("@react-three")) return "vendor-three";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-editor";
            if (id.includes("pdf-lib") || id.includes("@pdf-lib")) return "vendor-pdf";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("@tanstack")) return "vendor-tanstack";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("react-hook-form") || id.includes("zod") || id.includes("@hookform")) return "vendor-forms";
          },
        },
      },
    },
  },
});
