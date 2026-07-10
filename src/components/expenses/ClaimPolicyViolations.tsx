import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileText, Loader2, ShieldAlert } from "lucide-react";

import { listPolicyViolationsForClaim } from "@/lib/policy-engine.functions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = { claimId: string };

const RULE_KEYS = [
  "max_amount",
  "requires_receipt",
  "requires_description",
  "forbidden_keywords",
  "max_per_period",
] as const;

export function ClaimPolicyViolations({ claimId }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  const q = useQuery({
    queryKey: ["claim-policy-violations", claimId],
    queryFn: () => listPolicyViolationsForClaim({ data: { claim_id: claimId } }),
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
                <TableHead className="w-[22%]">{t("policyViolationsPanel.colPolicy")}</TableHead>
                <TableHead className="w-[14%]">{t("policyViolationsPanel.colRule")}</TableHead>
                <TableHead>{t("policyViolationsPanel.colReason")}</TableHead>
                <TableHead className="w-[18%]">{t("policyViolationsPanel.colAmount")}</TableHead>
                <TableHead className="w-[16%]">{t("policyViolationsPanel.colWhen")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const policyName =
                  r.policy?.note?.trim() ||
                  `${ruleLabel(r.policy?.rule_type ?? r.rule_type)} · ${r.policy?.category ?? r.category ?? "—"}`;
                const currency = r.currency ?? r.policy?.max_amount != null ? "SAR" : "";
                const hasLimit = r.limit_amount != null;
                return (
                  <TableRow key={r.id}>
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
                    <TableCell className="text-sm whitespace-pre-wrap">{r.reason}</TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {hasLimit
                        ? t("policyViolationsPanel.limitFmt", {
                            amount: fmtNum(r.amount),
                            limit: fmtNum(r.limit_amount),
                            currency: r.currency ?? currency ?? "",
                          })
                        : `${fmtNum(r.amount)} ${r.currency ?? ""}`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(r.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
