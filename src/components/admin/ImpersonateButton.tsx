import { useState } from "react";
import { toast } from "sonner";
import { UserCog, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { startImpersonation } from "@/lib/impersonation.functions";
import { useImpersonation } from "@/hooks/use-impersonation";

export function ImpersonateButton({ isAr }: { isAr: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const { set, state } = useImpersonation();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await startImpersonation({
        data: {
          targetEmail: email || undefined,
          targetUserId: userId || undefined,
          reason: reason || undefined,
        },
      });
      const now = Date.now();
      const mins = Math.min(Math.max(Number(minutes) || 30, 1), 240);
      set({
        session_id: res.session_id,
        target: res.target,
        started_at: new Date(now).toISOString(),
        expires_at: new Date(now + mins * 60_000).toISOString(),
      });
      toast.success(isAr ? "بدأت جلسة الانتحال" : "Impersonation started");
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!!state}
          title={
            state ? (isAr ? "أنهِ الجلسة الحالية أولاً" : "End current session first") : undefined
          }
        >
          <UserCog className="size-4" />{" "}
          <span className="hidden sm:inline">{isAr ? "انتحال هوية" : "Impersonate"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAr ? "بدء جلسة انتحال" : "Start impersonation"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1">
            <Label>{isAr ? "بريد المستخدم" : "User email"}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="text-center text-xs text-muted-foreground">{isAr ? "أو" : "or"}</div>
          <div className="grid gap-1">
            <Label>{isAr ? "معرّف المستخدم" : "User ID"}</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" />
          </div>
          <div className="grid gap-1">
            <Label>{isAr ? "السبب (يُسجَّل في التدقيق)" : "Reason (audited)"}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isAr ? "دعم فني، فحص خطأ…" : "Support, bug repro…"}
              required
            />
          </div>
          <div className="grid gap-1">
            <Label>
              {isAr ? "مدة الجلسة (دقائق، حد أقصى 240)" : "Session timeout (minutes, max 240)"}
            </Label>
            <Input
              type="number"
              min={1}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || (!email && !userId) || !reason}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <UserCog className="size-4" />}
              {isAr ? "ابدأ" : "Start"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
