import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { sanitiseRichHtml } from "@/lib/sanitize-rich";
import { Download, FileText, Loader2, Save, ExternalLink, FileBarChart } from "lucide-react";
import { AdminPageHeader, AdminPageLoading } from "@/components/admin/AdminPageHeader";
import {
  AVAILABLE_METRICS,
  INTRO_PRESETS,
  getReportIntro,
  upsertReportIntro,
  generateReportExport,
  listReportRuns,
  resignReportRun,
} from "@/lib/report-intro.functions";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/report-intro")({
  head: () => sectionHead({ section: "admin", entityAr: "قوالب التقارير", entityEn: "Report Templates", path: "/admin/report-intro" }),
  component: ReportIntroPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive mb-3">{error.message}</p>
        <Button
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          {i18n.t("reportsCommon.retry")}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{i18n.t("reportsCommon.notFound")}</div>,
});

type Preset = "custom" | "financial" | "operational" | "technical";
type Format = "pdf" | "docx" | "xlsx" | "html";
type RunRow = Awaited<ReturnType<typeof listReportRuns>>[number];

const METRIC_LABELS: Record<string, { ar: string; en: string }> = {
  contracts_active: { ar: "العقود النشطة", en: "Active contracts" },
  contracts_expiring_30d: { ar: "عقود تنتهي خلال 30 يومًا", en: "Expiring 30d" },
  payments_ytd: { ar: "المدفوعات المحصّلة", en: "Payments YTD" },
  payments_outstanding: { ar: "المستحقات القائمة", en: "Outstanding" },
  tenants_count: { ar: "عدد المستأجرين", en: "Tenants" },
  owners_count: { ar: "عدد الملاك", en: "Owners" },
  properties_count: { ar: "عدد العقارات", en: "Properties" },
  units_count: { ar: "إجمالي الوحدات", en: "Units total" },
  units_occupied: { ar: "الوحدات المؤجَّرة", en: "Units occupied" },
  tickets_open: { ar: "طلبات الصيانة المفتوحة", en: "Open tickets" },
  leads_new_30d: { ar: "عملاء محتملون جدد", en: "New leads (30d)" },
};

