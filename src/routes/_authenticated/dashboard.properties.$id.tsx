import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { detailHead } from "@/lib/detail-og-head";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listUnitsByProperty, quickCreateUnitForProperty } from "@/lib/units.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listMyOrganizations } from "@/lib/organizations.functions";
import {
  getProperty,
  updateProperty,
  deleteProperty,
  archiveProperty,
} from "@/lib/properties.functions";
import { PropertyImageUploader } from "@/components/property-image-uploader";
import { can, type OrgRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/dashboard/properties/$id")({
  head: ({ params }) => detailHead({ entityAr: 'عقار', entityEn: 'Property', id: String(params.id), path: `/dashboard/properties/${params.id}`, kind: 'listing' }),
  component: PropertyDetails,
});

const TYPES = [
  "apartment",
  "villa",
  "office",
  "land",
  "shop",
  "warehouse",
  "building",
  "farm",
  "chalet",
  "other",
] as const;
const STATUSES = ["available", "reserved", "sold", "rented", "inactive"] as const;

function PropertyDetails() {
  const { id } = Route.useParams();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const nav = useNavigate();
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const propQ = useQuery({
    queryKey: ["property", id],
    queryFn: () => getProperty({ data: { id } }),
  });

  const membership = useMemo(
    () => orgsQ.data?.find((m) => m.org.id === propQ.data?.org_id),
    [orgsQ.data, propQ.data?.org_id],
  );
  const role = membership?.role as OrgRole | undefined;
  const canEdit = can.editProperty(role);
  const canArchive = can.archiveProperty(role);
  const canDelete = can.deleteProperty(role);

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (propQ.isLoading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (propQ.isError || !propQ.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center text-sm text-muted-foreground">
        {propQ.error instanceof Error ? propQ.error.message : "Not found"}
      </div>
    );
  }

  const p = propQ.data;
  const title = isAr ? p.title_ar : p.title_en;
  const description = isAr ? p.description_ar : p.description_en;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/properties">
            <ArrowLeft className="me-2 size-4" />
            {t("common.back")}
          </Link>
        </Button>
        {(canEdit || canDelete || canArchive) && !editing && (
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="me-2 size-4" />
                {t("common.edit")}
              </Button>
            )}
            {canArchive && propQ.data?.status !== "inactive" && (
              <Button variant="outline" size="sm" onClick={() => setConfirmArchive(true)}>
                <Archive className="me-2 size-4" />
                {t("common.archive")}
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="me-2 size-4" />
                {t("common.delete")}
              </Button>
            )}
          </div>
        )}
        {editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            <X className="me-2 size-4" />
            {t("common.cancel")}
          </Button>
        )}
      </div>

      {!editing ? (
        <article className="mt-4 space-y-6">
          <div className="overflow-hidden surface-card">
            <div className="aspect-[16/9] w-full bg-muted">
              {p.cover_image_url ? (
                <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">
                  —
                </div>
              )}
            </div>
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{t(`properties.listingTypes.${p.listing_type}`)}</Badge>
                <Badge variant="secondary">{t(`properties.types.${p.property_type}`)}</Badge>
                <Badge variant="outline">{t(`properties.statuses.${p.status}`)}</Badge>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {[p.city, p.address].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="mt-4 text-3xl font-semibold tabular-nums">
                {Number(p.price).toLocaleString(isAr ? "ar" : "en")}{" "}
                <span className="text-base text-muted-foreground">{p.currency}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 surface-card p-6 sm:grid-cols-3">
            <Stat label={t("properties.form.area")} value={p.area_sqm ?? "—"} />
            <Stat label={t("properties.form.bedrooms")} value={p.bedrooms ?? "—"} />
            <Stat label={t("properties.form.bathrooms")} value={p.bathrooms ?? "—"} />
          </div>

          {description && (
            <div className="surface-card p-6">
              <h2 className="text-sm font-medium text-muted-foreground">
                {isAr ? t("properties.form.descriptionAr") : t("properties.form.descriptionEn")}
              </h2>
              <p
                dir={isAr ? "rtl" : "ltr"}
                className="mt-2 whitespace-pre-wrap text-sm leading-relaxed"
              >
                {description}
              </p>
            </div>
          )}

          <UnitsSection propertyId={id} canEdit={!!canEdit} currency={p.currency ?? "SAR"} />
        </article>
      ) : (
        <EditForm
          initial={p}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            await qc.invalidateQueries({ queryKey: ["property", id] });
            await qc.invalidateQueries({ queryKey: ["properties"] });
            setEditing(false);
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")}?</AlertDialogTitle>
            <AlertDialogDescription>{title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteProperty({ data: { id } });
                  await qc.invalidateQueries({ queryKey: ["properties"] });
                  toast.success("✓");
                  nav({ to: "/dashboard/properties" });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Error");
                }
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.archive")}?</AlertDialogTitle>
            <AlertDialogDescription>{title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await archiveProperty({ data: { id } });
                  await qc.invalidateQueries({ queryKey: ["property", id] });
                  await qc.invalidateQueries({ queryKey: ["properties"] });
                  toast.success("✓");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Error");
                }
              }}
            >
              {t("common.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}

type PropRow = Awaited<ReturnType<typeof getProperty>>;

function EditForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: PropRow;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    title_ar: initial.title_ar,
    title_en: initial.title_en,
    description_ar: initial.description_ar ?? "",
    description_en: initial.description_en ?? "",
    property_type: initial.property_type as (typeof TYPES)[number],
    listing_type: initial.listing_type as "sale" | "rent",
    status: initial.status as (typeof STATUSES)[number],
    price: String(initial.price ?? ""),
    currency: initial.currency ?? "SAR",
    area_sqm: initial.area_sqm != null ? String(initial.area_sqm) : "",
    bedrooms: initial.bedrooms != null ? String(initial.bedrooms) : "",
    bathrooms: initial.bathrooms != null ? String(initial.bathrooms) : "",
    city: initial.city ?? "",
    address: initial.address ?? "",
    cover_image_url: initial.cover_image_url ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () =>
      updateProperty({
        data: {
          id: initial.id,
          title_ar: f.title_ar,
          title_en: f.title_en,
          description_ar: f.description_ar || null,
          description_en: f.description_en || null,
          property_type: f.property_type,
          listing_type: f.listing_type,
          status: f.status,
          price: Number(f.price),
          currency: f.currency,
          area_sqm: f.area_sqm ? Number(f.area_sqm) : null,
          bedrooms: f.bedrooms ? Number(f.bedrooms) : null,
          bathrooms: f.bathrooms ? Number(f.bathrooms) : null,
          city: f.city || null,
          address: f.address || null,
          cover_image_url: f.cover_image_url || null,
        },
      }),
    onSuccess: async () => {
      toast.success("✓");
      await onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="mt-4 grid gap-4 surface-card p-6 sm:grid-cols-2"
    >
      <F label={t("properties.form.titleEn")}>
        <Input required value={f.title_en} onChange={(e) => set("title_en", e.target.value)} />
      </F>
      <F label={t("properties.form.titleAr")}>
        <Input
          required
          dir="rtl"
          value={f.title_ar}
          onChange={(e) => set("title_ar", e.target.value)}
        />
      </F>
      <F label={t("properties.form.descriptionEn")} className="sm:col-span-2">
        <Textarea
          rows={3}
          value={f.description_en}
          onChange={(e) => set("description_en", e.target.value)}
        />
      </F>
      <F label={t("properties.form.descriptionAr")} className="sm:col-span-2">
        <Textarea
          rows={3}
          dir="rtl"
          value={f.description_ar}
          onChange={(e) => set("description_ar", e.target.value)}
        />
      </F>

      <F label={t("properties.form.type")}>
        <Select
          value={f.property_type}
          onValueChange={(v) => set("property_type", v as (typeof TYPES)[number])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((v) => (
              <SelectItem key={v} value={v}>
                {t(`properties.types.${v}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </F>
      <F label={t("properties.form.listingType")}>
        <Select
          value={f.listing_type}
          onValueChange={(v) => set("listing_type", v as "sale" | "rent")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sale">{t("properties.listingTypes.sale")}</SelectItem>
            <SelectItem value="rent">{t("properties.listingTypes.rent")}</SelectItem>
          </SelectContent>
        </Select>
      </F>
      <F label={t("properties.form.status")}>
        <Select
          value={f.status}
          onValueChange={(v) => set("status", v as (typeof STATUSES)[number])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((v) => (
              <SelectItem key={v} value={v}>
                {t(`properties.statuses.${v}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </F>
      <F label={t("properties.form.currency")}>
        <Input
          value={f.currency}
          onChange={(e) => set("currency", e.target.value.toUpperCase())}
          maxLength={6}
        />
      </F>
      <F label={t("properties.form.price")}>
        <Input
          type="number"
          min={0}
          step="0.01"
          required
          value={f.price}
          onChange={(e) => set("price", e.target.value)}
        />
      </F>
      <F label={t("properties.form.area")}>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={f.area_sqm}
          onChange={(e) => set("area_sqm", e.target.value)}
        />
      </F>
      <F label={t("properties.form.bedrooms")}>
        <Input
          type="number"
          min={0}
          step="1"
          value={f.bedrooms}
          onChange={(e) => set("bedrooms", e.target.value)}
        />
      </F>
      <F label={t("properties.form.bathrooms")}>
        <Input
          type="number"
          min={0}
          step="1"
          value={f.bathrooms}
          onChange={(e) => set("bathrooms", e.target.value)}
        />
      </F>
      <F label={t("properties.form.city")}>
        <Input value={f.city} onChange={(e) => set("city", e.target.value)} />
      </F>
      <F label={t("properties.form.address")}>
        <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
      </F>
      <F label={t("properties.form.coverImage")} className="sm:col-span-2">
        <PropertyImageUploader
          propertyId={initial.id}
          value={f.cover_image_url || null}
          onChange={(url) => set("cover_image_url", url ?? "")}
        />
      </F>

      <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

function F({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
