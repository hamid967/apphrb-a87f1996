import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Globe2, TrendingUp } from "lucide-react";
import { getSearchInsights, type SearchInsightsResult } from "@/lib/search-insights.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/search-insights")({
  head: () => sectionHead({ section: "admin", entityAr: "رؤى البحث", entityEn: "Search Insights", path: "/admin/search-insights" }),
  component: SearchInsightsPage,
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
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

const LINE_COLORS = [
  "hsl(var(--primary))",
  "#D4A853",
  "#0EA5A0",
  "#7C3AED",
  "#F97316",
  "#EC4899",
  "#0EA5E9",
];

function SearchInsightsPage() {
  const { i18n, t } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en-US");
  const [phrase, setPhrase] = useState("إدارة عقارات");
  const fetchInsights = useServerFn(getSearchInsights);
  const mutation = useMutation({
    mutationFn: (p: string) => fetchInsights({ data: { phrase: p } }),
  });
  const data = mutation.data as SearchInsightsResult | undefined;
  const presets = isAr
    ? ["إدارة عقارات", "عقارات للبيع", "شقق للإيجار", "فلل للبيع", "تقييم عقاري"]
    : [
        "property management",
        "real estate crm",
        "apartments for rent",
        "villas for sale",
        "property valuation",
      ];
  const topCountry = data?.countries[0];

  const chartData = data
    ? data.months.map((m, i) => {
        const row: Record<string, string | number> = { month: m };
        for (const c of data.countries.slice(0, 7)) {
          row[isAr ? c.nameAr : c.nameEn] = Math.round((c.trend[i] || 0) * (c.volume || 1));
        }
        return row;
      })
    : [];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <TrendingUp className="size-3" /> {isAr ? "بيانات Semrush" : "Semrush data"}
        </div>
        <h1 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight">
          {isAr ? "مصادر البحث حسب البلد" : "Search interest by country"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAr
            ? "حجم البحث الشهري وتغيّر الاهتمام خلال آخر 12 شهراً لكلمة مفتاحية عبر عدة أسواق."
            : "Monthly search volume and 12-month interest trend for a keyword across markets."}
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form
            className="flex flex-col sm:flex-row gap-3 sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (phrase.trim()) mutation.mutate(phrase.trim());
            }}
          >
            <div className="flex-1">
              <Label htmlFor="phrase" className="text-xs">
                {isAr ? "الكلمة المفتاحية" : "Keyword"}
              </Label>
              <Input
                id="phrase"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={isAr ? "مثال: إدارة عقارات" : "e.g. property management"}
              />
            </div>
            <Button type="submit" disabled={mutation.isPending || !phrase.trim()}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              <span className="ms-2">{isAr ? "بحث" : "Analyze"}</span>
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPhrase(p);
                  mutation.mutate(p);
                }}
                className="text-[11px] rounded-full border border-border px-2.5 py-1 hover:bg-muted transition"
              >
                {p}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {mutation.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            {(mutation.error as Error).message}
          </CardContent>
        </Card>
      )}

      {!data && !mutation.isPending && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {isAr
              ? "أدخل كلمة مفتاحية لعرض حجم البحث والاتجاه حسب البلد."
              : "Enter a keyword to see search volume and trend by country."}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {topCountry && topCountry.volume > 0 && (
            <Card>
              <CardContent className="p-4 text-sm">
                <span className="text-muted-foreground">
                  {isAr ? "أعلى سوق للكلمة" : "Top market"}:{" "}
                </span>
                <span className="font-semibold">
                  {isAr ? topCountry.nameAr : topCountry.nameEn}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  — {nf.format(topCountry.volume)} {isAr ? "بحث/شهر" : "searches/mo"}
                </span>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe2 className="size-4" /> {isAr ? "حجم البحث حسب البلد" : "Volume by country"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.countries.map((c) => {
                    const max = Math.max(...data.countries.map((x) => x.volume), 1);
                    const pct = (c.volume / max) * 100;
                    return (
                      <div key={c.db} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{isAr ? c.nameAr : c.nameEn}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {nf.format(c.volume)}
                            {c.cpc > 0 && (
                              <Badge variant="outline" className="ms-2 text-[10px]">
                                CPC ${c.cpc.toFixed(2)}
                              </Badge>
                            )}
                          </span>
                        </div>
                        <div className="h-2 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {data.countries.every((c) => c.volume === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      {isAr
                        ? "لا توجد بيانات لهذه الكلمة في الأسواق المحددة."
                        : "No data for this keyword in the selected markets."}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="size-4" />{" "}
                  {isAr ? "تغيّر الاهتمام (12 شهراً)" : "Interest trend (12 months)"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {data.countries.slice(0, 7).map((c, i) => (
                        <Line
                          key={c.db}
                          type="monotone"
                          dataKey={isAr ? c.nameAr : c.nameEn}
                          stroke={LINE_COLORS[i % LINE_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {isAr ? "المصدر: Semrush — آخر تحديث " : "Source: Semrush — updated "}
                  {new Date(data.fetchedAt).toLocaleString(isAr ? "ar-SA" : "en-US")}
                </p>
              </CardContent>
            </Card>
          </div>
          {data.related.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {isAr ? "كلمات ذات صلة (السعودية)" : "Related keywords (Saudi Arabia)"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="text-start py-2 font-medium">
                          {isAr ? "الكلمة" : "Keyword"}
                        </th>
                        <th className="text-end py-2 font-medium">{isAr ? "الحجم" : "Volume"}</th>
                        <th className="text-end py-2 font-medium">CPC</th>
                        <th className="text-end py-2 font-medium">
                          {isAr ? "الصعوبة" : "Difficulty"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.related.map((r) => (
                        <tr key={r.phrase} className="border-b border-border/50 last:border-0">
                          <td className="py-2">
                            <button
                              onClick={() => {
                                setPhrase(r.phrase);
                                mutation.mutate(r.phrase);
                              }}
                              className="hover:text-primary text-start"
                            >
                              {r.phrase}
                            </button>
                          </td>
                          <td className="py-2 text-end tabular-nums">{nf.format(r.volume)}</td>
                          <td className="py-2 text-end tabular-nums">${r.cpc.toFixed(2)}</td>
                          <td className="py-2 text-end tabular-nums">{r.difficulty.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
