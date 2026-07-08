import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { ADMIN_ROLES } from "@/lib/permissions";

export type ScopeType = "global" | "company" | "branch" | "department";

export type MyPermission = {
  code: string;
  scope_type: ScopeType;
  company_id: string | null;
  branch_id: string | null;
  department_id: string | null;
};

export type ScopeFilter = {
  company?: string | null;
  branch?: string | null;
  department?: string | null;
};

/**
 * Loads the current user's permissions for the active org via `my_permissions` RPC.
 * Admin/owner org roles are treated as super-users (all permissions granted).
 */
export function usePermissions() {
  const { orgId, role, ready } = useCurrentOrg();
  const isSuper = !!role && (ADMIN_ROLES as readonly string[]).includes(role);

  const q = useQuery({
    queryKey: ["my_permissions", orgId],
    enabled: !!orgId && ready && !isSuper,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_permissions", { _org: orgId! });
      if (error) throw error;
      return (data ?? []) as MyPermission[];
    },
  });

  const permissions = q.data ?? [];

  function can(code: string, scope?: ScopeFilter): boolean {
    if (isSuper) return true;
    return permissions.some((p) => {
      if (p.code !== code) return false;
      if (p.scope_type === "global") return true;
      if (p.scope_type === "company") return !scope?.company || p.company_id === scope.company;
      if (p.scope_type === "branch") return !scope?.branch || p.branch_id === scope.branch;
      if (p.scope_type === "department")
        return !scope?.department || p.department_id === scope.department;
      return false;
    });
  }

  return {
    loading: !isSuper && (q.isLoading || !ready),
    isSuper,
    permissions,
    can,
  };
}
