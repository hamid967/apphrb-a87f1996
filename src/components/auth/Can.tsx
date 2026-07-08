import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { usePermissions, type ScopeFilter } from "@/hooks/use-permissions";

type Props = {
  /** Permission code from `rbac_permissions.code`, e.g. "export.csv" */
  permission: string;
  /** Optional multiple codes — pass with `mode` to require any/all. */
  anyOf?: string[];
  allOf?: string[];
  /** Scope filter — restrict to a specific company/branch/department. */
  scope?: ScopeFilter;
  /** Rendered when the check passes. */
  children: ReactNode;
  /** Rendered when the check fails. Default: null. */
  fallback?: ReactNode;
  /** Show a small spinner while permissions load. Default: true. */
  showLoading?: boolean;
};

/**
 * Client-side UI guard for permission + scope.
 * Hides children when the current user lacks the permission for the given scope.
 * Server-side enforcement (RLS + `has_permission()` in server fns) is still required.
 */
export function Can({
  permission,
  anyOf,
  allOf,
  scope,
  children,
  fallback = null,
  showLoading = true,
}: Props) {
  const { can, loading } = usePermissions();

  if (loading) {
    return showLoading ? (
      <span className="inline-flex items-center text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    ) : null;
  }

  let allowed = can(permission, scope);
  if (anyOf?.length) allowed = allowed || anyOf.some((c) => can(c, scope));
  if (allOf?.length) allowed = allowed && allOf.every((c) => can(c, scope));

  return <>{allowed ? children : fallback}</>;
}
