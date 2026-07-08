import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listOrgListings,
  adminUpsertListing,
  adminDeleteListing,
  listApplications,
  updateApplicationStatus,
  seedAppfolioDemo,
} from "@/lib/appfolio.functions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leasing")({
  component: LeasingPage,
});

const emptyForm = {
  id: undefined as string | undefined,
  slug: "",
  title: "",
  description: "",
  price: 0,
  currency: "SAR",
  bedrooms: 0,
  bathrooms: 0,
  area: 0,
  city: "",
  heroImage: "",
  published: false,
};

function LeasingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { orgId } = useCurrentOrg();
  const listingsQ = useQuery({
    queryKey: ["leasing", "listings", orgId],
    queryFn: () => listOrgListings({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const appsQ = useQuery({
    queryKey: ["leasing", "apps", orgId],
    queryFn: () => listApplications({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const upsert = useMutation({
    mutationFn: () => adminUpsertListing({ data: { ...form, orgId: orgId! } }),
    onSuccess: () => {
      toast.success(t("leasing.toast.saved"));
      setOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["leasing", "listings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => adminDeleteListing({ data: { id } }),
    onSuccess: () => {
      toast.success(t("leasing.toast.deleted"));
      qc.invalidateQueries({ queryKey: ["leasing", "listings"] });
    },
  });
  const updateApp = useMutation({
    mutationFn: (input: { id: string; status: string }) => updateApplicationStatus({ data: input }),
    onSuccess: () => {
      toast.success(t("leasing.toast.updated"));
      qc.invalidateQueries({ queryKey: ["leasing", "apps"] });
    },
  });
  const seed = useMutation({
    mutationFn: () => seedAppfolioDemo(),
    onSuccess: () => {
      toast.success(t("leasing.toast.seeded"));
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("leasing.title")}</h1>
          <p className="text-muted-foreground">{t("leasing.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
            <Sparkles className="size-4 mr-1" />
            {t("leasing.actions.seedDemo")}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setForm(emptyForm)}>
                <Plus className="size-4 mr-1" />
                {t("leasing.actions.newListing")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {form.id ? t("leasing.actions.editListing") : t("leasing.actions.newListing")}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label>{t("leasing.fields.title")}</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("leasing.fields.slug")}</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>{t("leasing.fields.city")}</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("leasing.fields.price")}</Label>
                  <Input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t("leasing.fields.currency")}</Label>
                  <Input
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("leasing.fields.bedrooms")}</Label>
                  <Input
                    type="number"
                    value={form.bedrooms}
                    onChange={(e) => setForm({ ...form, bedrooms: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t("leasing.fields.bathrooms")}</Label>
                  <Input
                    type="number"
                    value={form.bathrooms}
                    onChange={(e) => setForm({ ...form, bathrooms: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>{t("leasing.fields.area")}</Label>
                  <Input
                    type="number"
                    value={form.area}
                    onChange={(e) => setForm({ ...form, area: Number(e.target.value) })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>{t("leasing.fields.heroImage")}</Label>
                  <Input
                    value={form.heroImage}
                    onChange={(e) => setForm({ ...form, heroImage: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>{t("leasing.fields.description")}</Label>
                  <Textarea
                    value={form.description}
                    rows={4}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 md:col-span-2">
                  <Switch
                    checked={form.published}
                    onCheckedChange={(v) => setForm({ ...form, published: v })}
                  />{" "}
                  {t("leasing.fields.published")}
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t("leasing.actions.cancel")}
                </Button>
                <Button
                  onClick={() => upsert.mutate()}
                  disabled={!form.title || !form.slug || upsert.isPending}
                >
                  {t("leasing.actions.save")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="listings">
        <TabsList>
          <TabsTrigger value="listings">{t("leasing.tabs.listings")}</TabsTrigger>
          <TabsTrigger value="applications">{t("leasing.tabs.applications")}</TabsTrigger>
        </TabsList>

        <TabsContent value="listings">
          <Card>
            <CardContent className="p-4">
              {listingsQ.isLoading ? (
                <Loader2 className="animate-spin" />
              ) : (listingsQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leasing.empty.listings")}</p>
              ) : (
                <div className="space-y-2">
                  {(listingsQ.data ?? []).map((l: any) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between border rounded p-3"
                    >
                      <div>
                        <div className="font-medium">{l.title}</div>
                        <div className="text-xs text-muted-foreground">
                          /{l.slug} · {l.city ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={l.published ? "default" : "secondary"}>
                          {l.published ? t("leasing.status.published") : t("leasing.status.draft")}
                        </Badge>
                        <div className="font-semibold">
                          {Number(l.price).toLocaleString()} {l.currency}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setForm({
                              id: l.id,
                              slug: l.slug,
                              title: l.title,
                              description: l.description ?? "",
                              price: Number(l.price),
                              currency: l.currency,
                              bedrooms: l.bedrooms ?? 0,
                              bathrooms: l.bathrooms ?? 0,
                              area: Number(l.area ?? 0),
                              city: l.city ?? "",
                              heroImage: l.hero_image ?? "",
                              published: l.published,
                            });
                            setOpen(true);
                          }}
                        >
                          {t("leasing.actions.edit")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => del.mutate(l.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications">
          <Card>
            <CardContent className="p-4">
              {appsQ.isLoading ? (
                <Loader2 className="animate-spin" />
              ) : (appsQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leasing.empty.applications")}</p>
              ) : (
                <div className="space-y-2">
                  {(appsQ.data ?? []).map((a: any) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between border rounded p-3"
                    >
                      <div>
                        <div className="font-medium">
                          {a.applicant_name}{" "}
                          <span className="text-muted-foreground font-normal">
                            → {a.listings?.title}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.email} · {a.phone ?? "—"} · {t("leasing.applications.incomeLabel")}{" "}
                          {a.monthly_income ?? "—"}
                        </div>
                      </div>
                      <Select
                        value={a.status}
                        onValueChange={(v) => updateApp.mutate({ id: a.id, status: v })}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">
                            {t("leasing.applications.status.new")}
                          </SelectItem>
                          <SelectItem value="reviewing">
                            {t("leasing.applications.status.reviewing")}
                          </SelectItem>
                          <SelectItem value="approved">
                            {t("leasing.applications.status.approved")}
                          </SelectItem>
                          <SelectItem value="rejected">
                            {t("leasing.applications.status.rejected")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
