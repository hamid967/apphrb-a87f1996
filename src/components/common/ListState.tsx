import { t } from "@/lib/i18n";
import type { ReactNode } from "react";
import { AlertCircle, Loader2, ShieldAlert, Inbox } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Renders the four canonical list states for a React Query result:
 *   loading → error → unauthorized (403/forbidden) → empty → children.
 *
 * Errors whose message contains "forbidden" / "unauthorized" / "401" / "403"
 * are rendered as the unauthorized variant instead of a generic error.
 */
export interface ListStateProps {
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string | null;
  isEmpty?: boolean;
  emptyText?: ReactNode;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  className?: string;
  loadingRows?: number;
  children?: ReactNode;
}

function isUnauthorized(msg?: string | null): boolean {
  if (!msg) return false;
  const s = msg.toLowerCase();
  return (
    s.includes("forbidden") ||
    s.includes("unauthorized") ||
    s.includes("permission") ||
    s.includes("403") ||
    s.includes("401")
  );
}

export function ListState({
  isLoading,
  isError,
  errorMessage,
  isEmpty,
  emptyText,
  emptyAction,
  onRetry,
  className,
  children,
}: ListStateProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div
        className={`grid place-items-center p-16 text-muted-foreground ${className ?? ""}`}
        role="status"
        aria-live="polite"
        aria-label={t("common.loading")}
      >
        <Loader2 className="size-5 animate-spin" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  if (isError) {
    if (isUnauthorized(errorMessage)) {
      return (
        <Card className={className}>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ShieldAlert className="size-8 text-amber-500" aria-hidden />
            <div>
              <div className="font-medium">{t("common.unauthorizedTitle")}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("common.unauthorizedDesc")}
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle className="size-8 text-destructive" aria-hidden />
          <div>
            <div className="font-medium">{t("common.errLoadTitle")}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {errorMessage || t("common.errLoadDesc")}
            </p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("common.retry")}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isEmpty) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <Inbox className="size-8 opacity-60" aria-hidden />
          <div className="text-sm">{emptyText ?? t("common.emptyTitle")}</div>
          {emptyAction}
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
