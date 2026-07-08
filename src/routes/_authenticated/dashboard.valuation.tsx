import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, Building2 } from "lucide-react";
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
import { valuateProperty, listValuations } from "@/lib/valuation.functions";
import { ValuationReport, type ValuationReportData } from "@/components/valuation/ValuationReport";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/dashboard/valuation")({
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error.message}</div>,
  head: () => sectionHead({ section: "dashboard", entityAr: "التقييم", entityEn: "Valuation", path: "/dashboard/valuation" }),
  component: ValuationPage,
});

function ValuationPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");

  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => listMyOrganizations() });
  const orgs = orgsQ.data ?? [];
  const [orgId, setOrgId] = useState<string>("");
  const activeOrg = orgId || orgs[0]?.org.id || "";

  const [purpose, setPurpose] = useState<"sale" | "rent_monthly" | "rent_yearly">("sale");
  const [propType, setPropType] = useState("apartment");
  const [city, setCity] = useState("");
  const [area, setArea] = useState<number | "">("");
  const [beds, setBeds] = useState<number | "">("");
  const [baths, setBaths] = useState<number | "">("");
  const [condition, setCondition] = useState<"new" | "excellent" | "good" | "fair" | "poor">(
    "good",
  );
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<ValuationReportData | null>(null);

  const historyQ = useQuery({
    queryKey: ["valuations", activeOrg],
    queryFn: () => listValuations({ data: { org_id: activeOrg, limit: 5 } }),
    enabled: !!activeOrg,
  });

  const mut = useMutation({
    mutationFn: () =>
      valuateProperty({
        data: {
          org_id: activeOrg,
          purpose,
          save: true,
          manual: {
            property_type: propType,
            city,
            area_sqm: Number(area),
            bedrooms: beds === "" ? null : Number(beds),
            bathrooms: baths === "" ? null : Number(baths),
            condition,
            notes: notes || null,
          },
        },
      }),
    onSuccess: (r) => {
      setResult(r as ValuationReportData);
      historyQ.refetch();
      toast.success(isAr ? "تم إنشاء التقييم" : "Valuation ready");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = activeOrg && city && Number(area) > 0 && !mut.isPending;

  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {isAr ? "التقييم الذكي للعقارات" : "AI Property Valuation"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "أدخل تفاصيل العقار واحصل على تقييم فوري بالذكاء الاصطناعي مع مقارنات محلية."
              : "Enter property details for an instant AI-powered valuation with local comparables."}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="surface-card space-y-4 p-5">
          <div className="text-sm font-semibold">
            {isAr ? "تفاصيل العقار" : "Property details"}
          </div>

          {orgs.length > 1 && (
            <div>
              <Label>{isAr ? "المؤسسة" : "Organization"}</Label>
              <Select value={activeOrg} onValueChange={setOrgId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.org.id} value={o.org.id}>
                      {o.org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isAr ? "الغرض" : "Purpose"}</Label>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as typeof purpose)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">{isAr ? "بيع" : "Sale"}</SelectItem>
                  <SelectItem value="rent_monthly">
                    {isAr ? "إيجار شهري" : "Monthly rent"}
                  </SelectItem>
                  <SelectItem value="rent_yearly">
                    {isAr ? "إيجار سنوي" : "Yearly rent"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? "نوع العقار" : "Property type"}</Label>
              <Select value={propType} onValueChange={setPropType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apartment">{isAr ? "شقة" : "Apartment"}</SelectItem>
                  <SelectItem value="villa">{isAr ? "فيلا" : "Villa"}</SelectItem>
                  <SelectItem value="office">{isAr ? "مكتب" : "Office"}</SelectItem>
                  <SelectItem value="land">{isAr ? "أرض" : "Land"}</SelectItem>
                  <SelectItem value="shop">{isAr ? "محل" : "Shop"}</SelectItem>
                  <SelectItem value="warehouse">{isAr ? "مستودع" : "Warehouse"}</SelectItem>
                  <SelectItem value="building">{isAr ? "عمارة" : "Building"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isAr ? "المدينة" : "City"}</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={isAr ? "الرياض" : "Riyadh"}
              />
            </div>
            <div>
              <Label>{isAr ? "المساحة (م²)" : "Area (m²)"}</Label>
              <Input
                type="number"
                value={area}
                onChange={(e) => setArea(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>{isAr ? "غرف النوم" : "Bedrooms"}</Label>
              <Input
                type="number"
                value={beds}
                onChange={(e) => setBeds(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div>
              <Label>{isAr ? "الحمامات" : "Bathrooms"}</Label>
              <Input
                type="number"
                value={baths}
                onChange={(e) => setBaths(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div>
              <Label>{isAr ? "الحالة" : "Condition"}</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as typeof condition)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">{isAr ? "جديد" : "New"}</SelectItem>
                  <SelectItem value="excellent">{isAr ? "ممتاز" : "Excellent"}</SelectItem>
                  <SelectItem value="good">{isAr ? "جيد" : "Good"}</SelectItem>
                  <SelectItem value="fair">{isAr ? "مقبول" : "Fair"}</SelectItem>
                  <SelectItem value="poor">{isAr ? "يحتاج ترميم" : "Poor"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={
                isAr ? "مميزات إضافية، إطلالة، مواقف..." : "Extra features, view, parking..."
              }
            />
          </div>

          <Button
            onClick={() => mut.mutate()}
            disabled={!canSubmit}
            className="w-full"
            size="lg"
          >
            {mut.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {isAr ? "جاري التقييم..." : "Valuating..."}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {isAr ? "احصل على التقييم" : "Get valuation"}
              </>
            )}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="surface-card min-h-[300px] p-5">
            {result ? (
              <ValuationReport data={result} />
            ) : (
              <div className="grid h-full min-h-[260px] place-items-center text-center text-sm text-muted-foreground">
                <div>
                  <Sparkles className="mx-auto mb-2 size-6 text-primary/60" />
                  {isAr
                    ? "املأ التفاصيل ثم اضغط «احصل على التقييم» لرؤية النتيجة هنا."
                    : "Fill the details and click 'Get valuation' to see the report here."}
                </div>
              </div>
            )}
          </div>

          {historyQ.data && historyQ.data.length > 0 && (
            <div className="surface-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Building2 className="size-4 text-primary" />
                {isAr ? "آخر التقييمات" : "Recent valuations"}
              </div>
              <div className="space-y-2">
                {historyQ.data.map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() =>
                      setResult({
                        suggested_price: Number(v.suggested_price),
                        min_price: Number(v.min_price),
                        max_price: Number(v.max_price),
                        currency: v.currency,
                        confidence: v.confidence,
                        factors: v.factors ?? [],
                        recommendations: v.recommendations ?? [],
                        ai_notes: v.ai_notes ?? "",
                        comparables_count: Array.isArray(v.comparables) ? v.comparables.length : 0,
                      })
                    }
                    className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3 text-start transition hover:border-primary/40"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", {
                          style: "currency",
                          currency: v.currency,
                          maximumFractionDigits: 0,
                        }).format(Number(v.suggested_price))}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {v.purpose} • {new Date(v.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US")}
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{v.confidence}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}