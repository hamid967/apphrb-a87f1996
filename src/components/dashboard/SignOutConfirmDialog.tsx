import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SignOutConfirmDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpen = (v: boolean) => {
    if (!isControlled) setUncontrolledOpen(v);
    controlledOnOpenChange?.(v);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success(isAr ? "تم تسجيل الخروج" : "Signed out");
      const redirectTo =
        (import.meta.env.VITE_SIGN_OUT_REDIRECT_PATH as string | undefined)?.trim() || "/";
      navigate({ to: redirectTo, replace: true });
    } catch (err) {
      toast.error(isAr ? "تعذّر تسجيل الخروج" : "Could not sign out", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
      handleOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpen}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isAr ? "تأكيد تسجيل الخروج" : "Confirm sign out"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isAr
              ? "هل أنت متأكد من رغبتك في تسجيل الخروج؟ سيتم إنهاء جلستك الحالية."
              : "Are you sure you want to sign out? Your current session will end."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {isAr ? "إلغاء" : "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading
              ? isAr
                ? "جاري الخروج..."
                : "Signing out..."
              : isAr
                ? "تسجيل الخروج"
                : "Sign out"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
