import { useTranslation } from "react-i18next";
import { Sparkles, TrendingUp, TrendingDown, Minus, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ValuationReportData = {
  suggested_price: number;
  min_price: number;
  max_price: number;
  currency: string;
  confidence: "high" | "medium" | "low";
  factors: Array<{ label: string; impact: "positive" | "neutral" | "negative"; note?: string }>;
  recommendations: string[];
  ai_notes: string;
  comparables_count?: number;
};

export function ValuationReport({ data }: { data: ValuationReportData }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const fmt = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US", {
    style: "currency",
    currency: data.currency || "SAR",
    maximumFractionDigits: 0,
  });
  const confidenceColor =
    data.confidence === "high"
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
      : data.confidence === "medium"
        ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
        : "bg-rose-500/15 text-rose-600 border-rose-500/30";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              {isAr ? "تقييم مقترح بالذكاء الاصطناعي" : "AI-suggested valuation"}
            </div>
            <div className="mt-1 text-3xl font-bold text-foreground">
              {fmt.format(data.suggested_price)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {isAr ? "نطاق:" : "Range:"} {fmt.format(data.min_price)} — {fmt.format(data.max_price)}
            </div>
          </div>
          <Badge className={`border ${confidenceColor}`} variant="outline">
            {isAr
              ? data.confidence === "high"
                ? "ثقة عالية"
                : data.confidence === "medium"
                  ? "ثقة متوسطة"
                  : "ثقة منخفضة"
              : `${data.confidence} confidence`}
          </Badge>
        </div>
        {typeof data.comparables_count === "number" && (
          <div className="mt-3 text-[11px] text-muted-foreground">
            {isAr
              ? `مبني على ${data.comparables_count} عقار مقارن`
              : `Based on ${data.comparables_count} comparable properties`}
          </div>
        )}
      </div>

      {data.ai_notes && (
        <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm text-foreground">
          {data.ai_notes}
        </div>
      )}

      {data.factors?.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-semibold">
            {isAr ? "العوامل المؤثرة" : "Key factors"}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.factors.map((f, i) => {
              const Icon =
                f.impact === "positive" ? TrendingUp : f.impact === "negative" ? TrendingDown : Minus;
              const color =
                f.impact === "positive"
                  ? "text-emerald-600"
                  : f.impact === "negative"
                    ? "text-rose-600"
                    : "text-muted-foreground";
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-xl border border-border/60 bg-card/40 p-3"
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{f.label}</div>
                    {f.note && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{f.note}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.recommendations?.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-amber-500" />
            {isAr ? "توصيات لرفع القيمة" : "Recommendations"}
          </div>
          <ul className="space-y-1.5">
            {data.recommendations.map((r, i) => (
              <li
                key={i}
                className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}