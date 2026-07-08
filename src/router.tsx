import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep data feeling live: refetch in the background whenever a
        // screen mounts or the PWA/tab regains focus. staleTime is short
        // so cross-user updates (e.g. an approver seeing a freshly
        // submitted expense) appear instantly without a manual reload.
        staleTime: 5_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchOnReconnect: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Wrap every client-side navigation in document.startViewTransition
    // when the browser supports it. Falls back to instant nav elsewhere.
    defaultViewTransition: true,
    defaultPreload: "intent",
  });

  return router;
};
