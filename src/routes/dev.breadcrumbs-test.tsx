import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { SmartBreadcrumbs, type SmartCrumb } from "@/components/breadcrumbs/SmartBreadcrumbs";

/**
 * Public, auth-free harness that renders SmartBreadcrumbs with fixture data
 * so the Playwright a11y spec (`breadcrumb-a11y-rtl.spec.py`) can execute in
 * CI without a seeded tenant session.
 *
 * Query params:
 *   ?depth=1|2|3   how many crumbs to render (default 3)
 *   ?lang=ar|en    forces i18n language (defaults to Arabic → RTL)
 *
 * Marked `noindex` — this is a diagnostic harness, not user-facing content.
 * It reads no data and mounts no auth, so keeping it enabled in production
 * has no side effects beyond a hidden test URL.
 */

type Search = { depth?: number; lang?: "ar" | "en" };

export const Route = createFileRoute("/dev/breadcrumbs-test")({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): Search => {
    const d = Number(raw.depth);
    const lang = raw.lang === "en" ? "en" : raw.lang === "ar" ? "ar" : undefined;
    return {
      depth: Number.isFinite(d) && d >= 1 && d <= 3 ? (d as 1 | 2 | 3) : undefined,
      lang,
    };
  },
  head: () => ({
    meta: [
      { title: "Breadcrumb harness — Aqari" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BreadcrumbsHarness,
});

const FIXTURES: Record<1 | 2 | 3, SmartCrumb[]> = {
  1: [{ href: "/dev/breadcrumbs-test", label: "الرئيسية" }],
  2: [
    { href: "/dev/breadcrumbs-test", label: "الرئيسية" },
    { href: "/dev/breadcrumbs-test?depth=2", label: "القسم" },
  ],
  3: [
    { href: "/dev/breadcrumbs-test", label: "الرئيسية" },
    { href: "/dev/breadcrumbs-test?depth=2", label: "القسم" },
    { href: "/dev/breadcrumbs-test?depth=3", label: "التفصيل" },
  ],
};

function BreadcrumbsHarness() {
  const search = useSearch({ from: "/dev/breadcrumbs-test" }) as Search;
  const depth = (search.depth ?? 3) as 1 | 2 | 3;
  const lang = search.lang ?? "ar";
  const dir = lang === "ar" ? "rtl" : "ltr";

  // Force document direction so the spec's dir=rtl assertion holds regardless
  // of the persisted user language.
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }

  const crumbs = FIXTURES[depth];

  return (
    <main className="min-h-screen bg-background p-6" dir={dir}>
      <h1 className="mb-4 text-lg font-semibold">Breadcrumbs harness (depth {depth})</h1>
      <SmartBreadcrumbs
        layoutId="dev-harness"
        rootIcon={Home}
        rootLabel={{ ar: "الرئيسية", en: "Home" }}
        ariaHome={{ ar: "الانتقال إلى الرئيسية", en: "Go to home" }}
        crumbs={crumbs}
      />
      {/* Something focusable AFTER the breadcrumb so the Tab-order test
          can observe focus leaving the nav. */}
      <button type="button" className="mt-6 rounded border px-3 py-1">
        بعد المسار
      </button>
    </main>
  );
}
