import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Gavel, Loader2, Send, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAuction,
  updateAuctionRules,
  publishAuction,
  cancelAuction,
} from "@/lib/auctions.functions";

export const Route = createFileRoute("/_authenticated/dashboard/auctions/$id/edit")({
  head: ({ params }) => detailHead({ entityAr: 'مزاد', entityEn: 'Auction', id: String(params.id), path: `/dashboard/auctions/${params.id}/edit`, kind: 'article' }),
  component: EditAuctionRulesPage,
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

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

function EditAuctionRulesPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const getFn = useServerFn(getAuction);
  const updateFn = useServerFn(updateAuctionRules);
  const publishFn = useServerFn(publishAuction);
  const cancelFn = useServerFn(cancelAuction);

  const q = useQuery({
    queryKey: ["auction", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [form, setForm] = useState({
    title_ar: "",
    title_en: "",
    description: "",
    reserve_price: "",
    min_increment: "1000",
    start_at: "",
    end_at: "",
  });

  useEffect(() => {
    const a: any = q.data?.auction;
    if (!a) return;
    setForm({
      title_ar: a.title_ar ?? "",
      title_en: a.title_en ?? "",
      description: a.description ?? "",
      reserve_price: a.reserve_price != null ? String(a.reserve_price) : "",
      min_increment: a.min_increment != null ? String(a.min_increment) : "1000",
      start_at: toLocalInput(a.start_at),
      end_at: toLocalInput(a.end_at),
    });
  }, [q.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["auction", id] });

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id,
          title_ar: form.title_ar.trim(),
          title_en: form.title_en.trim(),
          description: form.description.trim() || null,
          reserve_price: form.reserve_price ? Number(form.reserve_price) : null,
          min_increment: Number(form.min_increment),
          start_at: new Date(form.start_at).toISOString(),
          end_at: new Date(form.end_at).toISOString(),
        },
      }),
    onSuccess: () => {
      toast.success(t("auctions.toast.saved"));
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? t("auctions.toast.saveFailed")),
  });

  const publish = useMutation({
    mutationFn: () => publishFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("auctions.toast.published"));
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? t("auctions.toast.publishFailed")),
  });

  const cancelM = useMutation({
    mutationFn: () => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success(t("auctions.toast.cancelled"));
      navigate({ to: "/dashboard/auctions" });
    },
    onError: (e: any) => toast.error(e?.message ?? t("auctions.toast.cancelFailed")),
  });

  if (q.isLoading)
    return (
      <div className="grid place-items-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  const a: any = q.data?.auction;
  if (!a) return <div className="p-6">{t("auctions.common.auctionNotFound")}</div>;

  const editable = a.status === "draft" || a.status === "scheduled";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
          <Gavel className="size-6 text-primary" /> {t("auctions.dashboard.editRulesTitle")}
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/auctions">
            <ArrowRight className="size-4 me-1" /> {t("auctions.common.back")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{a.title_ar}</CardTitle>
            <CardDescription>
              {t("auctions.dashboard.currentStatus")}{" "}
              <Badge variant={a.status === "live" ? "default" : "outline"}>
                {statusLabel(a.status)}
              </Badge>
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {a.status === "draft" && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => publish.mutate()}
                disabled={publish.isPending}
              >
                {publish.isPending ? (
                  <Loader2 className="me-1 size-4 animate-spin" />
                ) : (
                  <Send className="me-1 size-4" />
                )}
                {t("auctions.dashboard.publish")}
              </Button>
            )}
            {["draft", "scheduled", "live"].includes(a.status) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm(t("auctions.dashboard.confirmCancel"))) cancelM.mutate();
                }}
                disabled={cancelM.isPending}
              >
                <XCircle className="me-1 size-4 text-destructive" /> {t("auctions.common.cancel")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!editable && (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-warning dark:text-warning">
              {t("auctions.dashboard.editRulesLocked")}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>{t("auctions.common.titleAr")}</Label>
              <Input
                value={form.title_ar}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("auctions.common.titleEn")}</Label>
              <Input
                value={form.title_en}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, title_en: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>{t("auctions.common.description")}</Label>
            <Textarea
              rows={3}
              value={form.description}
              disabled={!editable}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 text-sm font-medium">{t("auctions.common.biddingRules")}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>{t("auctions.common.startingPriceLong")}</Label>
                <Input
                  value={`${Number(a.starting_price).toLocaleString()} ${a.currency}`}
                  disabled
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("auctions.common.cannotChangeAfterCreate")}
                </p>
              </div>
              <div>
                <Label>{t("auctions.common.reservePrice")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.reserve_price}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, reserve_price: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("auctions.common.reserveSecretHint")}</p>
              </div>
              <div>
                <Label>{t("auctions.common.minIncrementLabel")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.min_increment}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, min_increment: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>{t("auctions.common.startAt")}</Label>
              <Input
                type="datetime-local"
                value={form.start_at}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("auctions.common.endAt")}</Label>
              <Input
                type="datetime-local"
                value={form.end_at}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
              />
            </div>
          </div>

          {editable && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" asChild>
                <Link to="/dashboard/auctions">{t("auctions.common.cancel")}</Link>
              </Button>
              <Button
                onClick={() => save.mutate()}
                disabled={
                  save.isPending ||
                  !form.title_ar.trim() ||
                  !form.title_en.trim() ||
                  !form.start_at ||
                  !form.end_at ||
                  Number(form.min_increment) <= 0
                }
              >
                {save.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
                {t("auctions.common.saveChanges")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case "draft":
      return i18n.t("auctions.common.status.draft");
    case "scheduled":
      return i18n.t("auctions.common.status.scheduled");
    case "live":
      return i18n.t("auctions.common.status.live");
    case "ended":
      return i18n.t("auctions.common.status.ended");
    case "cancelled":
      return i18n.t("auctions.common.status.cancelled");
    default:
      return s;
  }
}
