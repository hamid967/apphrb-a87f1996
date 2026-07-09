import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-current-org";

type Row = {
  id: string;
  org_id?: string | null;
  status?: string | null;
  submitted_by?: string | null;
  rejection_reason?: string | null;
  claim_number?: string | null;
  batch_number?: string | null;
};

/**
 * Subscribes to org-scoped expense_claims / expense_batches / rental_applications
 * changes and:
 *  - shows a toast on approve/reject/revert transitions for expense entities
 *  - invalidates the counter queries so the dashboard badges refresh live
 *
 * Mount once, high in the tree (dashboard shell).
 */
export function useClaimsRealtime(opts?: { isAr?: boolean }) {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();
  const isAr = opts?.isAr ?? true;
  const meRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      meRef.current = data.user?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!orgId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["trial-bot-signals"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
      qc.invalidateQueries({ queryKey: ["expense-batches"] });
      qc.invalidateQueries({ queryKey: ["request-badge-counts"] });
      qc.invalidateQueries({ queryKey: ["rental-applications"] });
    };

    const label = (entity: "claim" | "batch", status: string, ref?: string | null) => {
      const isMine = false; // toast text is generic; ownership refines below
      void isMine;
      const entityAr = entity === "claim" ? "طلب مصروف" : "دفعة مصروفات";
      const entityEn = entity === "claim" ? "Expense claim" : "Expense batch";
      const refText = ref ? ` #${ref}` : "";
      const map: Record<string, [string, string]> = {
        approved: ["تمت الموافقة", "Approved"],
        rejected: ["تم الرفض", "Rejected"],
        submitted: ["تم الإرسال للاعتماد", "Submitted for approval"],
        draft: ["أُعيد إلى المسودة", "Reverted to draft"],
        in_review: ["قيد المراجعة", "In review"],
        cancelled: ["تم الإلغاء", "Cancelled"],
      };
      const [ar, en] = map[status] ?? [status, status];
      return isAr ? `${ar} — ${entityAr}${refText}` : `${en} — ${entityEn}${refText}`;
    };

    const notify = (entity: "claim" | "batch", next: Row, prev?: Row) => {
      const status = String(next.status ?? "");
      if (!status || prev?.status === status) return;

      const ref = entity === "claim" ? next.claim_number : next.batch_number;
      const title = label(entity, status, ref);
      const desc =
        status === "rejected" && next.rejection_reason
          ? (isAr ? `السبب: ${next.rejection_reason}` : `Reason: ${next.rejection_reason}`)
          : undefined;

      // Only nudge the submitter with success/error tones — everyone else
      // still sees the ticker refresh but skips a noisy toast.
      const isMine = meRef.current && next.submitted_by === meRef.current;
      const fn =
        status === "approved"
          ? toast.success
          : status === "rejected"
            ? toast.error
            : status === "draft"
              ? toast.warning
              : toast;
      if (isMine) {
        const action = {
          label: isAr ? "فتح المصروفات" : "Open expenses",
          onClick: () => {
            if (typeof window !== "undefined") {
              window.location.assign("/dashboard/expenses");
            }
          },
        };
        (fn as any)(title, {
          ...(desc ? { description: desc } : {}),
          action,
        });
      }
    };

    const claimsCh = supabase
      .channel(`claims-rt-${orgId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "expense_claims", filter: `org_id=eq.${orgId}` },
        (payload) => {
          notify("claim", payload.new as Row, payload.old as Row);
          invalidate();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "expense_claims", filter: `org_id=eq.${orgId}` },
        () => invalidate(),
      )
      .subscribe();

    const batchesCh = supabase
      .channel(`batches-rt-${orgId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "expense_batches", filter: `org_id=eq.${orgId}` },
        (payload) => {
          notify("batch", payload.new as Row, payload.old as Row);
          invalidate();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "expense_batches", filter: `org_id=eq.${orgId}` },
        () => invalidate(),
      )
      .subscribe();

    const appsCh = supabase
      .channel(`apps-rt-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rental_applications", filter: `org_id=eq.${orgId}` },
        () => invalidate(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(claimsCh);
      supabase.removeChannel(batchesCh);
      supabase.removeChannel(appsCh);
    };
  }, [orgId, qc, isAr]);
}