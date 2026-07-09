import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Thin adapter over the unified <PageHeader />. Kept for backwards
 * compatibility across every /portal/* route. Prefer importing
 * `PageHeader` directly in new code.
 */
export function PortalPageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      description={subtitle}
      icon={icon}
      actions={actions}
    />
  );
}
