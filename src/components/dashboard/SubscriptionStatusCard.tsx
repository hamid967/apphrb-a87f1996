import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, AlertTriangle, XCircle, Clock, Loader2 } from "lucide-react";
import { getMyAccessContext } from "@/lib/company.functions";
import { Button } from "@/components/ui/button";

type AccessState =
  | "active"
  | "grace"
  | "expired"
  | "pending"
  | "rejected"
  | "no_profile"
  | "anonymous";

type Access = {
  state: AccessState;
  trial_ends_at?: string | null;
  subscription_end_date?: string | null;
  grace_ends_at?: string | null;
  grace_days_remaining?: number | null;
  days_remaining?: number | null;
  warning?: string | null;
  reason?: string | null;
};

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function SubscriptionStatusCard({ isAr }: { isAr: boolean }) {
  const fetchCtx = useServerFn(getMyAccessContext);
  const q = useQuery({
    queryKey: ["my-access-context"],
    queryFn: () => fetchCtx(),
    staleTime: 60_000,
  });

  const t = (ar: string, en: string) => (isAr ? ar : en);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("جارٍ التحقق من حالة الاشتراك…", "Checking subscription status…")}
      </div>
    );
  }

  const access = (q.data?.access ?? { state: "no_profile" }) as Access;
  const trialEnds = access.trial_ends_at ? new Date(access.trial_ends_at) : null;
  const subEnds = access.subscription_end_date ? new Date(access.subscription_end_date) : null;
  const now = new Date();
  const trialDaysLeft = trialEnds ? Math.max(0, daysBetween(now, trialEnds)) : null;
  const subDaysLeft = subEnds ? Math.max(0, daysBetween(now, subEnds)) : null;
  const isTrial = !subEnds && !!trialEnds;

  // Choose visual style per state
  const style = (() => {
    switch (access.state) {
      case "active":
        return {
          icon: <CheckCircle2 className="size-5" />,
          badgeAr: "نشط",
          badgeEn: "Active",
          ring: "border-emerald-500/40",
          bg: "bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent",
          fg: "text-emerald-600 dark:text-emerald-400",
          dot: "bg-emerald-500",
        };
      case "grace":
        return {
          icon: <AlertTriangle className="size-5" />,
          badgeAr: "فترة سماح",
          badgeEn: "Grace period",
          ring: "border-amber-500/40",
          bg: "bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent",
          fg: "text-amber-600 dark:text-amber-400",
          dot: "bg-amber-500",
        };
      case "expired":
        return {
          icon: <XCircle className="size-5" />,
          badgeAr: "منتهي",
          badgeEn: "Expired",
          ring: "border-rose-500/40",
          bg: "bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent",
          fg: "text-rose-600 dark:text-rose-400",
          dot: "bg-rose-500",
        };
      case "pending":
        return {
          icon: <Clock className="size-5" />,
          badgeAr: "بانتظار الموافقة",
          badgeEn: "Pending approval",
          ring: "border-sky-500/40",
          bg: "bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent",
          fg: "text-sky-600 dark:text-sky-400",
          dot: "bg-sky-500",
        };
      default:
        return {
          icon: <AlertTriangle className="size-5" />,
          badgeAr: "غير مُفعّل",
          badgeEn: "Not activated",
          ring: "border-slate-500/40",
          bg: "bg-gradient-to-br from-slate-500/10 via-slate-500/5 to-transparent",
          fg: "text-slate-500",
          dot: "bg-slate-400",
        };
    }
  })();

  const remainingLabel = (() => {
    if (access.state === "grace" && access.grace_days_remaining != null) {
      return t(
        `متبقٍّ ${access.grace_days_remaining} يوم في فترة السماح`,
        `${access.grace_days_remaining} day(s) left in grace`,
      );
    }
    if (access.state === "expired") {
      return t("انتهت صلاحية الوصول", "Access has expired");
    }
    if (isTrial && trialDaysLeft != null) {
      return t(`متبقٍّ ${trialDaysLeft} يوم من التجربة`, `${trialDaysLeft} trial day(s) left`);
    }
    if (subDaysLeft != null) {
      return t(`متبقٍّ ${subDaysLeft} يوم في الاشتراك`, `${subDaysLeft} day(s) left in plan`);
    }
    return t("الوصول متاح", "Access enabled");
  })();

  const endsLabel = (() => {
    const d = subEnds ?? trialEnds;
    if (!d) return null;
    const fmt = new Intl.DateTimeFormat(isAr ? "ar-SA" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
    return isTrial
      ? t(`تنتهي التجربة في ${fmt}`, `Trial ends ${fmt}`)
      : t(`تنتهي في ${fmt}`, `Ends ${fmt}`);
  })();

  // Progress bar (trial only, 7-day baseline)
  const trialBaseline = 7;
  const trialPct =
    isTrial && trialDaysLeft != null
      ? Math.max(6, Math.min(100, Math.round((trialDaysLeft / trialBaseline) * 100)))
      : null;

  return (
    <div
      className={`rounded-2xl border ${style.ring} ${style.bg} p-4 sm:p-5`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-10 place-items-center rounded-xl bg-background/70 shadow-sm ${style.fg}`}
            aria-hidden
          >
            {style.icon}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${style.dot} animate-pulse`} />
              <h3 className="text-sm font-semibold">
                {t("حالة الاشتراك", "Subscription status")}
              </h3>
              <span
                className={`rounded-full border ${style.ring} px-2 py-0.5 text-[11px] font-bold ${style.fg}`}
              >
                {isAr ? style.badgeAr : style.badgeEn}
              </span>
              {isTrial && access.state === "active" && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  {t("تجربة مجانية", "Free trial")}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium">{remainingLabel}</p>
            {endsLabel && (
              <p className="mt-0.5 text-xs text-muted-foreground">{endsLabel}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {(access.state === "expired" || access.state === "grace" || isTrial) && (
            <Button asChild size="sm" variant={access.state === "expired" ? "default" : "outline"}>
              <Link to="/dashboard/settings/billing">
                {access.state === "expired"
                  ? t("جدّد الآن", "Renew now")
                  : t("إدارة الاشتراك", "Manage plan")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {trialPct != null && (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
              style={{ width: `${trialPct}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{t("بداية التجربة", "Trial start")}</span>
            <span>{t(`${trialDaysLeft}/7 يوم`, `${trialDaysLeft}/7 days`)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
