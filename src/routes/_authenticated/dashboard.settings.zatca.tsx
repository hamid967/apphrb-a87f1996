import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  runZatcaSelfCheck,
  zatcaAutoFixInvoiceMath,
  type ZatcaCheckItem,
  type ZatcaCheckStatus,
} from "@/lib/zatca-check.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/settings/zatca")({
  head: () => sectionHead({ section: "dashboard", entityAr: "ZATCA", entityEn: "ZATCA", path: "/dashboard/settings/zatca" }),
  component: ZatcaPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="mb-2 text-destructive">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function ZatcaPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;

  const reportQ = useQuery({
    queryKey: ["zatca-selfcheck", org?.id],
    queryFn: () => runZatcaSelfCheck({ data: { orgId: org!.id } }),
    enabled: !!org,
  });

  const autofix = useMutation({
    mutationFn: zatcaAutoFixInvoiceMath,
    onSuccess: (res) => {
      toast.success(t("zatca.autoFixDone", { n: res.fixed }));
      qc.invalidateQueries({ queryKey: ["zatca-selfcheck", org?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const report = reportQ.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        to="/dashboard/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("zatca.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("zatca.title")}
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("zatca.subtitle")}</p>
        </div>
        <Button variant="secondary" onClick={() => reportQ.refetch()} disabled={reportQ.isFetching}>
          {reportQ.isFetching ? (
            <Loader2 className="me-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="me-2 size-4" />
          )}
          {t("zatca.rerun")}
        </Button>
      </div>

      {reportQ.isLoading && (
        <Card className="mt-6">
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("zatca.running")}
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <Card className="mt-6">
            <CardContent className="flex flex-wrap items-center justify-between gap-6 py-6">
              <div className="flex items-center gap-4">
                <ScoreRing score={report.score} />
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("zatca.complianceScore")}
                  </div>
                  <div className="text-3xl font-bold tabular-nums">{report.score}%</div>
                  <div className="text-xs text-muted-foreground">
                    {t("zatca.sampledInvoices", { n: report.sampled_invoices })}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <SummaryChip status="pass" count={report.summary.pass} label={t("zatca.pass")} />
                <SummaryChip status="warn" count={report.summary.warn} label={t("zatca.warn")} />
                <SummaryChip status="fail" count={report.summary.fail} label={t("zatca.fail")} />
                <SummaryChip
                  status="pending"
                  count={report.summary.pending}
                  label={t("zatca.pending")}
                />
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-3">
            {report.items.map((item) => (
              <CheckItemCard
                key={item.id}
                item={item}
                isAr={isAr}
                onAutoFix={
                  item.auto_fixable ? () => autofix.mutate({ data: { orgId: org!.id } }) : undefined
                }
                autoFixLoading={autofix.isPending}
              />
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            {t("zatca.footNote", {
              date: new Date(report.ran_at).toLocaleString(isAr ? "ar-SA" : "en"),
            })}
          </p>
        </>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-red-500";
  const stroke =
    score >= 85 ? "stroke-emerald-500" : score >= 60 ? "stroke-amber-500" : "stroke-red-500";
  const R = 30;
  const C = 2 * Math.PI * R;
  const off = C - (score / 100) * C;
  return (
    <div className={`relative flex size-20 items-center justify-center ${color}`}>
      <svg viewBox="0 0 72 72" className="size-20 -rotate-90">
        <circle cx="36" cy="36" r={R} className="stroke-muted" strokeWidth="7" fill="none" />
        <circle
          cx="36"
          cy="36"
          r={R}
          className={stroke}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off}
        />
      </svg>
    </div>
  );
}

function SummaryChip({
  status,
  count,
  label,
}: {
  status: ZatcaCheckStatus;
  count: number;
  label: string;
}) {
  const cls = statusChipClass(status);
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 ${cls}`}>
      <StatusIcon status={status} />
      <span className="tabular-nums font-medium">{count}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: ZatcaCheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="size-4" />;
  if (status === "warn") return <AlertTriangle className="size-4" />;
  if (status === "fail") return <XCircle className="size-4" />;
  return <Clock className="size-4" />;
}

function statusChipClass(status: ZatcaCheckStatus) {
  if (status === "pass")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "warn")
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "fail") return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300";
}

function CheckItemCard({
  item,
  isAr,
  onAutoFix,
  autoFixLoading,
}: {
  item: ZatcaCheckItem;
  isAr: boolean;
  onAutoFix?: () => void;
  autoFixLoading?: boolean;
}) {
  const cls = statusChipClass(item.status);
  const title = isAr ? item.title_ar : item.title_en;
  const detail = isAr ? item.detail_ar : item.detail_en;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-full border p-1.5 ${cls}`}>
            <StatusIcon status={item.status} />
          </div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </div>
        {onAutoFix && (
          <Button size="sm" variant="secondary" onClick={onAutoFix} disabled={autoFixLoading}>
            {autoFixLoading ? (
              <Loader2 className="me-1.5 size-3.5 animate-spin" />
            ) : (
              <Wrench className="me-1.5 size-3.5" />
            )}
            {isAr ? "إصلاح تلقائي" : "Auto-fix"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{detail}</p>
        <div className="mt-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {item.id}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