function ReportIntroPage() {
  const { i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");

  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingFmt, setExportingFmt] = useState<Format | null>(null);

  const [titleAr, setTitleAr] = useState("مقدمة الإدارة");
  const [titleEn, setTitleEn] = useState("Management Introduction");
  const [preset, setPreset] = useState<Preset>("custom");
  const [contentAr, setContentAr] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [metrics, setMetrics] = useState<string[]>([]);

  const [runs, setRuns] = useState<RunRow[]>([]);

  const fetchIntro = useServerFn(getReportIntro);
  const saveIntro = useServerFn(upsertReportIntro);
  const runExport = useServerFn(generateReportExport);
  const fetchRuns = useServerFn(listReportRuns);
  const resign = useServerFn(resignReportRun);

  // Load companies (admin sees all via existing companies list).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      const list = (data ?? []) as Array<{ id: string; name: string }>;
      setCompanies(list);
      if (list.length && !companyId) setCompanyId(list[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load intro + runs when company changes.
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const [row, list] = await Promise.all([
          fetchIntro({ data: { companyId } }),
          fetchRuns({ data: { companyId } }),
        ]);
        if (row) {
          setTitleAr(row.title_ar);
          setTitleEn(row.title_en);
          setPreset(row.preset as Preset);
          setContentAr(row.rich_content_ar ?? "");
          setContentEn(row.rich_content_en ?? "");
          setMetrics((row.dynamic_metrics as string[]) ?? []);
        } else {
          setTitleAr("مقدمة الإدارة");
          setTitleEn("Management Introduction");
          setPreset("custom");
          setContentAr("");
          setContentEn("");
          setMetrics([]);
        }
        setRuns(list);
      } catch (e) {
        toast.error((e as Error).message);
      }
    })();
  }, [companyId, fetchIntro, fetchRuns]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const src = INTRO_PRESETS[p];
    setTitleAr(src.titleAr);
    setTitleEn(src.titleEn);
    setContentAr(src.ar);
    setContentEn(src.en);
    setMetrics(src.metrics as unknown as string[]);
  };

  const toggleMetric = (k: string) => {
    setMetrics((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const onSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      // Client-side sanitisation before submit (server re-sanitises as well).
      const cleanAr = sanitiseRichHtml(contentAr);
      const cleanEn = sanitiseRichHtml(contentEn);
      if (cleanAr !== contentAr) setContentAr(cleanAr);
      if (cleanEn !== contentEn) setContentEn(cleanEn);
      await saveIntro({
        data: {
          companyId,
          titleAr,
          titleEn,
          preset,
          richContentAr: cleanAr,
          richContentEn: cleanEn,
          dynamicMetrics: metrics as never,
        },
      });
      toast.success(ar ? "تم حفظ القالب" : "Template saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onExport = async (fmt: Format) => {
    if (!companyId) return;
    setExportingFmt(fmt);
    try {
      const res = await runExport({ data: { companyId, format: fmt } });
      toast.success(ar ? "تم توليد التقرير" : "Report generated");
      window.open(res.signedUrl, "_blank", "noopener");
      const list = await fetchRuns({ data: { companyId } });
      setRuns(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExportingFmt(null);
    }
  };

  const onResign = async (runId: string) => {
    try {
      const { signedUrl } = await resign({ data: { runId } });
      window.open(signedUrl, "_blank", "noopener");
      const list = await fetchRuns({ data: { companyId } });
      setRuns(list);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const previewText = useMemo(() => {
    const strip = (s: string) => s.replace(/<[^>]+>/g, "").slice(0, 240);
    return { ar: strip(contentAr), en: strip(contentEn) };
  }, [contentAr, contentEn]);

  if (loading) {
    return (
      <AdminPageLoading
        ar="قوالب التقارير"
        en="Report Templates"
        icon={FileBarChart}
        descriptionAr="خصّص المقدمة التي تظهر في بداية تقرير المراجعة."
        descriptionEn="Customise the intro section that opens the review report."
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6" dir={ar ? "rtl" : "ltr"}>
      <AdminPageHeader
        ar="قالب مقدمة التقرير"
        en="Report intro template"
        icon={FileBarChart}
        descriptionAr="خصّص قسم المقدمة الذي يظهر في بداية تقرير المراجعة، ثم صدّره بأربع صيغ."
        descriptionEn="Customise the intro section that appears at the top of the review report, then export it in four formats."
      />

      {/* Company + preset */}
      <Card className="p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>{ar ? "الشركة" : "Company"}</Label>
            <select
              className="mt-1 w-full rounded border border-input bg-background p-2 text-sm"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{ar ? "قالب جاهز" : "Preset"}</Label>
            <select
              className="mt-1 w-full rounded border border-input bg-background p-2 text-sm"
              value={preset}
              onChange={(e) => applyPreset(e.target.value as Preset)}
            >
              <option value="custom">{ar ? "مخصص" : "Custom"}</option>
              <option value="financial">{ar ? "مالي" : "Financial"}</option>
              <option value="operational">{ar ? "تشغيلي" : "Operational"}</option>
              <option value="technical">{ar ? "فني" : "Technical"}</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Titles */}
      <Card className="p-4 grid gap-4 md:grid-cols-2">
        <div>
          <Label>{ar ? "العنوان (عربي)" : "Title (Arabic)"}</Label>
          <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" />
        </div>
        <div>
          <Label>{ar ? "العنوان (إنجليزي)" : "Title (English)"}</Label>
          <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} dir="ltr" />
        </div>
      </Card>

      {/* Bilingual content */}
      <Card className="p-4 grid gap-4 md:grid-cols-2">
        <div>
          <Label>{ar ? "المحتوى (عربي)" : "Content (Arabic)"}</Label>
          <RichTextEditor
            value={contentAr}
            onChange={setContentAr}
            dir="rtl"
            placeholder={
              ar ? "اكتب رسالة الإدارة أو استخدم قالباً جاهزاً…" : "Write the management message…"
            }
          />
        </div>
        <div>
          <Label>{ar ? "المحتوى (إنجليزي)" : "Content (English)"}</Label>
          <RichTextEditor
            value={contentEn}
            onChange={setContentEn}
            dir="ltr"
            placeholder="Write the management message…"
          />
        </div>
      </Card>

      {/* Dynamic metrics */}
      <Card className="p-4">
        <h2 className="mb-3 font-semibold">{ar ? "المقاييس الديناميكية" : "Dynamic metrics"}</h2>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {AVAILABLE_METRICS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={metrics.includes(k)}
                onChange={() => toggleMetric(k)}
              />
              <span>{ar ? METRIC_LABELS[k].ar : METRIC_LABELS[k].en}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* Live preview */}
      <Card className="p-4">
        <h2 className="mb-2 font-semibold">{ar ? "معاينة" : "Preview"}</h2>
        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <div dir="rtl" className="border rounded p-3 bg-muted/40">
            <div className="font-bold text-primary">{titleAr}</div>
            <p className="mt-2 text-muted-foreground leading-relaxed">
              {previewText.ar || (ar ? "لا يوجد محتوى" : "No content")}
            </p>
          </div>
          <div dir="ltr" className="border rounded p-3 bg-muted/40">
            <div className="font-bold text-primary">{titleEn}</div>
            <p className="mt-2 text-muted-foreground leading-relaxed">
              {previewText.en || "No content"}
            </p>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="mx-2">{ar ? "حفظ القالب" : "Save template"}</span>
        </Button>

        {(["pdf", "html", "docx", "xlsx"] as const).map((f) => (
          <Button
            key={f}
            variant="secondary"
            disabled={exportingFmt !== null}
            onClick={() => onExport(f)}
          >
            {exportingFmt === f ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="mx-2">
              {f === "pdf" ? (ar ? "PDF (طباعة)" : "PDF (print)") : f.toUpperCase()}
            </span>
          </Button>
        ))}
      </div>

      {/* History */}
      <Card className="p-4">
        <h2 className="mb-3 font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {ar ? "سجل التقارير" : "Report history"}
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ar ? "لا توجد تقارير مُولَّدة بعد." : "No reports generated yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-start p-2">{ar ? "التاريخ" : "Date"}</th>
                  <th className="text-start p-2">{ar ? "الصيغة" : "Format"}</th>
                  <th className="text-start p-2">{ar ? "الحالة" : "Status"}</th>
                  <th className="text-start p-2">{ar ? "الحجم" : "Size"}</th>
                  <th className="text-end p-2">{ar ? "إجراء" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      {new Date(r.created_at as string).toLocaleString(ar ? "ar-SA" : "en-US")}
                    </td>
                    <td className="p-2 uppercase">{r.format}</td>
                    <td className="p-2">
                      <span
                        className={
                          r.status === "ready"
                            ? "text-emerald-600"
                            : r.status === "failed"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="p-2">
                      {r.file_size ? `${Math.round((r.file_size as number) / 1024)} KB` : "—"}
                    </td>
                    <td className="p-2 text-end">
                      {r.status === "ready" && r.storage_path ? (
                        <Button size="sm" variant="ghost" onClick={() => onResign(r.id as string)}>
                          <ExternalLink className="h-4 w-4" />
                          <span className="mx-2">{ar ? "تنزيل" : "Open"}</span>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
