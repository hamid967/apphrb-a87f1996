import { createFileRoute, Link } from "@tanstack/react-router";
import { getListingBySlug, submitApplication } from "@/lib/appfolio.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Bed, Bath, Ruler, MapPin, ArrowLeft, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { buildOgImageUrl } from "@/lib/og-image";

export const Route = createFileRoute("/listings/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["listing", params.slug],
      queryFn: () => getListingBySlug({ data: { slug: params.slug } }),
    }),
  head: ({ params, loaderData }) => {
    const l = loaderData as any;
    const url = `https://hrhbs.com/listings/${params.slug}`;
    if (!l) {
      return {
        meta: [{ title: "Listing unavailable — Aqari" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${l.title} — Aqari`;
    const desc = (
      l.description ??
      `${l.bedrooms ?? ""} bd · ${l.bathrooms ?? ""} ba property in ${l.city ?? ""}`
    )
      .toString()
      .slice(0, 160);
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:url", content: url },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    // Prefer the listing's own hero (best social preview);
    // fall back to a dynamically-rendered OG SVG built from the listing data.
    const image =
      l.hero_image ||
      buildOgImageUrl({
        title: l.title,
        subtitle: [l.city, l.bedrooms ? `${l.bedrooms} bd` : "", l.bathrooms ? `${l.bathrooms} ba` : ""]
          .filter(Boolean)
          .join(" · "),
        kind: "listing",
        lang: "ar",
      });
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
    return { meta, links: [{ rel: "canonical", href: url }] };
  },
  component: ListingDetail,
});

function ProductJsonLd({ l, url }: { l: any; url: string }) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.title,
    description: l.description ?? undefined,
    url,
  };
  if (l.hero_image) data.image = l.hero_image;
  if (l.price) {
    data.offers = {
      "@type": "Offer",
      price: String(l.price),
      priceCurrency: l.currency ?? "SAR",
      availability: "https://schema.org/InStock",
      url,
    };
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data)
          .replace(/</g, "\\u003c")
          .replace(/>/g, "\\u003e")
          .replace(/&/g, "\\u0026")
          .replace(/\u2028/g, "\\u2028")
          .replace(/\u2029/g, "\\u2029"),
      }}
    />
  );
}

function ListingDetail() {
  const { t } = useTranslation();
  const { slug } = Route.useParams();
  const q = useQuery({
    queryKey: ["listing", slug],
    queryFn: () => getListingBySlug({ data: { slug } }),
  });
  const l = q.data as any;

  const [form, setForm] = useState({
    applicantName: "",
    email: "",
    phone: "",
    monthlyIncome: "",
    employer: "",
    moveInDate: "",
    consent: false,
  });
  const submit = useMutation({
    mutationFn: () =>
      submitApplication({
        data: {
          listingId: l.id,
          orgId: l.org_id,
          applicantName: form.applicantName,
          email: form.email,
          phone: form.phone || undefined,
          monthlyIncome: form.monthlyIncome ? Number(form.monthlyIncome) : undefined,
          employer: form.employer || undefined,
          moveInDate: form.moveInDate || undefined,
          creditCheckConsent: form.consent,
        },
      }),
    onSuccess: () => toast.success(t("listings.apply.submitted")),
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading)
    return (
      <div className="p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!l) return <div className="p-8">{t("listings.notFound")}</div>;

  return (
    <div className="theme-luxe min-h-screen bg-gradient-to-b from-background to-muted/30">
      <ProductJsonLd l={l} url={`https://hrhbs.com/listings/${slug}`} />
      <header className="border-b bg-background/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto p-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/listings">
              <ArrowLeft className="size-4 mr-1" />
              {t("listings.allListings")}
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div>
          <div className="aspect-video rounded-lg overflow-hidden bg-muted mb-4">
            {l.hero_image && (
              <img src={l.hero_image} alt={l.title} className="w-full h-full object-cover" />
            )}
          </div>
          <h1 className="text-3xl font-bold">{l.title}</h1>
          {l.city && (
            <div className="text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="size-4" />
              {l.city}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-sm">
            {l.bedrooms != null && (
              <span className="flex items-center gap-1">
                <Bed className="size-4" />
                {l.bedrooms} {t("listings.beds")}
              </span>
            )}
            {l.bathrooms != null && (
              <span className="flex items-center gap-1">
                <Bath className="size-4" />
                {l.bathrooms} {t("listings.baths")}
              </span>
            )}
            {l.area != null && (
              <span className="flex items-center gap-1">
                <Ruler className="size-4" />
                {l.area}m²
              </span>
            )}
          </div>
          <p className="mt-4 whitespace-pre-wrap text-muted-foreground">{l.description}</p>
        </div>

        <Card className="h-fit sticky top-24">
          <CardHeader>
            <CardTitle>
              {Number(l.price).toLocaleString()} {l.currency}
              <span className="text-sm font-normal text-muted-foreground">
                {t("listings.perMonth")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="applicantName">{t("listings.apply.fullName")}</Label>
              <Input
                id="applicantName"
                value={form.applicantName}
                onChange={(e) => setForm({ ...form, applicantName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email">{t("listings.apply.email")}</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">{t("listings.apply.phone")}</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="monthlyIncome">{t("listings.apply.monthlyIncome")}</Label>
              <Input
                id="monthlyIncome"
                type="number"
                value={form.monthlyIncome}
                onChange={(e) => setForm({ ...form, monthlyIncome: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="employer">{t("listings.apply.employer")}</Label>
              <Input
                id="employer"
                value={form.employer}
                onChange={(e) => setForm({ ...form, employer: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="moveInDate">{t("listings.apply.moveInDate")}</Label>
              <Input
                id="moveInDate"
                type="date"
                value={form.moveInDate}
                onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={form.consent}
                onCheckedChange={(v) => setForm({ ...form, consent: !!v })}
              />
              <span>{t("listings.apply.consent")}</span>
            </label>
            <Button
              className="w-full"
              onClick={() => submit.mutate()}
              disabled={!form.applicantName || !form.email || !form.consent || submit.isPending}
            >
              {submit.isPending ? (
                <Loader2 className="animate-spin size-4" />
              ) : (
                t("listings.apply.submit")
              )}
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/listings/$slug/apply" params={{ slug }}>
                {t("listings.apply.wizard.heading")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
