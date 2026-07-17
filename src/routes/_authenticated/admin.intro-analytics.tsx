import { t } from "@/lib/i18n";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Activity } from "lucide-react";
import { getIntroStats, type IntroStats } from "@/lib/intro-analytics.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/intro-analytics")({
  head: () => sectionHead({ section: "admin", entityAr: "تحليلات المقدمة", entityEn: "Intro Analytics", path: "/admin/intro-analytics" }),
  component: IntroAnalyticsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-2">
        <p className="text-destructive">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          إعادة المحاولة
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{t("common.notFound")}</div>,
});

function IntroAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [pathFilter, setPathFilter] = useState("");
  const fetchFn = useServerFn(getIntroStats);
  const q = useQuery({
    queryKey: ["intro-analytics", days],
    queryFn: () => fetchFn({ data: { days } }) as Promise<IntroStats>,
  });

  const filtered = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const term = pathFilter.trim().toLowerCase();
    return term ? rows.filter((r) => r.path.toLowerCase().includes(term)) : rows;
  }, [q.data, pathFilter]);

  const totals = q.data?.totals;
  const nf = new Intl.NumberFormat("ar-SA");

  return (
    <div className="p-4 sm:p-6 space-y-6" dir="rtl">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Activity className="size-3" /> تحليلات الانترو
        </div>
        <h1 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight">
          نِسَب مشاهدة واكتمال انترو HBSpro
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          تتبّع أحداث shown / skipped / completed مقسّمة حسب اليوم والمسار.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">آخر عدد أيام</label>
            <Input
              type="number"
              min={1}
              max={180}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(180, Number(e.target.value) || 30)))}
              className="w-28"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">تصفية حسب المسار</label>
            <Input
              placeholder="/ , /dashboard ..."
              value={pathFilter}
              onChange={(e) => setPathFilter(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="size-4 animate-spin" /> : "تحديث"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "معروض (shown)", v: totals?.shown ?? 0 },
          { l: "مكتمل (completed)", v: totals?.completed ?? 0 },
          { l: "متخطى (skipped)", v: totals?.skipped ?? 0 },
          { l: "نسبة الاكتمال", v: `${totals?.completion_pct ?? 0}%` },
        ].map((s) => (
          <Card key={s.l}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs text-muted-foreground font-normal">{s.l}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-2xl font-bold">
              {typeof s.v === "number" ? nf.format(s.v) : s.v}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تفصيل حسب اليوم والمسار</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">اليوم</th>
                <th className="p-3">المسار</th>
                <th className="p-3">shown</th>
                <th className="p-3">completed</th>
                <th className="p-3">skipped</th>
                <th className="p-3">completion %</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    <Loader2 className="inline size-4 animate-spin" /> جارٍ التحميل...
                  </td>
                </tr>
              )}
              {!q.isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    لا توجد بيانات في هذه الفترة.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={`${r.day}|${r.path}`} className="border-t">
                  <td className="p-3 font-mono text-xs">{r.day}</td>
                  <td className="p-3 font-mono text-xs">{r.path}</td>
                  <td className="p-3">{nf.format(r.shown)}</td>
                  <td className="p-3">{nf.format(r.completed)}</td>
                  <td className="p-3">{nf.format(r.skipped)}</td>
                  <td className="p-3">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        background: `hsl(${Math.min(120, r.completion_pct * 1.2)} 70% 92%)`,
                        color: `hsl(${Math.min(120, r.completion_pct * 1.2)} 60% 25%)`,
                      }}
                    >
                      {r.completion_pct}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
