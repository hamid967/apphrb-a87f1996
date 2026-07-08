import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Gavel, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { createAuction } from "@/lib/auctions.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/auctions/new")({
  head: () => sectionHead({ section: "dashboard", entityAr: "مزاد جديد", entityEn: "New Auction", path: "/dashboard/auctions/new" }),
  component: NewAuctionPage,
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

function NewAuctionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const org = orgsQ.data?.[0]?.org as { id: string; name: string } | undefined;
  const createFn = useServerFn(createAuction);

  const [form, setForm] = useState({
    title_ar: "",
    title_en: "",
    description: "",
    starting_price: "100000",
    reserve_price: "",
    min_increment: "1000",
    start_at: "",
    end_at: "",
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          orgId: org!.id,
          title_ar: form.title_ar.trim(),
          title_en: form.title_en.trim(),
          description: form.description.trim() || null,
          starting_price: Number(form.starting_price),
          reserve_price: form.reserve_price ? Number(form.reserve_price) : null,
          min_increment: Number(form.min_increment),
          start_at: new Date(form.start_at).toISOString(),
          end_at: new Date(form.end_at).toISOString(),
        },
      }),
    onSuccess: (row) => {
      toast.success(t("auctions.toast.created"));
      navigate({ to: "/dashboard/auctions/$id/edit", params: { id: (row as any).id } });
    },
    onError: (e: any) => toast.error(e?.message ?? t("auctions.toast.createFailed")),
  });

  const disabled =
    create.isPending ||
    !org?.id ||
    !form.title_ar.trim() ||
    !form.title_en.trim() ||
    !form.start_at ||
    !form.end_at ||
    Number(form.starting_price) < 0 ||
    Number(form.min_increment) <= 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
          <Gavel className="size-6 text-primary" /> {t("auctions.newAuction.title")}
        </h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/auctions">
            <ArrowRight className="size-4 me-1" /> {t("auctions.common.back")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("auctions.newAuction.detailsTitle")}</CardTitle>
          <CardDescription>{t("auctions.newAuction.detailsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>{t("auctions.common.titleAr")}</Label>
              <Input
                value={form.title_ar}
                onChange={(e) => setForm({ ...form, title_ar: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("auctions.common.titleEn")}</Label>
              <Input
                value={form.title_en}
                onChange={(e) => setForm({ ...form, title_en: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{t("auctions.common.description")}</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 text-sm font-medium">{t("auctions.common.biddingRules")}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <Label>{t("auctions.common.startingPriceSar")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.starting_price}
                  onChange={(e) => setForm({ ...form, starting_price: e.target.value })}
                />
              </div>
              <div>
                <Label>{t("auctions.common.reservePrice")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.reserve_price}
                  onChange={(e) => setForm({ ...form, reserve_price: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("auctions.common.reserveOptionalHint")}
                </p>
              </div>
              <div>
                <Label>{t("auctions.common.minIncrementLabel")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.min_increment}
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
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
              />
            </div>
            <div>
              <Label>{t("auctions.common.endAt")}</Label>
              <Input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" asChild>
              <Link to="/dashboard/auctions">{t("auctions.common.cancel")}</Link>
            </Button>
            <Button onClick={() => create.mutate()} disabled={disabled}>
              {create.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
              {t("auctions.common.saveAsDraft")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
