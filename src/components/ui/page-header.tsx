import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Props = {
  /** Arabic title */
  ar?: string;
  /** English title */
  en?: string;
  /** Direct title (overrides ar/en) */
  title?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  description?: string;
  icon?: LucideIcon | ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Unified page header used across dashboard / admin / portal.
 * - Mobile-safe: grid col with min-w-0 + truncate.
 * - i18n-aware: pass ar/en or a direct title.
 * - Consistent visual weight: h1, primary icon badge, muted description.
 */
export function PageHeader({
  ar,
  en,
  title,
  descriptionAr,
  descriptionEn,
  description,
  icon,
  actions,
  className,
}: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const resolvedTitle = title ?? (isAr ? ar : en) ?? ar ?? en ?? "";
  const resolvedDesc = description ?? (isAr ? descriptionAr : descriptionEn);

  // Support either a LucideIcon component or an already-rendered node.
  const iconNode =
    typeof icon === "function"
      ? (() => {
          const Icon = icon as LucideIcon;
          return <Icon className="size-5" aria-hidden />;
        })()
      : icon;

  return (
    <header
      className={cn(
        "mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/40 pb-4 sm:mb-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {iconNode && (
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
            {iconNode}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
            {resolvedTitle}
          </h1>
          {resolvedDesc && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
              {resolvedDesc}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
