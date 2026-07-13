import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { AppRole } from "@/lib/service-roles";

/**
 * Reads the current signed-in user's roles from `public.user_roles`.
 *
 * - Returns `roles: []` while the query is still resolving.
 * - `isLoading` distinguishes "no roles" from "still loading".
 * - When there's no session, returns an empty list immediately (no query).
 * - Cached for 5 minutes; refetches on window focus.
 */
export function useMyRoles() {
  const { user, ready } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["my-user-roles", userId],
    enabled: ready && !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AppRole[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.role as AppRole)
        .filter((r): r is AppRole => typeof r === "string");
    },
  });

  return {
    roles: query.data ?? [],
    isLoading: (!ready) || (!!userId && query.isLoading),
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
