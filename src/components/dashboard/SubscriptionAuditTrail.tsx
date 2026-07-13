import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, AlertTriangle, Info, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { getMySubscriptionAuditTrail } from "@/lib/subscription-audit.functions";
import { Button } from "@/components/ui/button";

type Entry = {
  id: string;
  action: string;
  created_at: string;
  diff: unknown;
};

function iconFor(action: string) {
  if (action.endsWith(".success") || action.endsWith(".subscription_created")) {
    return { icon: <CheckCircle2 className="size-4" />, tone: "text-emerald-500" };
  }
  if (action.endsWith(".failed") || action.endsWith(".exception")) {
    return { icon: <XCircle className="size-4" />, tone: "text-rose-500" };
  }
  if (action.endsWith(".no_package") || action.endsWith(".subscription_exists")) {
    return { icon: <AlertTriangle className="size-4" />, tone: "text-amber-500" };
  }
  return { icon: <Info className="size-4" />, tone: "text-sky-500" };
}

export function SubscriptionAuditTrail({ isAr }: { isAr: boolean }) {
  const [open, setOpen] = useState(false);
  const fetchTrail = useServerFn(getMySubscriptionAuditTrail);
  const q = useQuery({
    queryKey: ["my-subscription-audit-trail"],
    queryFn: () => fetchTrail(),
    enabled: open,
    staleTime: 30_000,
  });

  const t = (ar: string, en: string) => (isAr ? ar : en);
  const fmt = new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-start"
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-semibold">
            {t("سجل تفعيل الاشتراك", "Subscription activation log")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "تتبَّع كل عملية تفعيل بمعرّف فريد وحالة النجاح/الفشل.",
              "Trace every activation attempt with a unique ID and success/failure detail.",
            )}
          </p>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {q.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("جارٍ التحميل…", "Loading…")}
            </div>
          )}
          {q.error && (
            <div className="text-sm text-rose-500">
              {t("تعذّر تحميل السجل", "Failed to load log")}
              <Button
                variant="ghost"
                size="sm"
                className="ms-2"
                onClick={() => q.refetch()}
              >
                {t("إعادة المحاولة", "Retry")}
              </Button>
            </div>
          )}
          {q.data?.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {t("لا توجد أحداث بعد.", "No events yet.")}
            </div>
          )}
          <ul className="space-y-2">
            {(q.data ?? []).map((entry: Entry) => {
              const meta = iconFor(entry.action);
              const diff = (entry.diff ?? {}) as Record<string, unknown>;
              const eventId = (diff.event_id as string | undefined) ?? entry.id;
              return (
                <li
                  key={entry.id}
                  className="rounded-lg border border-border/50 bg-background/40 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={meta.tone} aria-hidden>{meta.icon}</span>
                    <span className="font-mono text-xs">{entry.action}</span>
                    <span className="ms-auto text-[11px] text-muted-foreground">
                      {fmt.format(new Date(entry.created_at))}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    <span className="font-semibold">
                      {t("مُعرّف الحدث:", "Event ID:")}
                    </span>{" "}
                    <code className="font-mono">{eventId}</code>
                  </div>
                  {Object.keys(diff).length > 0 && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed">
                      {JSON.stringify(diff, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
