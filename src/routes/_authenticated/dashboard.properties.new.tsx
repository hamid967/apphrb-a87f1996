import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  head: () =>
    sectionHead({
      section: "dashboard",
      entityAr: "عقار جديد",
      entityEn: "New Property",
      path: "/dashboard/properties/new",
    }),
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

type FormState = {
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  property_type: (typeof TYPES)[number];
  listing_type: "sale" | "rent";
  status: (typeof STATUSES)[number];
  price: string;
  currency: string;
  area_sqm: string;
  bedrooms: string;
  bathrooms: string;
  city: string;
  address: string;
  cover_image_url: string;
};

const EMPTY: FormState = {
  title_ar: "",
  title_en: "",
  description_ar: "",
  description_en: "",
  property_type: "apartment",
  listing_type: "sale",
  status: "available",
  price: "",
  currency: "SAR",
  area_sqm: "",
  bedrooms: "",
  bathrooms: "",
  city: "",
  address: "",
  cover_image_url: "",
};

const DRAFT_KEY = (orgId: string) => `hbspro:draft:property:${orgId}`;

function NewProperty() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const nav = useNavigate();
  const qc = useQueryClient();
  const orgsQ = useQuery({ queryKey: ["my-organizations"], queryFn: () => listMyOrganizations() });
  const membership = orgsQ.data?.[0];
  const org = membership?.org;
  const role = membership?.role as OrgRole | undefined;
  const canCreate = can.createProperty(role);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Load draft when org resolves
  useEffect(() => {
    if (!org?.id || draftLoaded) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY(org.id));
      if (raw) {
        const parsed = JSON.parse(raw) as { form: FormState; step?: number; ts?: number };
        if (parsed?.form) {
          setForm({ ...EMPTY, ...parsed.form });
          if (parsed.step === 2 || parsed.step === 3) setStep(parsed.step);
          if (parsed.ts) setSavedAt(new Date(parsed.ts));
        }
      }
    } catch {
      /* ignore */
    }
    setDraftLoaded(true);
  }, [org?.id, draftLoaded]);

  // Autosave (debounced)
  useEffect(() => {
    if (!org?.id || !draftLoaded) return;
    const isEmpty = JSON.stringify(form) === JSON.stringify(EMPTY);
    if (isEmpty) return;
    const handle = setTimeout(() => {
      try {
        const ts = Date.now();
        localStorage.setItem(
          DRAFT_KEY(org.id),
          JSON.stringify({ form, step, ts }),
        );
        setSavedAt(new Date(ts));
      } catch {
        /* ignore quota */
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [form, step, org?.id, draftLoaded]);

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const clearDraft = () => {
    if (org?.id) localStorage.removeItem(DRAFT_KEY(org.id));
    setForm(EMPTY);
    setStep(1);
    setSavedAt(null);
    toast.success(isAr ? "تم مسح المسودة" : "Draft cleared");
  };

  const step1Valid = form.title_en.trim() && form.title_ar.trim() && Number(form.price) > 0;
  const step2Valid = true; // optional
  const canSubmit = step1Valid;

  const mut = useMutation({
    mutationFn: async () => {
      if (!org) throw new Error("No organization");
      return createProperty({
        data: {
          org_id: org.id,
          title_ar: form.title_ar.trim(),
          title_en: form.title_en.trim(),
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
      toast.success(isAr ? "تم إنشاء العقار" : "Property created");
      if (org?.id) localStorage.removeItem(DRAFT_KEY(org.id));
      await qc.invalidateQueries({ queryKey: ["properties"] });
      nav({ to: "/dashboard/properties" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const stepsMeta = useMemo(
    () => [
      { n: 1, label: isAr ? "الأساسيات" : "Basics" },
      { n: 2, label: isAr ? "التفاصيل والموقع" : "Details & Location" },
      { n: 3, label: isAr ? "الصور والمراجعة" : "Images & Review" },
    ],
    [isAr],
  );

  const progress = step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/dashboard/properties">
          <ArrowLeft className="me-2 size-4" />
          {t("common.back")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("properties.form.title")}
        </h1>
        {savedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {isAr ? "تم حفظ المسودة" : "Draft saved"} ·{" "}
              {savedAt.toLocaleTimeString(isAr ? "ar" : "en", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <Button size="sm" variant="ghost" onClick={clearDraft} className="h-7 px-2">
              <RotateCcw className="me-1 size-3" />
              {isAr ? "مسح" : "Clear"}
            </Button>
          </div>
        )}
      </div>

      {/* Stepper */}
      <div className="mt-6 space-y-3">
        <Progress value={progress} className="h-2" />
        <ol className="flex items-center justify-between text-sm">
          {stepsMeta.map((s) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <li key={s.n} className="flex items-center gap-2">
                <span
                  className={
                    "grid size-7 place-items-center rounded-full border text-xs font-medium transition " +
                    (done
                      ? "border-primary bg-primary text-primary-foreground"
                      : active
                        ? "border-primary text-primary"
                        : "border-muted text-muted-foreground")
                  }
                >
                  {done ? <Check className="size-3.5" /> : s.n}
                </span>
                <span
                  className={
                    active ? "font-medium" : done ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

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
            if (step < 3) {
              if (step === 1 && !step1Valid) {
                toast.error(
                  isAr
                    ? "الاسم بالعربي والإنجليزي والسعر مطلوبون"
                    : "AR/EN titles and price are required",
                );
                return;
              }
              setStep((s) => (s + 1) as 1 | 2 | 3);
              return;
            }
            if (!canSubmit) return;
            mut.mutate();
          }}
          className="mt-6 grid gap-4 surface-card p-6 sm:grid-cols-2"
        >
          {step === 1 && (
            <>
              <Field label={t("properties.form.titleEn")}>
                <Input
                  required
                  value={form.title_en}
                  onChange={(e) => setF("title_en", e.target.value)}
                  placeholder="e.g. Marina Tower Apt 12B"
                />
              </Field>
              <Field label={t("properties.form.titleAr")}>
                <Input
                  required
                  dir="rtl"
                  value={form.title_ar}
                  onChange={(e) => setF("title_ar", e.target.value)}
                  placeholder="مثال: شقة برج المارينا 12ب"
                />
              </Field>

              <Field label={t("properties.form.type")}>
                <Select
                  value={form.property_type}
                  onValueChange={(v) => setF("property_type", v as FormState["property_type"])}
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
                  onValueChange={(v) => setF("status", v as FormState["status"])}
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

              <Field label={t("properties.form.price")} className="sm:col-span-2">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={form.price}
                  onChange={(e) => setF("price", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label={t("properties.form.area")}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.area_sqm}
                  onChange={(e) => setF("area_sqm", e.target.value)}
                />
              </Field>
              <Field label={t("properties.form.city")}>
                <Input value={form.city} onChange={(e) => setF("city", e.target.value)} />
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
              <Field label={t("properties.form.address")} className="sm:col-span-2">
                <Input value={form.address} onChange={(e) => setF("address", e.target.value)} />
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
            </>
          )}

          {step === 3 && (
            <>
              <Field label={t("properties.form.coverImage")} className="sm:col-span-2">
                <Input
                  type="url"
                  placeholder="https://…"
                  value={form.cover_image_url}
                  onChange={(e) => setF("cover_image_url", e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {isAr
                    ? "يمكنك إضافة المزيد من الصور بعد إنشاء العقار."
                    : "You can add more images after creating the property."}
                </p>
              </Field>

              {form.cover_image_url && (
                <div className="sm:col-span-2 overflow-hidden rounded-lg border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={form.cover_image_url}
                    alt=""
                    className="h-48 w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}

              {/* Summary */}
              <div className="sm:col-span-2 grid gap-2 rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="font-medium">
                  {isAr ? "ملخّص المراجعة" : "Review summary"}
                </div>
                <SummaryRow
                  k={isAr ? "الاسم" : "Title"}
                  v={isAr ? form.title_ar || "—" : form.title_en || "—"}
                />
                <SummaryRow
                  k={isAr ? "النوع/العرض" : "Type / Listing"}
                  v={`${t(`properties.types.${form.property_type}`)} · ${t(`properties.listingTypes.${form.listing_type}`)}`}
                />
                <SummaryRow
                  k={isAr ? "السعر" : "Price"}
                  v={`${Number(form.price || 0).toLocaleString(isAr ? "ar" : "en")} ${form.currency}`}
                />
                <SummaryRow
                  k={isAr ? "المدينة" : "City"}
                  v={form.city || (isAr ? "غير محددة" : "—")}
                />
                <SummaryRow
                  k={isAr ? "المساحة" : "Area"}
                  v={form.area_sqm ? `${form.area_sqm} m²` : "—"}
                />
              </div>
            </>
          )}

          {/* Nav buttons */}
          <div className="sm:col-span-2 flex flex-wrap justify-between gap-2 pt-2">
            <div>
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                >
                  {isAr ? (
                    <>
                      <ArrowRight className="me-2 size-4" />
                      {isAr ? "السابق" : "Previous"}
                    </>
                  ) : (
                    <>
                      <ArrowLeft className="me-2 size-4" />
                      Previous
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" asChild>
                <Link to="/dashboard/properties">{t("properties.form.cancel")}</Link>
              </Button>
              {step < 3 ? (
                <Button type="submit">
                  {isAr ? "التالي" : "Next"}
                  {isAr ? (
                    <ArrowLeft className="ms-2 size-4" />
                  ) : (
                    <ArrowRight className="ms-2 size-4" />
                  )}
                </Button>
              ) : (
                <Button type="submit" disabled={mut.isPending || !canSubmit}>
                  {mut.isPending && <Loader2 className="me-2 size-4 animate-spin" />}
                  {t("properties.form.submit")}
                </Button>
              )}
            </div>
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

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
