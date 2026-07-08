import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BarChart3, Gavel, Loader2, Pencil, Plus, Send, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { listAuctions, publishAuction, cancelAuction } from "@/lib/auctions.functions";
import {
  useAuctionsListRealtime,
  pollingIntervalFor,
  usePollingDiagnostics,
  usePollingObserver,
  useRealtimePollingConfig,
} from "@/hooks/use-auctions-realtime";
import { RealtimeStatusBadge } from "@/components/realtime-status-badge";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/auctions")({
  head: () => sectionHead({ section: "dashboard", entityAr: "المزادات", entityEn: "Auctions", path: "/dashboard/auctions" }),
  component: DashboardAuctions,
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
          {i18n.t("auctions.common.retry")}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{i18n.t("auctions.common.notFound")}</div>,
});

function DashboardAuctions() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org as { id: string; name: string } | undefined;

  const listFn = useServerFn(listAuctions);
  const publishFn = useServerFn(publishAuction);
  const cancelFn = useServerFn(cancelAuction);

  // Retry policy: 6 attempts, 1s→20s backoff. When exhausted, block publish/cancel until manual retry.
  const rt = useAuctionsListRealtime(org?.id, {
    retry: { maxAttempts: 6, initialDelayMs: 1000, maxDelayMs: 20_000 },
  });

  // When realtime is connected, rely on live updates + a slow 60s safety poll.
  // When degraded, fall back to faster polling so the list stays fresh.
  const cfg = useRealtimePollingConfig();
  const pollMs = pollingIntervalFor(rt.status, {
    connected: 60_000,
    disabled: 30_000,
    reconnecting: 5_000,
    failed: 15_000,
    ...cfg,
  });

  const q = useQuery({
    queryKey: ["auctions", "mine", org?.id],
    queryFn: () => listFn({ data: { scope: "mine", orgId: org!.id } }),
    enabled: !!org?.id,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  // Log polling start/stop + per-fetch/error against the same channel key.
  const pollDiag = usePollingDiagnostics(`auctions-list:${org?.id ?? "none"}`, pollMs);
  usePollingObserver(pollDiag, q, "auctions-list");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["auctions", "mine", org?.id] });

  const publish = useMutation({
    mutationFn: (id: string) => {
      if (rt.isBlocked) throw new Error(t("auctions.toast.rtBlocked"));
      return publishFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success(t("auctions.toast.publishedShort"));
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? t("auctions.toast.genericFailed")),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => {
      if (rt.isBlocked) throw new Error(t("auctions.toast.rtBlocked"));
      return cancelFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success(t("auctions.toast.cancelledShort"));
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? t("auctions.toast.genericFailed")),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <Gavel className="size-6 text-primary" /> {t("auctions.dashboard.title")}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{t("auctions.dashboard.subtitle")}</p>
            <RealtimeStatusBadge status={rt.status} onRetry={rt.retry} pollingMs={pollMs} />
          </div>
        </div>
        {org && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/dashboard/auctions/audit">{t("auctions.dashboard.auditLog")}</Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/dashboard/auctions/reports">
                <BarChart3 className="size-4" /> {t("auctions.dashboard.reports")}
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link to="/dashboard/auctions/new">
                <Plus className="size-4" /> {t("auctions.dashboard.newAuction")}
              </Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("auctions.dashboard.myAuctions")}</CardTitle>
          <CardDescription>{t("auctions.dashboard.autoTick")}</CardDescription>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (q.data?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("auctions.common.empty")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("auctions.common.columns.title")}</TableHead>
                  <TableHead>{t("auctions.common.columns.status")}</TableHead>
                  <TableHead>{t("auctions.common.columns.starting")}</TableHead>
                  <TableHead>{t("auctions.common.columns.highest")}</TableHead>
                  <TableHead>{t("auctions.common.columns.start")}</TableHead>
                  <TableHead>{t("auctions.common.columns.end")}</TableHead>
                  <TableHead className="text-end">{t("auctions.common.columns.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data ?? []).map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link className="hover:underline" to="/auctions/$id" params={{ id: a.id }}>
                        {a.title_ar}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {Number(a.starting_price).toLocaleString()} {a.currency}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {a.current_high ? Number(a.current_high).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(a.start_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(a.end_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-end">
                      {["draft", "scheduled"].includes(a.status) && (
                        <Button asChild size="sm" variant="ghost" title={t("auctions.dashboard.editRules")}>
                          <Link to="/dashboard/auctions/$id/edit" params={{ id: a.id }}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                      )}
                      {a.status === "draft" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => publish.mutate(a.id)}
                          disabled={rt.isBlocked || publish.isPending}
                          title={rt.isBlocked ? t("auctions.toast.rtBlockedTitle") : t("auctions.toast.publishTitle")}
                        >
                          <Send className="size-4" />
                        </Button>
                      )}
                      {["draft", "scheduled", "live"].includes(a.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(t("auctions.dashboard.confirmCancelShort"))) cancel.mutate(a.id);
                          }}
                          disabled={rt.isBlocked || cancel.isPending}
                          title={
                            rt.isBlocked ? t("auctions.toast.rtBlockedTitle") : t("auctions.toast.cancelTitle")
                          }
                        >
                          <XCircle className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live") return <Badge className="bg-primary">{i18n.t("auctions.common.status.live")}</Badge>;
  if (status === "scheduled") return <Badge variant="secondary">{i18n.t("auctions.common.status.scheduled")}</Badge>;
  if (status === "ended") return <Badge variant="outline">{i18n.t("auctions.common.status.ended")}</Badge>;
  if (status === "cancelled") return <Badge variant="destructive">{i18n.t("auctions.common.status.cancelled")}</Badge>;
  return <Badge variant="outline">{i18n.t("auctions.common.status.draft")}</Badge>;
}
