import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Send,
  Trash2,
  X,
  Check,
  XCircle,
  Receipt as ReceiptIcon,
} from "lucide-react";
import {
  approveBatch,
  deleteBatch,
  detachClaimFromBatch,
  getBatchDetail,
  rejectBatch,
  submitBatchForApproval,
} from "@/lib/expense-batches.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./dashboard.expenses.batches";
import { listPolicyViolationsForClaims } from "@/lib/policy-engine.functions";
import { PolicyViolationsPanel } from "@/components/policy-violations-panel";
import { ApprovalAuditTrail } from "@/components/expenses/ApprovalAuditTrail";

export const Route = createFileRoute("/_authenticated/dashboard/expenses/batches/$batchId")({
  head: ({ params }) => detailHead({ entityAr: 'دفعة مصروفات', entityEn: 'Expense Batch', id: String(params.batchId), path: `/dashboard/expenses/batches/${params.batchId}`, kind: 'dashboard', section: 'accounting' }),
  component: BatchDetailPage,
});

function BatchDetailPage() {
  const { batchId } = Route.useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["expense-batch", batchId],
    queryFn: () => getBatchDetail({ data: { batch_id: batchId } }),
  });

  const claimIds = (q.data?.claims ?? []).map((c) => c.id);
  const violationsQ = useQuery({
    queryKey: ["batch-policy-violations", batchId, claimIds.join(",")],
    enabled: claimIds.length > 0,
    queryFn: () =>
      listPolicyViolationsForClaims({ data: { claim_ids: claimIds } }),
    staleTime: 15_000,
  });
  const violationsByClaim = new Map<
    string,
    Array<{ rule_type: string; severity: string; reason: string }>
  >();
  for (const v of violationsQ.data ?? []) {
    const arr = violationsByClaim.get(v.claim_id) ?? [];
    arr.push({
      rule_type: v.rule_type,
      severity: v.severity,
      reason: v.reason,
    });
    violationsByClaim.set(v.claim_id, arr);
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["expense-batch", batchId] });
    qc.invalidateQueries({ queryKey: ["expense-batches"] });
  };

  const submitM = useMutation({
    mutationFn: () => submitBatchForApproval({ data: { batch_id: batchId } }),
    onSuccess: () => {
      toast.success(t("expenseBatches.submitted"));
      invalidate();
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });
  const approveM = useMutation({
    mutationFn: () => approveBatch({ data: { batch_id: batchId } }),
    onSuccess: () => {
      toast.success(t("expenseBatches.approved"));
      invalidate();
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const rejectM = useMutation({
    mutationFn: () => rejectBatch({ data: { batch_id: batchId, reason: rejectReason || null } }),
    onSuccess: () => {
      toast.success(t("expenseBatches.rejected"));
      setShowReject(false);
      setRejectReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(mapErr(e.message, t)),
  });
  const deleteM = useMutation({
    mutationFn: () => deleteBatch({ data: { batch_id: batchId } }),
    onSuccess: () => {
      toast.success(t("expenseBatches.deleted"));
      navigate({ to: "/dashboard/expenses/batches" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const detachM = useMutation({
    mutationFn: (claim_id: string) => detachClaimFromBatch({ data: { claim_id } }),
    onSuccess: () => {
      toast.success(t("expenseBatches.removed"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="grid place-items-center p-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { batch, claims } = q.data;
  const isDraft = batch.status === "draft" || batch.status === "rejected";
  const isSubmitted = batch.status === "submitted";
  const fmt = (n: number) =>
    Number(n).toLocaleString(isAr ? "ar" : "en", { maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        to="/dashboard/expenses/batches"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("expenseBatches.backToList")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl truncate">
              {batch.title}
            </h1>
            <StatusBadge status={batch.status} />
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {batch.batch_number} · {t(`expenseBatches.${batch.batch_type}`)}
            {batch.start_date &&
              ` · ${batch.start_date}${batch.end_date ? ` → ${batch.end_date}` : ""}`}
          </div>
          {batch.description && <p className="mt-2 text-sm">{batch.description}</p>}
          {batch.rejection_reason && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="font-medium">{t("expenseBatches.rejectionReason")}</div>
              <div className="mt-0.5">{batch.rejection_reason}</div>
            </div>
          )}
        </div>
        <div className="text-end tabular-nums">
          <div className="text-xs text-muted-foreground uppercase">{t("expenseBatches.total")}</div>
          <div className="text-2xl font-semibold">
            {fmt(Number(batch.total_amount))}{" "}
            <span className="text-sm text-muted-foreground">{batch.currency}</span>
          </div>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("expenseBatches.lineItems")}</CardTitle>
          {isDraft && (
            <Button size="sm" asChild>
              <Link to="/dashboard/expenses/claim" search={{ batch: batchId, amount: undefined, category: undefined, title: undefined, notes: undefined, receipt: undefined, filename: undefined, step: undefined }}>
                <Plus className="me-1 size-4" /> {t("expenseBatches.addItem")}
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {claims.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {t("expenseBatches.noItems")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("expenseBatches.itemTitle")}</TableHead>
                  <TableHead>{t("expenseBatches.itemCat")}</TableHead>
                  <TableHead className="text-end">{t("expenseBatches.itemAmount")}</TableHead>
                  <TableHead>{t("expenseBatches.itemReceipt")}</TableHead>
                  {isDraft && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <>
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.title}</div>
                        <div className="text-xs text-muted-foreground">{c.claim_number}</div>
                      </TableCell>
                      <TableCell className="text-sm">{c.category ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {fmt(Number(c.amount))} {c.currency}
                      </TableCell>
                      <TableCell>
                        {c.receipt_url ? (
                          <span className="inline-flex items-center gap-1 text-primary text-xs">
                            <ReceiptIcon className="size-3.5" /> {t("expenseBatches.attached")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {isDraft && (
                        <TableCell className="text-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => detachM.mutate(c.id)}
                            aria-label={t("expenseBatches.remove")}
                          >
                            <X className="size-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                    {(violationsByClaim.get(c.id)?.length ?? 0) > 0 && (
                      <TableRow key={`${c.id}-violations`} className="hover:bg-transparent">
                        <TableCell colSpan={isDraft ? 5 : 4} className="pt-0 pb-3">
                          <div className="text-[11px] text-muted-foreground mb-1">
                            {t("policyEngine.onClaim")}
                          </div>
                          <PolicyViolationsPanel
                            violations={violationsByClaim.get(c.id) ?? []}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          {isDraft && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (confirm(t("expenseBatches.confirmDelete"))) deleteM.mutate();
              }}
            >
              <Trash2 className="me-2 size-4" /> {t("expenseBatches.deleteDraft")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <Button
              onClick={() => submitM.mutate()}
              disabled={claims.length === 0 || submitM.isPending}
            >
              {submitM.isPending ? (
                <Loader2 className="me-2 size-4 animate-spin" />
              ) : (
                <Send className="me-2 size-4" />
              )}
              {t("expenseBatches.submitAll")}
            </Button>
          )}
          {isSubmitted && (
            <>
              <Button
                variant="outline"
                className="text-destructive border-destructive/40"
                onClick={() => setShowReject((v) => !v)}
              >
                <XCircle className="me-2 size-4" /> {t("expenseBatches.reject")}
              </Button>
              <Button onClick={() => approveM.mutate()} disabled={approveM.isPending}>
                {approveM.isPending ? (
                  <Loader2 className="me-2 size-4 animate-spin" />
                ) : (
                  <Check className="me-2 size-4" />
                )}
                {t("expenseBatches.approve")}
              </Button>
            </>
          )}
        </div>
      </div>

      {isSubmitted && showReject && (
        <Card className="mt-4 border-destructive/30">
          <CardContent className="space-y-3 p-4">
            <Textarea
              rows={3}
              placeholder={t("expenseBatches.reasonPlaceholder")}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={1000}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowReject(false);
                  setRejectReason("");
                }}
              >
                {t("expenseBatches.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => rejectM.mutate()}
                disabled={rejectM.isPending}
              >
                {rejectM.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
                {t("expenseBatches.confirmReject")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ApprovalAuditTrail
        entity="expense_batches"
        entityId={batchId}
        className="mt-6"
      />
    </div>
  );
}

function mapErr(msg: string, t: (k: string) => string): string {
  switch (msg) {
    case "batch_empty":
      return t("expenseBatches.errEmpty");
    case "batch_not_editable":
      return t("expenseBatches.errNotEditable");
    case "not_owner":
    case "not_batch_owner":
    case "forbidden":
      return t("expenseBatches.errForbidden");
    default:
      return msg;
  }
}
