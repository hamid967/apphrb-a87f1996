import { Loader2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";

type Props = {
  ar: string;
  en: string;
  descriptionAr?: string;
  descriptionEn?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
};

/**
 * Thin adapter over the unified <PageHeader />. Kept for backwards
 * compatibility across every /admin/* route. Prefer importing
 * `PageHeader` directly in new code.
 */
export function AdminPageHeader(props: Props) {
  return <PageHeader {...props} />;
}

/**
 * Header + centered spinner. Used in place of the bare `<Loader2 />`
 * early-return so the h1 stays visible during initial data fetch.
 */
export function AdminPageLoading(props: Omit<Props, "actions">) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6">
      <AdminPageHeader {...props} />
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 py-16 text-muted-foreground"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="text-sm">{isAr ? "جاري التحميل…" : "Loading…"}</span>
      </div>
    </div>
  );
}
