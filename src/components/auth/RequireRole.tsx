import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-current-org";
import type { OrgRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

type Props = {
  roles: OrgRole[];
  children: ReactNode;
  /** Optional custom fallback when the user lacks the required role. */
  fallback?: ReactNode;
  /** Optional title/description overrides for the default forbidden UI. */
  title?: string;
  description?: string;
};

/**
 * Client-side guard for sensitive screens (PII, finance, admin).
 * The server also enforces this via `requireOrgRole` + RLS — this component
 * just avoids rendering the UI (and issuing 403 requests) for unauthorized users.
 */
export function RequireRole({ roles, children, fallback, title, description }: Props) {
  const { role, loading } = useCurrentOrg();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!role || !roles.includes(role)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{title ?? "Access restricted"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {description ??
              "This area contains sensitive data (PII or financials) and is limited to administrators or authorized roles."}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
