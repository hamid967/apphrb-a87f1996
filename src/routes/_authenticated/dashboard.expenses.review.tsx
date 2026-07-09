import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Loader2, RotateCcw, X, ArrowLeft, Receipt as ReceiptIcon, History, ChevronDown } from "lucide-react";

import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  claimReviewCounts,
  decideClaim,
  listClaimsForReview,
} from "@/lib/expense-claims-review.functions";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApprovalAuditTrail } from "@/components/expenses/ApprovalAuditTrail";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/expenses/review")({
  head: () => sectionHead({ section: "dashboard", entityAr: "مراجعة المصروفات", entityEn: "Expenses Review", path: "/dashboard/expenses/review" }),
  component: ClaimsReviewPage,
});

type Status = "submitted" | "in_review" | "approved" | "rejected" | "draft";

type ClaimRow = {
  id: string;
  claim_number: string | null;
  title: string | null;
  description: string | null;
  amount: number;
  currency: string | null;
  category: string | null;
  status: Status;
  receipt_url: string | null;
  rejection_reason: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  batch_id: string | null;
  submitter: { full_name: string | null } | null;
};

function ClaimsReviewPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const isAr = i18n.language?.startsWith("ar");
  const [status, setStatus] = useState<Status>("submitted");
  const [dialog, setDialog] = useState<
    | { kind: "reject" | "return"; claim: ClaimRow }
    | null
  >(null);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const orgsQ = useQuery({
    queryKey: ["my-organizations"],
    queryFn: () => listMyOrganizations(),
  });
  const orgId = orgsQ.data?.[0]?.org?.id as string | undefined;

  const countsQ = useQuery({
    queryKey: ["claim-review-counts", orgId],
    queryFn: () => claimReviewCounts({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });

  const listQ = useQuery({
    queryKey: ["claims-review", orgId, status],
    queryFn: () => listClaimsForReview({ data: { org_id: orgId!, status, limit: 100 } }),
    enabled: !!orgId,
  });

  const rows = (listQ.data ?? []) as ClaimRow[];

  const decide = useMutation({
    mutationFn: decideClaim,
    onSuccess: (_r, vars) => {
      const decision = vars.data.decision;
      toast.success(
        decision === "approve"
          ? t("claimsReview.approved")
          : decision === "reject"
            ? t("claimsReview.rejected")
            : t("claimsReview.returned"),
      );
      setDialog(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["claims-review", orgId] });
      qc.invalidateQueries({ queryKey: ["claim-review-counts", orgId] });
    },
    onError: (e: Error) => {
      const msg = e.message === "forbidden" ? t("claimsReview.forbidden") : (e.message || t("claimsReview.failed"));
      toast.error(msg);
    },
  });

  const tabs = useMemo(
    () => [
      { key: "submitted" as Status, label: t("claimsReview.tabSubmitted") },
      { key: "in_review" as Status, label: t("claimsReview.tabInReview") },
      { key: "approved" as Status, label: t("claimsReview.tabApproved") },
      { key: "rejected" as Status, label: t("claimsReview.tabRejected") },
      { key: "draft" as Status, label: t("claimsReview.tabReturned") },
    ],
    [t],
  );

  const fmt = (n: number) => n.toLocaleString(isAr ? "ar" : "en");
  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(isAr ? "ar" : "en") : "—");

  function submitDecision(kind: "approve" | "reject" | "return", claim: ClaimRow) {
    if (kind === "approve") {
      decide.mutate({ data: { claim_id: claim.id, decision: "approve" } });
      return;
    }
    if (!reason.trim()) {
      toast.error(t("claimsReview.reasonRequired"));
      return;
    }
    decide.mutate({ data: { claim_id: claim.id, decision: kind, reason: reason.trim() } });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-2">
        <Link
          to="/dashboard/expenses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("expenses.title")}
        </Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("claimsReview.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("claimsReview.sub")}</p>
        </div>
      </div>

      <Tabs value={status} onValueChange={(v) => setStatus(v as Status)} className="mt-6">
        <TabsList className="flex flex-wrap">
          {tabs.map((tab) => {
            const c = countsQ.data?.[tab.key] ?? 0;
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="gap-2">
                {tab.label}
                {c > 0 && (
                  <Badge variant="secondary" className="tabular-nums">
                    {c}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{tabs.find((tt) => tt.key === status)?.label}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {t("claimsReview.empty")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("claimsReview.colClaim")}</TableHead>
                  <TableHead>{t("claimsReview.colSubmitter")}</TableHead>
                  <TableHead>{t("claimsReview.colCategory")}</TableHead>
                  <TableHead className="text-end">{t("claimsReview.colAmount")}</TableHead>
                  <TableHead>{t("claimsReview.colDate")}</TableHead>
                  <TableHead>{t("claimsReview.colReceipt")}</TableHead>
                  <TableHead className="text-end">{t("claimsReview.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const busy = decide.isPending && decide.variables?.data.claim_id === r.id;
                  const canAct = status === "submitted" || status === "in_review";
                  return (
                    <Fragment key={r.id}>
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.title || r.claim_number || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.claim_number ?? ""}
                        </div>
                        {r.rejection_reason && (
                          <div className="mt-1 text-[11px] text-destructive/80 line-clamp-2">
                            {r.rejection_reason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.submitter?.full_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{r.category ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        {fmt(Number(r.amount))} {r.currency ?? "SAR"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(r.submitted_at ?? r.created_at)}
                      </TableCell>
                      <TableCell>
                        {r.receipt_url ? (
                          <a
                            href={r.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ReceiptIcon className="h-3.5 w-3.5" />
                            {t("claimsReview.viewReceipt")}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("claimsReview.noReceipt")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleExpanded(r.id)}
                            className="h-8"
                            aria-label={t("approvalAudit.title")}
                            aria-expanded={expanded.has(r.id)}
                          >
                            <History className="h-3.5 w-3.5" />
                            <ChevronDown
                              className={`ms-0.5 h-3 w-3 transition-transform ${expanded.has(r.id) ? "rotate-180" : ""}`}
                            />
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            disabled={!canAct || busy}
                            onClick={() => {
                              if (confirm(t("claimsReview.approveConfirm"))) {
                                submitDecision("approve", r);
                              }
                            }}
                            className="h-8"
                          >
                            {busy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <Check className="me-1 h-3.5 w-3.5" />
                                {t("claimsReview.approve")}
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canAct || busy}
                            onClick={() => {
                              setReason("");
                              setDialog({ kind: "return", claim: r });
                            }}
                            className="h-8"
                          >
                            <RotateCcw className="me-1 h-3.5 w-3.5" />
                            {t("claimsReview.return")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!canAct || busy}
                            onClick={() => {
                              setReason("");
                              setDialog({ kind: "reject", claim: r });
                            }}
                            className="h-8"
                          >
                            <X className="me-1 h-3.5 w-3.5" />
                            {t("claimsReview.reject")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded.has(r.id) && (
                      <TableRow key={`${r.id}-audit`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={7} className="p-3">
                          <ApprovalAuditTrail entity="expense_claims" entityId={r.id} />
                        </TableCell>
                      </TableRow>
                    )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "reject"
                ? t("claimsReview.rejectTitle")
                : t("claimsReview.returnTitle")}
            </DialogTitle>
            <DialogDescription>
              {dialog?.kind === "reject"
                ? t("claimsReview.rejectDesc")
                : t("claimsReview.returnDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="cr-reason" className="text-xs">
              {t("claimsReview.reasonLabel")}
            </Label>
            <Textarea
              id="cr-reason"
              autoFocus
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("claimsReview.reasonPh")}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={decide.isPending}>
              {t("claimsReview.cancel")}
            </Button>
            <Button
              variant={dialog?.kind === "reject" ? "destructive" : "default"}
              disabled={decide.isPending || !reason.trim()}
              onClick={() => dialog && submitDecision(dialog.kind, dialog.claim)}
            >
              {decide.isPending ? (
                <>
                  <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                  {t("claimsReview.submitting")}
                </>
              ) : dialog?.kind === "reject" ? (
                <>
                  <X className="me-1 h-3.5 w-3.5" />
                  {t("claimsReview.reject")}
                </>
              ) : (
                <>
                  <RotateCcw className="me-1 h-3.5 w-3.5" />
                  {t("claimsReview.return")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
