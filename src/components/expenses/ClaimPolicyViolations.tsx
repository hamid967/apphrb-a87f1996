import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, Loader2, ShieldAlert, ShieldCheck, Undo2 } from "lucide-react";

import {
  clearClaimPolicyViolationOverride,
  listPolicyViolationsForClaim,
  overrideClaimPolicyViolation,
} from "@/lib/policy-engine.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = { claimId: string; activeViolationId?: string | null };

const RULE_KEYS = [
  "max_amount",
  "requires_receipt",
  "requires_description",
  "forbidden_keywords",
  "max_per_period",
] as const;

export function ClaimPolicyViolations({ claimId, activeViolationId }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const reducedMotion = useReducedMotion();

  const [overrideTarget, setOverrideTarget] = useState<{ id: string } | null>(null);
  const [reason, setReason] = useState("");

  const q = useQuery({
    queryKey: ["claim-policy-violations", claimId],
    queryFn: () => listPolicyViolationsForClaim({ data: { claim_id: claimId } }),
  });

  // Re-flash the active (deep-linked) violation row every time it re-enters
  // the viewport, not just on the initial scroll. If the reviewer scrolls
  // past it and comes back, the row briefly pulses again to re-anchor
  // attention. Persistent `.violation-active` styling stays put in between.
  // When the user prefers reduced motion, we flash only once (on first
  // entry) and keep the duration short via CSS media query.
  useEffect(() => {
    if (!activeViolationId || typeof window === "undefined") return;
    const el = document.getElementById(`violation-${activeViolationId}`);
    if (!el) return;
    let removeTimer: number | null = null;
    let flashed = false;
    const flashMs = reducedMotion ? 600 : 2600;
    const flash = () => {
      if (reducedMotion && flashed) return;
      flashed = true;
      el.classList.remove("violation-flash");
      // Force reflow so the animation restarts on repeated entries.
      void el.offsetWidth;
      el.classList.add("violation-flash");
      if (removeTimer != null) window.clearTimeout(removeTimer);
      removeTimer = window.setTimeout(() => {
        el.classList.remove("violation-flash");
      }, flashMs);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) flash();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (removeTimer != null) window.clearTimeout(removeTimer);
      el.classList.remove("violation-flash");
    };
  }, [activeViolationId, q.data, reducedMotion]);



  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["claim-policy-violations", claimId] });
    qc.invalidateQueries({ queryKey: ["policy_violations"] });
  };

  const overrideMut = useMutation({
    mutationFn: overrideClaimPolicyViolation,
    onSuccess: () => {
      toast.success(t("policyViolationsPanel.overrideSaved"));
      setOverrideTarget(null);
      setReason("");
      invalidate();
    },
    onError: (e: Error) => {
      const msg =
        e.message === "forbidden"
          ? t("policyViolationsPanel.overrideForbidden")
          : (e.message || t("policyViolationsPanel.overrideFailed"));
      toast.error(msg);
    },
  });

  const clearMut = useMutation({
    mutationFn: clearClaimPolicyViolationOverride,
    onSuccess: () => {
      toast.success(t("policyViolationsPanel.overrideCleared"));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "forbidden"
          ? t("policyViolationsPanel.overrideForbidden")
          : (e.message || t("policyViolationsPanel.overrideFailed")),
      ),
  });

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString(isAr ? "ar" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const fmtNum = (n: number | string | null | undefined) =>
    n == null ? "—" : Number(n).toLocaleString(isAr ? "ar" : "en");

  const ruleLabel = (rt: string) =>
    (RULE_KEYS as readonly string[]).includes(rt)
      ? t(`policyViolationsPanel.rule_${rt}` as const)
      : rt;

  const claim = q.data?.claim ?? null;
  const rows = q.data?.violations ?? [];
  const canOverride = q.data?.can_override ?? false;

  const submitOverride = () => {
    if (!overrideTarget) return;
    if (reason.trim().length < 4) {
      toast.error(t("policyViolationsPanel.overrideReasonRequired"));
      return;
    }
    overrideMut.mutate({ data: { violation_id: overrideTarget.id, reason: reason.trim() } });
  };

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{t("policyViolationsPanel.title")}</div>
          <div className="text-xs text-muted-foreground">
            {t("policyViolationsPanel.subtitle")}
          </div>
        </div>
        <Badge variant="secondary" className="tabular-nums">
          {rows.length}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{t("policyViolationsPanel.receipt")}:</span>
        {claim?.receipt_url ? (
          <a
            href={claim.receipt_url}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline truncate max-w-[16rem]"
            title={claim.receipt_url}
          >
            {t("policyViolationsPanel.openReceipt")}
          </a>
        ) : (
          <span className="text-muted-foreground">{t("policyViolationsPanel.noReceipt")}</span>
        )}
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("policyViolationsPanel.loading")}
        </div>
      ) : q.isError ? (
        <div className="flex items-center gap-2 p-4 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {t("policyViolationsPanel.error")}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          {t("policyViolationsPanel.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20%]">{t("policyViolationsPanel.colPolicy")}</TableHead>
                <TableHead className="w-[12%]">{t("policyViolationsPanel.colRule")}</TableHead>
                <TableHead>{t("policyViolationsPanel.colReason")}</TableHead>
                <TableHead className="w-[14%]">{t("policyViolationsPanel.colAmount")}</TableHead>
                <TableHead className="w-[14%]">{t("policyViolationsPanel.colStatus")}</TableHead>
                <TableHead className="w-[10%] text-end">{t("policyViolationsPanel.colWhen")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const policyName =
                  r.policy?.note?.trim() ||
                  `${ruleLabel(r.policy?.rule_type ?? r.rule_type)} · ${r.policy?.category ?? r.category ?? "—"}`;
                const hasLimit = r.limit_amount != null;
                const isOverridden = !!r.overridden_by;
                const busyOverride =
                  clearMut.isPending && clearMut.variables?.data.violation_id === r.id;
                return (
                  <TableRow
                    key={r.id}
                    id={`violation-${r.id}`}
                    className={`scroll-mt-24 ${isOverridden ? "opacity-75" : ""} ${activeViolationId === r.id ? "violation-active" : ""}`}
                  >
                    <TableCell>
                      <div className="font-medium text-sm truncate">{policyName}</div>
                      {r.policy?.category && (
                        <div className="text-[11px] text-muted-foreground capitalize">
                          {r.policy.category}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          className={
                            r.severity === "block"
                              ? "bg-destructive text-destructive-foreground w-fit"
                              : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 w-fit"
                          }
                        >
                          {r.severity === "block"
                            ? t("policyViolationsPanel.severityBlock")
                            : t("policyViolationsPanel.severityWarn")}
                        </Badge>
                        <Badge variant="outline" className="w-fit text-[10px]">
                          {ruleLabel(r.rule_type)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-pre-wrap align-top">
                      <div>{r.reason}</div>
                      {isOverridden && r.override_reason && (
                        <div className="mt-1 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-800 dark:text-emerald-300">
                          <div className="font-medium">{t("policyViolationsPanel.overrideActive")}</div>
                          <div className="mt-0.5 whitespace-pre-wrap">{r.override_reason}</div>
                          <div className="mt-1 text-[10px] opacity-80">
                            {t("policyViolationsPanel.overrideBy", {
                              name: r.override_by_name ?? "—",
                            })}{" "}
                            {r.overridden_at &&
                              t("policyViolationsPanel.overrideAt", {
                                date: fmtDate(r.overridden_at),
                              })}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm align-top">
                      {hasLimit
                        ? t("policyViolationsPanel.limitFmt", {
                            amount: fmtNum(r.amount),
                            limit: fmtNum(r.limit_amount),
                            currency: r.currency ?? "",
                          })
                        : `${fmtNum(r.amount)} ${r.currency ?? ""}`}
                    </TableCell>
                    <TableCell className="align-top">
                      {isOverridden ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 w-fit">
                            <CheckCircle2 className="me-1 h-3 w-3" />
                            {t("policyViolationsPanel.overrideActive")}
                          </Badge>
                          {canOverride && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px]"
                              disabled={busyOverride}
                              onClick={() =>
                                clearMut.mutate({ data: { violation_id: r.id } })
                              }
                            >
                              {busyOverride ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Undo2 className="me-1 h-3 w-3" />
                              )}
                              {t("policyViolationsPanel.overrideClear")}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline" className="w-fit text-[10px]">
                            {t("policyViolationsPanel.statusActive")}
                          </Badge>
                          {canOverride && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => {
                                setReason("");
                                setOverrideTarget({ id: r.id });
                              }}
                            >
                              <ShieldCheck className="me-1 h-3 w-3" />
                              {t("policyViolationsPanel.override")}
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground align-top text-end">
                      {fmtDate(r.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={!!overrideTarget}
        onOpenChange={(o) => {
          if (!o) {
            setOverrideTarget(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("policyViolationsPanel.overrideDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("policyViolationsPanel.overrideDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="pv-override-reason" className="text-xs">
              {t("policyViolationsPanel.overrideReasonLabel")}
            </Label>
            <Textarea
              id="pv-override-reason"
              autoFocus
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("policyViolationsPanel.overrideReasonPh")}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOverrideTarget(null);
                setReason("");
              }}
              disabled={overrideMut.isPending}
            >
              {t("policyViolationsPanel.overrideCancel")}
            </Button>
            <Button
              disabled={overrideMut.isPending || reason.trim().length < 4}
              onClick={submitOverride}
            >
              {overrideMut.isPending ? (
                <>
                  <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />
                  {t("policyViolationsPanel.overrideConfirm")}
                </>
              ) : (
                <>
                  <ShieldCheck className="me-1 h-3.5 w-3.5" />
                  {t("policyViolationsPanel.overrideConfirm")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
