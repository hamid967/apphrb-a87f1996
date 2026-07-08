import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Gavel, Timer, TrendingUp, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAuctions } from "@/lib/auctions.functions";

export const Route = createFileRoute("/_authenticated/auctions/")({
  head: () => ({
    meta: [
      { title: "المزادات — Aqari" },
      { name: "description", content: "مزادات عقارية مباشرة مع المزايدة اللحظية والعدّاد الزمني." },
    ],
  }),
  component: AuctionsList,
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

function AuctionsList() {
  const { t } = useTranslation();
  const fetchList = useServerFn(listAuctions);
  const q = useQuery({
    queryKey: ["auctions", "public"],
    queryFn: () => fetchList({ data: { scope: "public" } }),
    refetchInterval: 15_000,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <Gavel className="size-6 text-primary" /> {t("auctions.common.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auctions.common.subtitleHeader")}
          </p>
        </div>
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (q.data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("auctions.common.noneActive")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(q.data ?? []).map((a: any) => (
            <AuctionCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AuctionCard({ a }: { a: any }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const endMs = new Date(a.end_at).getTime();
  const startMs = new Date(a.start_at).getTime();
  const remaining =
    a.status === "live" ? endMs - now : a.status === "scheduled" ? startMs - now : 0;
  const label =
    a.status === "live"
      ? t("auctions.common.status.live")
      : a.status === "scheduled"
        ? t("auctions.common.status.upcoming")
        : t("auctions.common.status.ended");
  return (
    <Link to="/auctions/$id" params={{ id: a.id }} className="block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-base">{a.title_ar}</CardTitle>
            <StatusBadge status={a.status} />
          </div>
          <CardDescription className="text-xs">{a.title_en}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("auctions.common.highestBid")}</span>
            <span className="tabular-nums font-semibold">
              {(a.current_high ?? a.starting_price).toLocaleString()} {a.currency}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="size-3.5" /> {t("auctions.common.minIncrement")}{" "}
              {Number(a.min_increment).toLocaleString()}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Timer className="size-3.5" /> {label}: {formatDuration(remaining)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
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
