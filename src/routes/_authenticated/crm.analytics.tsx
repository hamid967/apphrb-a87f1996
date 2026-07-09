import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { getPipelineAnalytics } from "@/lib/lead-activities.functions";

export const Route = createFileRoute("/_authenticated/crm/analytics")({
  component: CrmAnalyticsPage,
});

const STAGES = ["new", "contacted", "qualified", "viewing", "negotiation", "won", "lost"] as const;

function CrmAnalyticsPage() {
  const { t } = useTranslation();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org;
  const q = useQuery({
    queryKey: ["pipeline-analytics", org?.id],
    queryFn: () => getPipelineAnalytics({ data: { org_id: org!.id } }),
    enabled: !!org,
  });

  const d = q.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold sm:text-3xl">
        {t("crm.analytics.title", "CRM Analytics")}
      </h1>

      {!d ? (
        <div className="mt-6 text-sm text-muted-foreground">…</div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={t("crm.analytics.total", "Total leads")} value={d.total} />
            <Kpi
              label={t("crm.analytics.value", "Pipeline value")}
              value={`${d.totalValue.toLocaleString()} SAR`}
            />
            <Kpi label={t("crm.analytics.won", "Won")} value={d.wonCount} />
            <Kpi
              label={t("crm.analytics.winRate", "Win rate")}
              value={`${d.winRate}%`}
            />
          </div>

          <div className="surface-card mt-6 p-5">
            <h2 className="mb-4 text-lg font-semibold">
              {t("crm.analytics.byStage", "By stage")}
            </h2>
            <div className="space-y-2">
              {STAGES.map((s) => {
                const row = d.byStage[s] ?? { count: 0, value: 0 };
                const pct = d.total > 0 ? Math.round((row.count / d.total) * 100) : 0;
                return (
                  <div key={s} className="grid grid-cols-[10rem_1fr_6rem] items-center gap-3">
                    <div className="text-sm">
                      {t(`crm.leads.stages.${s}`, s)}
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-end text-sm tabular-nums text-muted-foreground">
                      {row.count} · {row.value.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: any; value: any }) {
  return (
    <div className="surface-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{String(label)}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
