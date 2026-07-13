import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNow } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import {
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Trash2,
  Lock,
  AlertTriangle,
  Ban,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { sectionHead } from "@/lib/section-og-head";
import {
  clearForbiddenLog,
  forbiddenReasonLabel,
  useForbiddenLog,
  type ForbiddenReason,
} from "@/lib/service-forbidden-log";
import { getHubService } from "@/lib/services-hub-catalog";
import { roleLabel } from "@/lib/service-roles";

export const Route = createFileRoute(
  "/_authenticated/dashboard/services/forbidden-log",
)({
  head: () =>
    sectionHead({
      section: "dashboard",
      entityAr: "سجل المحاولات المحجوبة",
      entityEn: "Forbidden attempts log",
      path: "/dashboard/services/forbidden-log",
    }),
  component: ForbiddenLogPage,
});

function reasonIcon(reason: ForbiddenReason) {
  switch (reason) {
    case "missing_role":
      return Lock;
    case "broken_link":
      return AlertTriangle;
    case "unavailable":
      return Ban;
    default:
      return ShieldAlert;
  }
}

function ForbiddenLogPage() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language ?? "ar").startsWith("ar");
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const dateLocale = isAr ? arLocale : enUS;
  const entries = useForbiddenLog();

  // Group by service id for a quick summary at the top.
  const summary = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.id, (map.get(e.id) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [entries]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="text-xs">
        <Link
          to="/dashboard/services"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary"
        >
          <Arrow className="size-3 rotate-180" />
          {isAr ? "كل الخدمات" : "All services"}
        </Link>
      </div>

      <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
              <History className="size-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {isAr ? "سجل المحاولات المحجوبة" : "Forbidden attempts log"}
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                {isAr
                  ? "كل محاولة فتحت فيها خدمة بدون صلاحية أو خدمة معطّلة، مع سبب الحجب والأدوار المطلوبة. السجل محلي على جهازك."
                  : "Every attempt where a restricted or unavailable service was opened, with the block reason and required roles. The log is local to this device."}
              </p>
            </div>
          </div>
          {entries.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => clearForbiddenLog()}
            >
              <Trash2 className="me-1.5 size-3.5" />
              {isAr ? "مسح السجل" : "Clear log"}
            </Button>
          )}
        </div>

        {summary.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {summary.map(([id, count]) => {
              const svc = getHubService(id);
              return (
                <Badge key={id} variant="secondary" className="gap-1.5">
                  <span className="font-semibold">
                    {svc ? (isAr ? svc.titleAr : svc.titleEn) : id}
                  </span>
                  <span className="text-muted-foreground">×{count}</span>
                </Badge>
              );
            })}
          </div>
        )}
      </section>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <ShieldAlert className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">
            {isAr ? "لا توجد محاولات محجوبة بعد" : "No forbidden attempts yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "أي محاولة مستقبلية لفتح خدمة بدون صلاحية ستظهر هنا."
              : "Any future attempt to open a restricted service will appear here."}
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, idx) => {
            const svc = getHubService(e.id);
            const Icon = reasonIcon(e.reason);
            const title = svc ? (isAr ? svc.titleAr : svc.titleEn) : e.id;
            return (
              <li
                key={`${e.id}-${e.ts}-${idx}`}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-foreground">
                        {title}
                      </h2>
                      <Badge variant="destructive" className="text-[10px]">
                        {forbiddenReasonLabel(e.reason, isAr)}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {e.source === "hub"
                          ? isAr ? "من المركز" : "From hub"
                          : e.source === "detail"
                            ? isAr ? "صفحة التفاصيل" : "Detail page"
                            : isAr ? "رابط مباشر" : "Direct link"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <time dateTime={new Date(e.ts).toISOString()}>
                        {formatDistanceToNow(new Date(e.ts), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </time>
                      <span className="mx-2 opacity-40">•</span>
                      {format(new Date(e.ts), "PPpp", { locale: dateLocale })}
                    </p>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-background/60 p-2.5">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {isAr ? "الأدوار المطلوبة" : "Required roles"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {e.requiredRoles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            e.requiredRoles.map((r) => (
                              <Badge
                                key={r}
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {roleLabel(r, isAr)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-background/60 p-2.5">
                        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                          {isAr ? "أدوارك وقتها" : "Your roles then"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {e.userRoles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {isAr ? "بدون أدوار" : "No roles"}
                            </span>
                          ) : (
                            e.userRoles.map((r) => (
                              <Badge
                                key={r}
                                variant="outline"
                                className="h-5 px-1.5 text-[10px]"
                              >
                                {roleLabel(r, isAr)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {e.note && (
                      <p className="mt-2 rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        {e.note}
                      </p>
                    )}

                    {svc && (
                      <div className="mt-3">
                        <Link
                          to="/dashboard/services/$key"
                          params={{ key: svc.id }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          {isAr ? "فتح صفحة الخدمة" : "Open service page"}
                          <Arrow className="size-3 rotate-180" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
