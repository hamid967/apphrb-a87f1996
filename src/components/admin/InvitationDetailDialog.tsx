import { Copy, XCircle } from "lucide-react";
import { formatDistanceToNow, format, formatDistanceStrict } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { PortalInvitation, OnAskRevoke } from "./invitation-types";

interface Props {
  detail: PortalInvitation | null;
  name: string;
  origin: string;
  now: number;
  onClose: () => void;
  onCopy: (token: string) => void;
  onAskRevoke: OnAskRevoke;
}

const fmtDate = (d: string) => format(new Date(d), "yyyy-MM-dd HH:mm");

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
    <div className="text-muted-foreground">{label}</div>
    <div className="col-span-2 break-words">{value}</div>
  </div>
);

export function InvitationDetailDialog({
  detail,
  name,
  origin,
  now,
  onClose,
  onCopy,
  onAskRevoke,
}: Props) {
  const status = detail
    ? detail.accepted_at
      ? { label: "مقبولة", variant: "default" as const }
      : new Date(detail.expires_at).getTime() < now
        ? { label: "منتهية", variant: "destructive" as const }
        : { label: "بانتظار القبول", variant: "secondary" as const }
    : null;

  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تفاصيل الدعوة</DialogTitle>
        </DialogHeader>
        {detail &&
          status &&
          (() => {
            const isTenant = detail.kind === "tenant";
            const url = `${origin}/portal-invite/${detail.token}`;
            const durationMs =
              new Date(detail.expires_at).getTime() - new Date(detail.created_at).getTime();
            const totalDuration = formatDistanceStrict(0, durationMs, { unit: "day" });
            const remaining = detail.accepted_at
              ? null
              : new Date(detail.expires_at).getTime() > now
                ? formatDistanceToNow(new Date(detail.expires_at), { addSuffix: true })
                : `انتهت ${formatDistanceToNow(new Date(detail.expires_at), { addSuffix: true })}`;
            return (
              <div className="divide-y">
                <Row label="النوع" value={isTenant ? "مستأجر" : "مالك"} />
                <Row label={isTenant ? "المستأجر" : "المالك"} value={name} />
                <Row label="البريد الإلكتروني" value={detail.email} />
                <Row
                  label="الحالة"
                  value={<Badge variant={status.variant}>{status.label}</Badge>}
                />
                <Row label="تاريخ الإرسال" value={fmtDate(detail.created_at)} />
                <Row label="ينتهي في" value={fmtDate(detail.expires_at)} />
                <Row label="المدة الإجمالية" value={totalDuration} />
                {remaining && <Row label="المتبقي" value={remaining} />}
                {detail.accepted_at && (
                  <Row label="تاريخ القبول" value={fmtDate(detail.accepted_at)} />
                )}
                <Row
                  label="رابط الدعوة"
                  value={<span className="font-mono text-xs break-all">{url}</span>}
                />
              </div>
            );
          })()}
        <DialogFooter className="gap-2">
          {detail && !detail.accepted_at && (
            <>
              <Button
                variant="outline"
                aria-label="نسخ رابط الدعوة"
                onClick={() => onCopy(detail.token)}
              >
                <Copy className="size-4 me-1" aria-hidden="true" />
                نسخ الرابط
              </Button>
              <Button
                variant="outline"
                aria-label="إلغاء الدعوة"
                onClick={() =>
                  onAskRevoke(
                    detail,
                    new Date(detail.expires_at).getTime() < now ? "delete" : "cancel",
                  )
                }
              >
                <XCircle className="size-4 me-1 text-destructive" aria-hidden="true" />
                إلغاء الدعوة
              </Button>
            </>
          )}
          <Button onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
