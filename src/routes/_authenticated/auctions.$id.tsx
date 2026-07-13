import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Gavel,
  History,
  LineChart as LineChartIcon,
  Loader2,
  Timer,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { getAuction, listAuctionBids, placeBid } from "@/lib/auctions.functions";
import {
  useAuctionRealtime,
  pollingIntervalFor,
  usePollingDiagnostics,
  usePollingObserver,
  useRealtimePollingConfig,
} from "@/hooks/use-auctions-realtime";
import { RealtimeStatusBadge } from "@/components/realtime-status-badge";
import { MotionLineChart } from "@/components/charts/motion-tremor";

export const Route = createFileRoute("/_authenticated/auctions/$id")({
  head: ({ params }) => detailHead({ entityAr: 'مزاد', entityEn: 'Auction', id: String(params.id), path: `/auctions/${params.id}`, kind: 'article' }),
  component: AuctionDetail,
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
  notFoundComponent: () => <div className="p-6">{i18n.t("auctions.common.auctionNotFound")}</div>,
});

function AuctionDetail() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetchOne = useServerFn(getAuction);
  const bidFn = useServerFn(placeBid);
  const listBidsFn = useServerFn(listAuctionBids);
  const [amount, setAmount] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime: new bids + auction status updates (+ toast on new bid).
  // Retry policy: 6 attempts, 1s→20s backoff, then block sensitive updates until manual retry.
  const rt = useAuctionRealtime(id, {
    retry: { maxAttempts: 6, initialDelayMs: 1000, maxDelayMs: 20_000 },
  });

  // Polling fallback: when realtime is unhealthy, auto-refetch on an interval.
  // Live updates come from realtime alone when connected → `refetchInterval: false`.
  // Admin overrides from app_settings win over the page-level default.
  const cfg = useRealtimePollingConfig();
  const pollMs = pollingIntervalFor(rt.status, { failed: 20_000, ...cfg });

  const q = useQuery({
    queryKey: ["auction", id],
    queryFn: () => fetchOne({ data: { id } }),
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });
  const historyQ = useQuery({
    queryKey: ["auction", id, "history"],
    queryFn: () => listBidsFn({ data: { auctionId: id, limit: 500 } }),
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
  });

  // Log polling start/stop + per-fetch/error against the same channel key.
  const pollDiag = usePollingDiagnostics(`auction:${id ?? "none"}`, pollMs);
  usePollingObserver(pollDiag, q, "auction");
  usePollingObserver(pollDiag, historyQ, "history");

  const bid = useMutation({
    mutationFn: () => {
      if (rt.isBlocked) {
        throw new Error(t("auctions.toast.rtBlockedBid"));
      }
      return bidFn({ data: { auctionId: id, amount: Number(amount) } });
    },
    onSuccess: () => {
      toast.success(t("auctions.toast.bidPlaced"));
      setAmount("");
    },
    onError: (e: any) => toast.error(e?.message ?? t("auctions.toast.bidFailed")),
  });

  const minNext = useMemo(() => {
    if (!q.data) return 0;
    const a = q.data.auction as any;
    return Number(a.current_high ?? a.starting_price - a.min_increment) + Number(a.min_increment);
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!q.data) return null;
  const a = q.data.auction as any;
  const bids = q.data.bids as Array<{
    id: string;
    amount: number;
    placed_at: string;
    bidder_id: string;
  }>;
  const remaining = a.status === "live" ? new Date(a.end_at).getTime() - now : 0;
  const canBid = a.status === "live" && remaining > 0;
  const history = (historyQ.data ?? []) as Array<{
    id: string;
    amount: number;
    placed_at: string;
    bidder_id: string;
  }>;
  const chartData = history.map((b, i) => ({
    idx: i + 1,
    time: new Date(b.placed_at).getTime(),
    label: new Date(b.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    amount: Number(b.amount),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/auctions">
            <ArrowLeft className="me-1 size-4" /> {t("auctions.common.backToAuctions")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Gavel className="size-5 text-primary" /> {a.title_ar}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{a.title_en}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={a.status} />
                <RealtimeStatusBadge status={rt.status} onRetry={rt.retry} pollingMs={pollMs} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {a.description && <p className="whitespace-pre-line text-sm">{a.description}</p>}
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
              <Stat
                label={t("auctions.common.startingPrice")}
                value={`${Number(a.starting_price).toLocaleString()} ${a.currency}`}
              />
              <Stat
                label={t("auctions.common.highestBid")}
                value={`${Number(a.current_high ?? a.starting_price).toLocaleString()} ${a.currency}`}
              />
              <Stat label={t("auctions.common.minIncrement")} value={`${Number(a.min_increment).toLocaleString()}`} />
              <Stat
                label={a.status === "live" ? t("auctions.common.status.live") : t("auctions.common.status.ended")}
                value={formatDuration(remaining)}
                icon={<Timer className="size-3.5" />}
              />
            </div>

            {canBid ? (
              <div className="rounded-lg border p-3">
                <Label className="text-xs">{t("auctions.common.yourBid")}</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={minNext}
                    step={a.min_increment}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={t("auctions.toast.minAmountPlaceholder", { amount: minNext.toLocaleString() })}
                  />
                  <Button
                    onClick={() => bid.mutate()}
                    disabled={bid.isPending || !amount || Number(amount) < minNext || rt.isBlocked}
                    title={rt.isBlocked ? t("auctions.toast.rtBlockedShort") : undefined}
                  >
                    {bid.isPending ? (
                      <Loader2 className="me-2 size-4 animate-spin" />
                    ) : (
                      <TrendingUp className="me-2 size-4" />
                    )}
                    {t("auctions.common.bid")}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("auctions.common.boundNote")}
                </p>
                {rt.isBlocked && (
                  <p className="mt-1 text-xs text-destructive">
                    {t("auctions.common.disconnected")}
                  </p>
                )}
              </div>
            ) : a.status === "ended" ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                انتهى المزاد.{" "}
                {a.winner_user_id
                  ? `العرض الفائز: ${Number(a.current_high).toLocaleString()} ${a.currency}`
                  : "لم يتم بلوغ سعر الاحتياطي."}
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                المزاد {a.status === "scheduled" ? "لم يبدأ بعد" : "غير متاح للمزايدة"}.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("auctions.common.latestBids")}</CardTitle>
          </CardHeader>
          <CardContent>
            {bids.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("auctions.common.noBidsYet")}</p>
            ) : (
              <ul className="max-h-[420px] space-y-1 overflow-y-auto text-sm">
                <AnimatePresence initial={false}>
                  {bids.map((b, i) => (
                    <motion.li
                      key={b.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`flex items-center justify-between rounded-md border p-2 ${i === 0 ? "border-primary/40 bg-primary/5" : ""}`}
                    >
                      <span className="tabular-nums font-medium">
                        {Number(b.amount).toLocaleString()} {a.currency}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(b.placed_at).toLocaleTimeString()}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChartIcon className="size-4 text-primary" /> {t("auctions.common.bidTimeline")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyQ.isLoading ? (
            <div className="grid h-56 place-items-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("auctions.common.noBidsToShow")}
            </p>
          ) : (
            <div className="h-64 w-full">
              <MotionLineChart
                data={chartData}
                index="label"
                categories={["amount"]}
                colors={["emerald"]}
                valueFormatter={(v) => `${Number(v).toLocaleString()} ${a.currency}`}
                showLegend={false}
                className="h-64 mt-2"
              />
            </div>

          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-primary" /> سجل جميع المزايدات ({history.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyQ.isLoading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("auctions.common.noBidHistory")}</p>
          ) : (
            <div className="relative ps-6">
              <div className="absolute inset-y-0 start-2 w-px bg-border" aria-hidden />
              <ul className="space-y-3">
                {[...history].reverse().map((b, i) => {
                  const isTop = i === 0;
                  const prev = history[history.length - 1 - i - 1];
                  const delta = prev ? Number(b.amount) - Number(prev.amount) : null;
                  return (
                    <li key={b.id} className="relative">
                      <span
                        className={`absolute -start-[18px] top-1.5 size-2.5 rounded-full ring-2 ring-background ${isTop ? "bg-primary" : "bg-muted-foreground/60"}`}
                      />
                      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border p-2.5 hover:bg-muted/40">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            #{history.length - i}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {Number(b.amount).toLocaleString()} {a.currency}
                          </span>
                          {delta !== null && delta > 0 && (
                            <span className="text-[11px] text-success tabular-nums">
                              +{delta.toLocaleString()}
                            </span>
                          )}
                          {isTop && <Badge className="bg-primary text-[10px]">{t("auctions.common.topBidder")}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            {new Date(b.placed_at).toLocaleString()}
                          </span>
                          <span className="ms-2 opacity-60">مزايد: {b.bidder_id.slice(0, 8)}…</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold tabular-nums">
        {icon}
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live") return <Badge className="bg-primary">{i18n.t("auctions.common.status.live")}</Badge>;
  if (status === "scheduled") return <Badge variant="secondary">{i18n.t("auctions.common.status.upcoming")}</Badge>;
  if (status === "ended") return <Badge variant="outline">{i18n.t("auctions.common.status.ended")}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function formatDuration(ms: number) {
  if (ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}ي ${h}س`;
  if (h > 0) return `${h}س ${m}د`;
  return `${m}د ${sec}ث`;
}
