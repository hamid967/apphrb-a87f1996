import { Loader2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

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
 * Shared header for every /admin/* section.
 * Renders h1 + optional subtitle above any data-loading state so the page
 * always shows a text title alongside the sidebar breadcrumb, even while
 * queries are in flight.
 */
export function AdminPageHeader({
  ar,
  en,
  descriptionAr,
  descriptionEn,
  icon: Icon,
  actions,
  className,
}: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const title = isAr ? ar : en;
  const desc = isAr ? descriptionAr : descriptionEn;
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-border/40 pb-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-semibold tracking-tight">
          {Icon && <Icon className="size-5 sm:size-6 text-primary shrink-0" aria-hidden />}
          <span className="truncate">{title}</span>
        </h1>
        {desc && <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * Convenience wrapper that pairs the header with a centered spinner.
 * Use in place of the bare `<Loader2 />` early-return so the h1 is present
 * during the initial data fetch.
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
