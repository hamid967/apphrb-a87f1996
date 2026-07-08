import { Copy, Trash2, XCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PortalInvitation, OnAskRevoke } from "./invitation-types";

export type InvitationStatus = "pending" | "expired" | "accepted";

interface Props {
  inv: PortalInvitation;
  status: InvitationStatus;
  name: string;
  origin: string;
  onOpen: (inv: PortalInvitation) => void;
  onCopy: (token: string) => void;
  onAskRevoke: OnAskRevoke;
}

const fmtDate = (d: string) => format(new Date(d), "yyyy-MM-dd HH:mm");

export function InvitationCard({ inv, status, name, origin, onOpen, onCopy, onAskRevoke }: Props) {
  const kindLabel = inv.kind === "tenant" ? "مستأجر" : "مالك";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(inv)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(inv);
      }}
      className="py-3 flex flex-wrap items-center gap-3 cursor-pointer hover:bg-muted/40 rounded-md px-2 -mx-2"
    >
      <div className="flex-1 min-w-[200px]">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">
          {inv.email} · {kindLabel}
        </div>
      </div>

      {status === "pending" && (
        <>
          <div className="text-xs text-muted-foreground">
            أُرسلت {fmtDate(inv.created_at)} · تنتهي{" "}
            {formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })}
          </div>
          <Badge variant="secondary">بانتظار القبول</Badge>
          <Button
            variant="outline"
            size="sm"
            aria-label={`نسخ رابط دعوة ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onCopy(inv.token);
            }}
          >
            <Copy className="size-3 me-1" aria-hidden="true" />
            نسخ الرابط
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`إلغاء دعوة ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onAskRevoke(inv, "cancel");
            }}
          >
            <XCircle className="size-4 me-1 text-destructive" aria-hidden="true" />
            إلغاء الدعوة
          </Button>
          <div className="w-full text-xs text-muted-foreground truncate font-mono">{`${origin}/portal-invite/${inv.token}`}</div>
        </>
      )}

      {status === "expired" && (
        <>
          <div className="text-xs text-muted-foreground">
            أُرسلت {fmtDate(inv.created_at)} · انتهت {fmtDate(inv.expires_at)}
          </div>
          <Badge variant="destructive">منتهية</Badge>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`حذف الدعوة المنتهية لـ ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onAskRevoke(inv, "delete");
            }}
          >
            <Trash2 className="size-4 me-1 text-destructive" aria-hidden="true" />
            <span>حذف</span>
          </Button>
        </>
      )}

      {status === "accepted" && (
        <>
          {inv.accepted_at && (
            <div className="text-xs text-muted-foreground">قُبلت {fmtDate(inv.accepted_at)}</div>
          )}
          <Badge>مقبولة</Badge>
        </>
      )}
    </div>
  );
}
