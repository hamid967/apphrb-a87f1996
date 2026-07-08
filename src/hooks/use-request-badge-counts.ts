import { useQuery } from "@tanstack/react-query";
import { getRequestBadgeCounts } from "@/lib/request-badge-counts.functions";
import { useCurrentOrg } from "./use-current-org";

export function useRequestBadgeCounts() {
  const { orgId } = useCurrentOrg();
  const q = useQuery({
    queryKey: ["request-badge-counts", orgId],
    queryFn: () => getRequestBadgeCounts({ data: { org_id: orgId! } }),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  return {
    myPendingRequests: q.data?.myPendingRequests ?? 0,
    approvalRequests: q.data?.approvalRequests ?? 0,
    isLoading: q.isLoading,
  };
}
