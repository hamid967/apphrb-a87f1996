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
      // Focused coverage on the URL-building helper (guards email links,
      // OAuth callbacks, and post-login navigation inside the WebView).
      // auth.tsx is included in the report so uncovered branches of
      // safeRedirect/routeAfterLogin show up in the table, but thresholds
      // stay on app-url.ts — the rest of auth.tsx is JSX we don't unit-test.
      include: ["src/lib/app-url.ts", "src/routes/auth.tsx"],
      thresholds: {
        "src/lib/app-url.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
