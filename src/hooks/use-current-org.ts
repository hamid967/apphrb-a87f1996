import { useQuery } from "@tanstack/react-query";
import { listMyOrganizations } from "@/lib/organizations.functions";
import type { OrgRole } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";

/**
 * Returns the current active organization + the signed-in user's role in it.
 * Source of truth: `organization_members` via `listMyOrganizations()`.
 * (Active org is currently the first membership — matches the sidebar.)
 */
export function useCurrentOrg() {
  const { user, ready } = useAuth();
  const q = useQuery({
    queryKey: ["my-organizations", user?.id],
    queryFn: () => listMyOrganizations(),
    staleTime: 60_000,
    enabled: ready && !!user,
  });
  const first = q.data?.[0];
  return {
    orgId: first?.org?.id as string | undefined,
    org: first?.org,
    role: (first?.role ?? undefined) as OrgRole | undefined,
    loading: !ready || (!!user && q.isLoading),
    ready: ready && (!user || !q.isLoading),
  };
}
