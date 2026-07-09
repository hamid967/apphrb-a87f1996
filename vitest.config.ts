import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [
      ["**/*.test.tsx", "jsdom"],
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "lcov"],
      reportsDirectory: "coverage",
      // Focused coverage on the redirect + URL-building surface. These files
      // guard email links, OAuth callbacks, and post-login navigation inside
      // the WebView, so we hold them to 100% and fail CI on regressions.
      include: ["src/lib/app-url.ts", "src/routes/auth.tsx"],
      thresholds: {
        "src/lib/app-url.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/routes/auth.tsx": {
          // The route file is mostly JSX we don't unit-test; only safeRedirect
          // and routeAfterLogin are asserted. Function-level threshold locks in
          // that BOTH stay exercised.
          functions: 20,
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
