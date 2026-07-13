import { AlertTriangle, Loader2, Radio, RefreshCcw, RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RealtimeStatus } from "@/hooks/use-auctions-realtime";

const CONFIG: Record<
  RealtimeStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
    icon: typeof Radio;
    spin?: boolean;
    pulse?: boolean;
  }
> = {
  connected: {
    label: "متصل مباشر",
    variant: "outline",
    className: "border-success/40 bg-success/10 text-success dark:text-success",
    icon: Radio,
    pulse: true,
  },
  connecting: {
    label: "جارٍ الاتصال…",
    variant: "outline",
    className: "border-muted-foreground/30 text-muted-foreground",
    icon: Loader2,
    spin: true,
  },
  reconnecting: {
    label: "منقطع — إعادة الاتصال…",
    variant: "outline",
    className: "border-warning/40 bg-warning/10 text-warning dark:text-warning",
    icon: Loader2,
    spin: true,
  },
  disabled: {
    label: "غير مفعّل",
    variant: "outline",
    className: "border-muted-foreground/20 text-muted-foreground/70",
    icon: WifiOff,
  },
  failed: {
    label: "فشل الاتصال — التحديثات موقوفة",
    variant: "outline",
    className: "border-destructive/50 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
};

export function RealtimeStatusBadge({
  status,
  className,
  hideWhenDisabled = true,
  onRetry,
  pollingMs,
}: {
  status: RealtimeStatus;
  className?: string;
  hideWhenDisabled?: boolean;
  onRetry?: () => void;
  /**
   * Polling fallback interval in ms (from `pollingIntervalFor(status)`).
   * When truthy AND `status !== "connected"`, the badge renders a
   * secondary "polling" chip so users know updates are still flowing.
   */
  pollingMs?: number | false | null;
}) {
  if (hideWhenDisabled && status === "disabled") return null;
  const cfg = CONFIG[status];
  const Icon = cfg.icon;
  const isPolling = status !== "connected" && typeof pollingMs === "number" && pollingMs > 0;
  const seconds = isPolling ? Math.max(1, Math.round((pollingMs as number) / 1000)) : 0;
  return (
    <div className="inline-flex items-center gap-1.5">
      <Badge
        variant={cfg.variant}
        className={cn("gap-1.5 font-normal", cfg.className, className)}
        title={cfg.label}
        aria-live="polite"
      >
        <Icon className={cn("size-3", cfg.spin && "animate-spin", cfg.pulse && "animate-pulse")} />
        <span className="text-xs">{cfg.label}</span>
      </Badge>
      {isPolling && (
        <Badge
          variant="outline"
          className="gap-1 border-info/40 bg-info/10 text-info dark:text-info font-normal"
          title={`يتم جلب البيانات دوريًا كل ${seconds} ثانية`}
          aria-live="polite"
        >
          <RefreshCcw className="size-3 animate-spin [animation-duration:2.5s]" />
          <span className="text-xs tabular-nums">تحديث دوري · {seconds}ث</span>
        </Badge>
      )}
      {status === "failed" && onRetry && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs text-destructive hover:text-destructive"
          onClick={onRetry}
        >
          <RefreshCw className="size-3" /> إعادة المحاولة
        </Button>
      )}
    </div>
  );
}
