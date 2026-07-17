import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listMyOrganizations } from "@/lib/organizations.functions";
import { createProperty } from "@/lib/properties.functions";
import { can, type OrgRole } from "@/lib/permissions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/properties/new")({
  head: () => sectionHead({ section: "dashboard", entityAr: "عقار جديد", entityEn: "New Property", path: "/dashboard/properties/new" }),
  component: NewProperty,
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

function NewProperty() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canCreate = can.createProperty(role);

  const [form, setForm] = useState({
    title_ar: "",
    title_en: "",
    description_ar: "",
    description_en: "",
    property_type: "apartment" as (typeof TYPES)[number],
    listing_type: "sale" as "sale" | "rent",
    status: "available" as (typeof STATUSES)[number],
    price: "",
    currency: "SAR",
    area_sqm: "",
    bedrooms: "",
    bathrooms: "",
    city: "",
    address: "",
    cover_image_url: "",
  });

  const setF = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      if (!org) throw new Error("No organization");
      return createProperty({
        data: {
          org_id: org.id,
          title_ar: form.title_ar,
          title_en: form.title_en,
          description_ar: form.description_ar || null,
          description_en: form.description_en || null,
          property_type: form.property_type,
          listing_type: form.listing_type,
          status: form.status,
          price: Number(form.price),
          currency: form.currency,
          area_sqm: form.area_sqm ? Number(form.area_sqm) : null,
          bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
          city: form.city || null,
          address: form.address || null,
          cover_image_url: form.cover_image_url || null,
        },
      });
    },
    onSuccess: async () => {
      toast.success("✓");
      await qc.invalidateQueries({ queryKey: ["properties"] });
      nav({ to: "/dashboard/properties" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/dashboard/properties">
          <ArrowLeft className="me-2 size-4" />
          {t("common.back")}
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">{t("properties.form.title")}</h1>

      {!orgsQ.isLoading && !canCreate ? (
        <div className="mt-6 surface-card p-6 text-sm text-muted-foreground">
          {t("common.forbidden", {
            defaultValue: "You don't have permission to create properties.",
          })}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="mt-6 grid gap-4 surface-card p-6 sm:grid-cols-2"
        >
          <Field label={t("properties.form.titleEn")}>
            <Input
              required
              value={form.title_en}
              onChange={(e) => setF("title_en", e.target.value)}
            />
          </Field>
          <Field label={t("properties.form.titleAr")}>
            <Input
              required
              dir="rtl"
              value={form.title_ar}
              onChange={(e) => setF("title_ar", e.target.value)}
            />
          </Field>

          <Field label={t("properties.form.descriptionEn")} className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.description_en}
              onChange={(e) => setF("description_en", e.target.value)}
            />
          </Field>
          <Field label={t("properties.form.descriptionAr")} className="sm:col-span-2">
            <Textarea
              rows={3}
              dir="rtl"
              value={form.description_ar}
              onChange={(e) => setF("description_ar", e.target.value)}
            />
          </Field>

          <Field label={t("properties.form.type")}>
            <Select
              value={form.property_type}
              onValueChange={(v) => setF("property_type", v as (typeof TYPES)[number])}
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
          </Field>
          <Field label={t("properties.form.listingType")}>
            <Select
              value={form.listing_type}
              onValueChange={(v) => setF("listing_type", v as "sale" | "rent")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sale">{t("properties.listingTypes.sale")}</SelectItem>
                <SelectItem value="rent">{t("properties.listingTypes.rent")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("properties.form.status")}>
            <Select
              value={form.status}
              onValueChange={(v) => setF("status", v as (typeof STATUSES)[number])}
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
          </Field>
          <Field label={t("properties.form.currency")}>
            <Input
              value={form.currency}
              onChange={(e) => setF("currency", e.target.value.toUpperCase())}
              maxLength={6}
            />
          </Field>

          <Field label={t("properties.form.price")}>
            <Input
              type="number"
              min={0}
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setF("price", e.target.value)}
            />
          </Field>
          <Field label={t("properties.form.area")}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.area_sqm}
              onChange={(e) => setF("area_sqm", e.target.value)}
            />
          </Field>
          <Field label={t("properties.form.bedrooms")}>
            <Input
              type="number"
              min={0}
              step="1"
              value={form.bedrooms}
              onChange={(e) => setF("bedrooms", e.target.value)}
            />
          </Field>
          <Field label={t("properties.form.bathrooms")}>
            <Input
              type="number"
              min={0}
              step="1"
              value={form.bathrooms}
              onChange={(e) => setF("bathrooms", e.target.value)}
            />
          </Field>
          <Field label={t("properties.form.city")}>
            <Input value={form.city} onChange={(e) => setF("city", e.target.value)} />
          </Field>
          <Field label={t("properties.form.address")}>
            <Input value={form.address} onChange={(e) => setF("address", e.target.value)} />
          </Field>
          <Field label={t("properties.form.coverImage")} className="sm:col-span-2">
            <Input
              type="url"
              placeholder="https://…"
              value={form.cover_image_url}
              onChange={(e) => setF("cover_image_url", e.target.value)}
            />
          </Field>

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" asChild>
              <Link to="/dashboard/properties">{t("properties.form.cancel")}</Link>
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
              {t("properties.form.submit")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({
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
