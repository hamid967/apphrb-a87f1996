import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getCronRunsSummary,
  type CronHttpResponse,
  type CronJobSummary,
  type CronRun,
} from "@/lib/cron-runs.functions";
import { sectionHead } from "@/lib/section-og-head";

export const Route = createFileRoute("/_authenticated/admin/cron-runs")({
  head: () =>
    sectionHead({
      section: "admin",
      entityAr: "مهام الجدولة (cron)",
      entityEn: "Scheduled jobs (cron)",
      path: "/admin/cron-runs",
    }),
  component: CronRunsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive mb-2">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          {"إعادة المحاولة / Retry"}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{"غير موجود / Not found"}</div>,
});

function CronRunsPage() {
  const { i18n } = useTranslation();
  const isAr = (i18n.language || "ar").startsWith("ar");
  const qc = useQueryClient();
  const summaryFn = useServerFn(getCronRunsSummary);

  const q = useQuery({
    queryKey: ["admin-cron-runs"],
    queryFn: () => summaryFn(),
    refetchInterval: 30_000,
  });

  const jobs = q.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <AdminPageHeader
        icon={Activity}
        ar="مهام الجدولة (cron)"
        en="Scheduled jobs (cron)"
        descriptionAr="عرض آخر تشغيلات pg_cron واستجابات HTTP لكل خطاف عام"
        descriptionEn="Latest pg_cron runs and HTTP responses per public hook"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin-cron-runs"] })}
            disabled={q.isFetching}
          >
            <RefreshCw className={"me-2 size-4 " + (q.isFetching ? "animate-spin" : "")} />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {isAr ? "جارٍ التحميل…" : "Loading…"}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {isAr ? "لا توجد مهام مجدولة." : "No scheduled jobs."}
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((j) => (
            <JobCard key={j.jobid} isAr={isAr} job={j} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ isAr, job }: { isAr: boolean; job: CronJobSummary }) {
  const locale = isAr ? "ar-SA" : "en-US";
  const anyFailure = job.stats.failed > 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="font-mono" dir="ltr">
                {job.jobname}
              </span>
              {job.active ? (
                <Badge variant="default" className="gap-1">
                  <Play className="size-3" /> {isAr ? "نشط" : "Active"}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Pause className="size-3" /> {isAr ? "متوقف" : "Paused"}
                </Badge>
              )}
              <Badge variant={anyFailure ? "destructive" : "outline"} className="gap-1">
                {anyFailure ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
                {isAr ? `فشل: ${job.stats.failed}` : `Failures: ${job.stats.failed}`}
              </Badge>
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                <span className="font-mono" dir="ltr">
                  {job.schedule}
                </span>
              </span>
              {job.command_url && (
                <span className="truncate font-mono" dir="ltr" title={job.command_url}>
                  {job.command_url}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {isAr ? "آخر رمز HTTP" : "Last HTTP code"}
            </div>
            <div
              className={
                "text-2xl font-semibold tabular-nums " +
                (job.stats.last_status_code === null
                  ? "text-muted-foreground"
                  : job.stats.last_status_code >= 400
                    ? "text-destructive"
                    : "text-emerald-600")
              }
            >
              {job.stats.last_status_code ?? "—"}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isAr ? "آخر تشغيلات cron" : "Recent cron runs"}
          </div>
          {job.runs.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              {isAr ? "لا يوجد تاريخ تشغيل بعد." : "No run history yet."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <Th>{isAr ? "الوقت" : "Time"}</Th>
                    <Th>{isAr ? "الحالة" : "Status"}</Th>
                    <Th>{isAr ? "المدة" : "Duration"}</Th>
                    <Th>{isAr ? "الرسالة" : "Message"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {job.runs.map((r) => (
                    <RunRow key={r.runid} r={r} locale={locale} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isAr ? "آخر استجابات HTTP" : "Recent HTTP responses"}
          </div>
          {job.responses.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              {isAr ? "لا توجد استجابات مسجّلة." : "No HTTP responses recorded."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <Th>{isAr ? "الوقت" : "Time"}</Th>
                    <Th>{isAr ? "الرمز" : "Code"}</Th>
                    <Th>{isAr ? "الجسم" : "Body"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {job.responses.map((r) => (
                    <RespRow key={r.id} r={r} locale={locale} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-2 py-1.5 text-start font-medium">{children}</th>;
}

function fmt(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(locale, { hour12: false });
}

function RunRow({ r, locale }: { r: CronRun; locale: string }) {
  const isOk = r.status === "succeeded";
  const duration =
    r.end_time && r.start_time
      ? `${Math.round((new Date(r.end_time).getTime() - new Date(r.start_time).getTime()))} ms`
      : "—";
  return (
    <tr className="border-t align-top">
      <td className="px-2 py-1.5" dir="ltr">
        {fmt(r.start_time, locale)}
      </td>
      <td className="px-2 py-1.5">
        <Badge variant={isOk ? "outline" : "destructive"} className="font-mono text-[10px]">
          {r.status}
        </Badge>
      </td>
      <td className="px-2 py-1.5 tabular-nums text-muted-foreground" dir="ltr">
        {duration}
      </td>
      <td
        className="max-w-[260px] truncate px-2 py-1.5 text-muted-foreground"
        dir="ltr"
        title={r.return_message ?? undefined}
      >
        {r.return_message ?? "—"}
      </td>
    </tr>
  );
}

function RespRow({ r, locale }: { r: CronHttpResponse; locale: string }) {
  const bad = (r.status_code ?? 0) >= 400 || r.timed_out || !!r.error_msg;
  const codeCls = bad ? "text-destructive" : "text-emerald-600";
  const bodyText = r.error_msg ?? r.content_preview ?? "—";
  return (
    <tr className="border-t align-top">
      <td className="px-2 py-1.5" dir="ltr">
        {fmt(r.created, locale)}
      </td>
      <td className={"px-2 py-1.5 font-mono tabular-nums " + codeCls} dir="ltr">
        {r.timed_out ? "TIMEOUT" : (r.status_code ?? "—")}
      </td>
      <td
        className="max-w-[320px] truncate px-2 py-1.5 text-muted-foreground"
        dir="ltr"
        title={bodyText}
      >
        {bodyText}
      </td>
    </tr>
  );
}
