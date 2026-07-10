import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { MotionPreferenceProvider } from "@/components/motion-preference";
import { supabase } from "@/integrations/supabase/client";

import appCss from "../styles.css?url";
import i18n, { applyDirection, hydrateClientLanguage } from "@/lib/i18n";
import { registerServiceWorker } from "@/lib/register-sw";
import { OfflineIndicator } from "@/components/offline-indicator";
import { ThemeProvider } from "@/components/theme-provider";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { FilterAnalyticsFlusher } from "@/components/analytics/FilterAnalyticsFlusher";
import { FilterAnalyticsDebugPanel } from "@/components/analytics/FilterAnalyticsDebugPanel";
import { CommandPalette } from "@/components/command-palette";

function NotFoundComponent() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  return (
    <main
      dir={isAr ? "rtl" : "ltr"}
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-primary">HBSpro</p>
        <h1 className="mt-2 text-7xl font-semibold tracking-tight text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-medium">
          {isAr ? "الصفحة غير موجودة" : "Page not found"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAr
            ? "قد يكون الرابط غير صحيح أو نُقلت الصفحة إلى مسار جديد."
            : "The link may be incorrect, or the page may have moved."}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          {isAr ? "العودة إلى الرئيسية" : "Go home"}
        </Link>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  return (
    <main
      dir={isAr ? "rtl" : "ltr"}
      role="alert"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-primary">HBSpro</p>
        <h1 className="mt-3 text-2xl font-semibold">
          {isAr ? "تعذّر إكمال الطلب" : "We couldn't complete that request"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAr
            ? "حدث خطأ غير متوقع. يمكنك إعادة المحاولة، وإذا استمر الخطأ فتواصل مع الدعم."
            : "An unexpected error occurred. Try again, and contact support if it continues."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            {isAr ? "إعادة المحاولة" : "Try again"}
          </button>
          <Link
            to="/"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium"
          >
            {isAr ? "الرئيسية" : "Home"}
          </Link>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#2563EB" },
      // PWA / iOS home-screen
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "HBSpro" },
      { name: "application-name", content: "HBSpro" },
      { name: "format-detection", content: "telephone=no" },
      { title: "HBSpro — إدارة عقارات بالذكاء الاصطناعي" },
      {
        name: "description",
        content:
          "عقاري من HBSpro — نظام التشغيل الذكي لقطاع العقارات السعودي: عقارات، عقود، مستأجرون، محاسبة، وذكاء اصطناعي في منصة سحابية واحدة.",
      },
      { property: "og:title", content: "HBSpro — إدارة عقارات بالذكاء الاصطناعي" },
      { name: "twitter:title", content: "HBSpro — إدارة عقارات بالذكاء الاصطناعي" },
      {
        property: "og:description",
        content:
          "عقاري من HBSpro — نظام التشغيل الذكي لقطاع العقارات السعودي: عقارات، عقود، مستأجرون، محاسبة، وذكاء اصطناعي في منصة سحابية واحدة.",
      },
      {
        name: "twitter:description",
        content:
          "عقاري من HBSpro — نظام التشغيل الذكي لقطاع العقارات السعودي: عقارات، عقود، مستأجرون، محاسبة، وذكاء اصطناعي في منصة سحابية واحدة.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { name: "google-site-verification", content: "vKIb1ucLPoJXIOgTnQWbD22HsBcHVPd_CF0hsWKZpKI" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/aff05cce-c377-413e-bb68-ddcfed90d484" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/aff05cce-c377-413e-bb68-ddcfed90d484" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://iefrhjjlftbijuedxmbl.supabase.co", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://iefrhjjlftbijuedxmbl.supabase.co" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=DM+Serif+Display&family=Fira+Sans:wght@400;500;600;700&family=Tajawal:wght@400;500;700;900&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "HBSpro",
          url: "https://hrhbs.com",
          logo: "https://hrhbs.com/icon-512.png",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "HBSpro",
          url: "https://hrhbs.com",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthBridge() {
  const router = useRouter();
  const qc = useQueryClient();
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        lastUserId.current = data.session?.user?.id ?? null;
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;

      const nextUserId = session?.user?.id ?? null;
      const userChanged = lastUserId.current !== nextUserId;
      lastUserId.current = nextUserId;

      if (event === "SIGNED_OUT") {
        qc.clear();
        router.invalidate();
        return;
      }

      if (event === "SIGNED_IN" && !userChanged) return;
      if (event !== "SIGNED_IN" && event !== "USER_UPDATED" && event !== "PASSWORD_RECOVERY")
        return;

      router.invalidate();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, qc]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Load persisted language after hydration to avoid SSR/client mismatch.
    hydrateClientLanguage();
    applyDirection(i18n.language || "en");
    // Register PWA service worker (guarded — no-op in preview/dev/iframe).
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const setAppHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? 0;
      const nextHeight = Math.max(
        window.innerHeight,
        viewportHeight,
        document.documentElement.clientHeight,
      );
      document.documentElement.style.setProperty("--app-height", `${nextHeight}px`);
    };

    setAppHeight();
    const raf = window.requestAnimationFrame(setAppHeight);
    window.addEventListener("resize", setAppHeight);
    window.addEventListener("orientationchange", setAppHeight);
    window.addEventListener("pageshow", setAppHeight);
    window.visualViewport?.addEventListener("resize", setAppHeight);
    window.visualViewport?.addEventListener("scroll", setAppHeight);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", setAppHeight);
      window.removeEventListener("orientationchange", setAppHeight);
      window.removeEventListener("pageshow", setAppHeight);
      window.visualViewport?.removeEventListener("resize", setAppHeight);
      window.visualViewport?.removeEventListener("scroll", setAppHeight);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionPreferenceProvider>
          <AuthBridge />
          <ImpersonationBanner />
          <OfflineIndicator />
          <FilterAnalyticsFlusher />
          <FilterAnalyticsDebugPanel />
          <CommandPalette />
          <Outlet />
          <Toaster
            position="top-center"
            closeButton
            swipeDirections={["left", "right", "top"]}
            offset={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
            mobileOffset={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
            toastOptions={{
              unstyled: true,
              classNames: {
                toast: "ei-toast",
                title: "ei-toast-title",
                description: "ei-toast-desc",
                icon: "ei-toast-icon",
                closeButton: "ei-toast-close",
                loading: "ei-toast-loading",
                success: "ei-toast-success",
                error: "ei-toast-error",
              },
            }}
          />
        </MotionPreferenceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
