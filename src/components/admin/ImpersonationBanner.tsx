import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImpersonation } from "@/hooks/use-impersonation";
import { endImpersonation } from "@/lib/impersonation.functions";

export function ImpersonationBanner() {
  const { state, set } = useImpersonation();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const endingRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!state || endingRef.current) return;
    const exp = new Date(state.expires_at).getTime();
    if (now >= exp) {
      endingRef.current = true;
      (async () => {
        try {
          await endImpersonation({
            data: { session_id: state.session_id, targetUserId: state.target.id },
          });
        } catch {
          /* audit-only, still clear locally */
        } finally {
          set(null);
          toast.warning("Impersonation timed out");
          endingRef.current = false;
        }
      })();
    }
  }, [now, state, set]);

  if (!state) return null;

  async function stop() {
    setBusy(true);
    try {
      await endImpersonation({
        data: { session_id: state!.session_id, targetUserId: state!.target.id },
      });
      set(null);
      toast.success("Impersonation ended");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to end");
    } finally {
      setBusy(false);
    }
  }

  const remainingMs = Math.max(0, new Date(state.expires_at).getTime() - now);
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000)
    .toString()
    .padStart(2, "0");

  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 border-b border-warning/40 bg-warning/15 px-4 py-2 text-xs text-warning dark:text-warning">
      <ShieldAlert className="size-4 shrink-0" />
      <span className="truncate">
        Viewing as{" "}
        <b>{state.target.full_name ?? state.target.email ?? state.target.id.slice(0, 8)}</b>
        <span className="ml-2 text-warning/70 dark:text-warning/70">
          since {new Date(state.started_at).toLocaleTimeString()}
        </span>
        <span className="ml-2 tabular-nums">
          · auto-end in {mm}:{ss}
        </span>
      </span>
      <Button size="sm" variant="outline" onClick={stop} disabled={busy} className="ml-auto h-7">
        {busy ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />} End session
      </Button>
    </div>
  );
}
