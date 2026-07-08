import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { usePermissions, type ScopeFilter } from "@/hooks/use-permissions";
import { AccessDenied } from "./AccessDenied";

type Props = {
  /** Single permission code required. */
  permission?: string;
  /** Any of these codes grants access. */
  anyOf?: string[];
  /** All of these codes required. */
  allOf?: string[];
  /** Optional scope filter. */
  scope?: ScopeFilter;
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
  description?: string;
};

/**
 * Route-level guard based on RBAC permissions.
 * Owners/admins bypass via `usePermissions().isSuper`. Server-side RLS
 * still enforces authoritatively — this only avoids rendering the UI.
 */
export function RequirePermission({
  permission,
  anyOf,
  allOf,
  scope,
  children,
  fallback,
  title,
  description,
}: Props) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  let allowed = permission ? can(permission, scope) : true;
  if (anyOf?.length) allowed = allowed && anyOf.some((c) => can(c, scope));
  if (allOf?.length) allowed = allowed && allOf.every((c) => can(c, scope));

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    const required = permission ?? anyOf?.join(" | ") ?? allOf?.join(" & ");
    return (
      <AccessDenied
        title={title}
        reason={description}
        requiredPermission={required}
        scopeLabel={
          scope?.company
            ? `company:${scope.company}`
            : scope?.branch
              ? `branch:${scope.branch}`
              : scope?.department
                ? `department:${scope.department}`
                : undefined
        }
      />
    );
  }

  return <>{children}</>;
}
