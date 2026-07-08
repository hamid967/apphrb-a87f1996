import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  used: number;
  max: number | null;
  planName?: string;
}

export function UpgradeDialog({
  open,
  onOpenChange,
  label,
  used,
  max,
  planName,
}: UpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-warning/10 text-warning">
            <AlertTriangle className="size-6" />
          </div>
          <DialogTitle className="text-center">تم بلوغ حد الباقة</DialogTitle>
          <DialogDescription className="text-center">
            وصلت إلى الحد الأقصى لـ<strong className="mx-1">{label}</strong>
            في باقتك الحالية{" "}
            {planName ? <span className="text-foreground">({planName})</span> : null}.
            <div className="mt-2 text-sm">
              الاستخدام الحالي:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {used} / {max ?? "∞"}
              </span>
            </div>
            <div className="mt-2">قم بترقية اشتراكك للاستمرار في الإضافة.</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            لاحقاً
          </Button>
          <Button asChild onClick={() => onOpenChange(false)}>
            <Link to="/dashboard/settings/billing">
              <ArrowUpCircle className="size-4 me-2" /> ترقية الباقة
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
