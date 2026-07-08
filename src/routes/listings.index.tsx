import { createFileRoute, Link } from "@tanstack/react-router";
import { listPublishedListings } from "@/lib/appfolio.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bed, Bath, Ruler, MapPin, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import ogListings from "@/assets/og-listings.jpg.asset.json";

const OG_LISTINGS = `https://hrhbs.com${ogListings.url}`;

export const Route = createFileRoute("/listings/")({
  component: ListingsIndex,
  head: () => ({
    meta: [
      { title: "العقارات المتاحة — HBSpro | Available Properties" },
      {
        name: "description",
        content:
          "تصفح العقارات المتاحة للإيجار في مختلف المدن. صنّف حسب الموقع وعدد الغرف والسعر لتجد منزلك القادم.",
      },
      { property: "og:title", content: "العقارات المتاحة — HBSpro" },
      {
        property: "og:description",
        content: "تصفح جميع العقارات المتاحة للإيجار عبر منصة HBSpro.",
      },
      { property: "og:url", content: "https://hrhbs.com/listings" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_LISTINGS },
      { name: "twitter:image", content: OG_LISTINGS },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://hrhbs.com/listings" }],
  }),
});

function ListingsIndex() {
  const { t } = useTranslation();
  const [city, setCity] = useState("");
  const q = useQuery({
    queryKey: ["listings", city],
    queryFn: () => listPublishedListings({ data: { city: city || undefined } }),
  });

  return (
    <div className="theme-luxe min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b bg-background/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <Link to="/" className="font-semibold text-xl">
            {t("listings.brand")}
          </Link>
          <Input
            id="city-filter"
            aria-label={t("listings.filterCity")}
            placeholder={t("listings.filterCityPlaceholder")}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="max-w-xs"
          />
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">{t("listings.heading")}</h1>
        {q.isLoading ? (
          <Loader2 className="animate-spin" />
        ) : (q.data ?? []).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 flex flex-col items-center text-center gap-4">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <Home className="size-7 text-muted-foreground" />
              </div>
              <div className="space-y-2 max-w-xl">
                <h2 className="text-xl font-semibold">{t("listings.emptyTitle")}</h2>
                <p className="text-muted-foreground">{t("listings.emptyDesc")}</p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button asChild variant="default">
                  <Link to="/services">{t("listings.emptyCtaServices")}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/auth">{t("listings.emptyCtaContact")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(q.data ?? []).map((l: any) => (
              <Link key={l.id} to="/listings/$slug" params={{ slug: l.slug }}>
                <Card className="overflow-hidden hover:shadow-lg transition">
                  <div className="aspect-video bg-muted">
                    {l.hero_image && (
                      <img
                        src={l.hero_image}
                        alt={l.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <CardContent className="p-4 space-y-2">
                    <div className="font-semibold">{l.title}</div>
                    {l.city && (
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="size-3" />
                        {l.city}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {l.bedrooms != null && (
                        <span className="flex items-center gap-1">
                          <Bed className="size-3" />
                          {l.bedrooms}
                        </span>
                      )}
                      {l.bathrooms != null && (
                        <span className="flex items-center gap-1">
                          <Bath className="size-3" />
                          {l.bathrooms}
                        </span>
                      )}
                      {l.area != null && (
                        <span className="flex items-center gap-1">
                          <Ruler className="size-3" />
                          {l.area}m²
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-bold">
                      {Number(l.price).toLocaleString()} {l.currency}
                      <span className="text-xs font-normal text-muted-foreground">
                        {t("listings.perMonth")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
