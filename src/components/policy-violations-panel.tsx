import { useTranslation } from "react-i18next";
import { AlertTriangle, ShieldAlert, ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PolicyViolationDryRun } from "@/lib/policy-engine.functions";

const RULE_KEY: Record<string, string> = {
  max_amount: "policyEngine.ruleMaxAmount",
  requires_receipt: "policyEngine.ruleRequiresReceipt",
  requires_description: "policyEngine.ruleRequiresDescription",
  forbidden_keywords: "policyEngine.ruleForbiddenKeywords",
  max_per_period: "policyEngine.ruleMaxPerPeriod",
};

export type PolicyViolationDisplay = {
  rule_type: string;
  severity: "warn" | "block" | string;
  reason: string; // localized reason to show
};

export function toDisplay(
  v: PolicyViolationDryRun,
  lang: string | undefined,
): PolicyViolationDisplay {
  return {
    rule_type: v.rule_type,
    severity: v.severity,
    reason: lang?.startsWith("ar") ? v.reason_ar : v.reason_en,
  };
}

export function PolicyViolationsPanel({
  loading,
  violations,
  emptyMessage,
}: {
  loading?: boolean;
  violations: PolicyViolationDisplay[];
  emptyMessage?: string;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t("policyEngine.checking")}</span>
      </div>
    );
  }
  if (violations.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success dark:text-success">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>{emptyMessage ?? t("policyEngine.clean")}</span>
      </div>
    );
  }
  const blocked = violations.some((v) => v.severity === "block");
  return (
    <div
      role={blocked ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "rounded-md border p-3 text-xs space-y-2",
        blocked
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-warning/40 bg-warning/5 text-warning dark:text-warning",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {blocked ? (
          <ShieldAlert className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        <span>
          {blocked ? t("policyEngine.hasBlocks") : t("policyEngine.hasWarnings")}
        </span>
      </div>
      <ul className="space-y-1.5 ps-4 list-disc marker:text-current">
        {violations.map((v, i) => (
          <li key={i} className="leading-snug">
            <span className="font-medium">
              {t(RULE_KEY[v.rule_type] ?? "policyEngine.heading")}
              {" — "}
              {v.severity === "block" ? t("policyEngine.block") : t("policyEngine.warn")}:
            </span>{" "}
            <span>{v.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}