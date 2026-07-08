import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/admin/report-branding")({
  head: () => sectionHead({ section: "admin", entityAr: "هوية التقارير", entityEn: "Report Branding", path: "/admin/report-branding" }),
  component: ReportBrandingPage,
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
          {i18n.t("reportsCommon.retry")}
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">{i18n.t("reportsCommon.notFound")}</div>,
});

const KEYS = [
  {
    key: "report.company_name",
    labelAr: "اسم الجهة / التوقيع",
    labelEn: "Company / signature name",
    def: "HBSpro — إدارة العقارات",
  },
  { key: "report.phone", labelAr: "رقم الجوال", labelEn: "Mobile", def: "0555208213" },
  { key: "report.email", labelAr: "البريد الإلكتروني", labelEn: "Email", def: "hamid@hrhbs.com" },
  { key: "report.website", labelAr: "عنوان الموقع", labelEn: "Website", def: "www.hrhbs.com" },
] as const;

type SigPos = "top" | "bottom";
type SigAlign = "start" | "center" | "end";
type SigLayout = { position: SigPos; offset: number; align: SigAlign };
type Template = "classic" | "modern" | "minimal";
const LAYOUT_KEY = "report.sig_layout";
const HEADER_KEY = "report.contact_in_header";
const USE_COMPANY_KEY = "report.use_company_settings";
const COMPANY_ID_KEY = "report.company_id";
const LAYOUT_DEFAULTS: Record<Template, SigLayout> = {
  classic: { position: "bottom", offset: 26, align: "start" },
  modern: { position: "bottom", offset: 26, align: "start" },
  minimal: { position: "bottom", offset: 26, align: "center" },
};

function ReportBrandingPage() {
  const { i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const [values, setValues] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<Record<Template, SigLayout>>(LAYOUT_DEFAULTS);
  const [contactInHeader, setContactInHeader] = useState(false);
  const [useCompany, setUseCompany] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string; phone: string | null; email: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        KEYS.map(async (k) => {
          const { data } = await supabase.rpc("get_app_setting", { _key: k.key });
          return [k.key, (data as string | null) ?? k.def] as const;
        }),
      );
      setValues(Object.fromEntries(entries));
      const { data: layoutRaw } = await supabase.rpc("get_app_setting", { _key: LAYOUT_KEY });
      if (layoutRaw) {
        try {
          setLayout({ ...LAYOUT_DEFAULTS, ...JSON.parse(layoutRaw as string) });
        } catch {}
      }
      const { data: headerRaw } = await supabase.rpc("get_app_setting", { _key: HEADER_KEY });
      setContactInHeader((headerRaw as string | null) === "true");
      const [{ data: useRaw }, { data: idRaw }, { data: cos }] = await Promise.all([
        supabase.rpc("get_app_setting", { _key: USE_COMPANY_KEY }),
        supabase.rpc("get_app_setting", { _key: COMPANY_ID_KEY }),
        supabase
          .from("companies")
          .select("id,name,phone,email")
          .is("deleted_at", null)
          .order("name"),
      ]);
      setUseCompany((useRaw as string | null) === "true");
      setCompanyId((idRaw as string | null) ?? "");
      setCompanies((cos ?? []) as any);
      setLoading(false);
    })();
  }, []);

  const linked = companies.find((c) => c.id === companyId);

  const save = async () => {
    setSaving(true);
    try {
      for (const k of KEYS) {
        const { error } = await supabase.rpc("set_app_setting", {
          _key: k.key,
          _value: values[k.key] ?? "",
        });
        if (error) throw error;
      }
      const { error: le } = await supabase.rpc("set_app_setting", {
        _key: LAYOUT_KEY,
        _value: JSON.stringify(layout),
      });
      if (le) throw le;
      const { error: he } = await supabase.rpc("set_app_setting", {
        _key: HEADER_KEY,
        _value: contactInHeader ? "true" : "false",
      });
      if (he) throw he;
      const { error: ue } = await supabase.rpc("set_app_setting", {
        _key: USE_COMPANY_KEY,
        _value: useCompany ? "true" : "false",
      });
      if (ue) throw ue;
      const { error: ce } = await supabase.rpc("set_app_setting", {
        _key: COMPANY_ID_KEY,
        _value: companyId ?? "",
      });
      if (ce) throw ce;
      toast.success(ar ? "تم الحفظ" : "Saved");
    } catch (e: any) {
      toast.error(e?.message ?? i18n.t("reportsCommon.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          {ar ? "توقيع التقارير والـ PDF" : "Report & PDF Signature"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ar
            ? "تُستخدم هذه البيانات في تذييل كل تقرير وملف PDF يصدره النظام."
            : "These fields appear in the footer of every report and PDF the system generates."}
        </p>
      </div>

      <Card className="space-y-4 p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> …
          </div>
        ) : (
          KEYS.map((k) => (
            <div key={k.key} className="space-y-2">
              <Label htmlFor={k.key}>{ar ? k.labelAr : k.labelEn}</Label>
              <Input
                id={k.key}
                value={values[k.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [k.key]: e.target.value }))}
                dir={k.key === "report.company_name" && ar ? "rtl" : "ltr"}
                disabled={useCompany && k.key !== "report.website"}
              />
              {useCompany && k.key !== "report.website" && (
                <p className="text-xs text-muted-foreground">
                  {ar
                    ? `مرتبط بـ Company Settings${linked ? ` — ${linked.name}` : ""}`
                    : `Linked to Company Settings${linked ? ` — ${linked.name}` : ""}`}
                </p>
              )}
            </div>
          ))
        )}
        <Button onClick={save} disabled={saving || loading} className="gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {ar ? "حفظ" : "Save"}
        </Button>
      </Card>

      <Card className="space-y-3 p-6">
        <div>
          <div className="text-lg font-semibold">{ar ? "مصدر البيانات" : "Data source"}</div>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "اربط رقم الجوال والبريد واسم الجهة ببيانات شركة من Company Settings بدل قيم يدوية."
              : "Link mobile, email, and company name to a Company Settings record instead of manual values."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={useCompany}
            onChange={(e) => setUseCompany(e.target.checked)}
          />
          <span>{ar ? "استخدم بيانات شركة من النظام" : "Use a company from the system"}</span>
        </label>
        <div className="space-y-1">
          <Label className="text-xs">{ar ? "الشركة" : "Company"}</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            disabled={!useCompany}
          >
            <option value="">{ar ? "— اختر شركة —" : "— select a company —"}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {useCompany && linked && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div>
              <b>{ar ? "الاسم" : "Name"}:</b> {linked.name}
            </div>
            <div>
              <b>{ar ? "الجوال" : "Phone"}:</b> {linked.phone ?? "—"}
            </div>
            <div>
              <b>{ar ? "البريد" : "Email"}:</b> {linked.email ?? "—"}
            </div>
            <p className="mt-2 text-muted-foreground">
              {ar
                ? "الحقول الفارغة تعود إلى القيم اليدوية أعلاه."
                : "Empty fields fall back to the manual values above."}
            </p>
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <div className="text-lg font-semibold">
            {ar ? "موضع التوقيع في كل قالب" : "Signature position per template"}
          </div>
          <p className="text-xs text-muted-foreground">
            {ar
              ? "الموضع (أعلى/أسفل الصفحة)، والمسافة بالنقاط (pt)، والمحاذاة (تتبع RTL/LTR تلقائيًا)."
              : "Position (top/bottom of page), offset in points (pt), and alignment (auto-mirrored for RTL/LTR)."}
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={contactInHeader}
            onChange={(e) => setContactInHeader(e.target.checked)}
          />
          <span>
            {ar
              ? "إظهار رقم الجوال ووسائل التواصل في ترويسة كل صفحة (بالإضافة إلى الفوتر)"
              : "Show mobile & contact info in the header of every page (in addition to the footer)"}
          </span>
        </label>
        {(["classic", "modern", "minimal"] as Template[]).map((tpl) => {
          const l = layout[tpl];
          const set = (patch: Partial<SigLayout>) =>
            setLayout((prev) => ({ ...prev, [tpl]: { ...prev[tpl], ...patch } }));
          return (
            <div
              key={tpl}
              className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-4 md:items-end"
            >
              <div className="text-sm font-medium capitalize">{tpl}</div>
              <div className="space-y-1">
                <Label className="text-xs">{ar ? "الموضع" : "Position"}</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={l.position}
                  onChange={(e) => set({ position: e.target.value as SigPos })}
                >
                  <option value="bottom">{ar ? "أسفل الصفحة" : "Bottom"}</option>
                  <option value="top">{ar ? "أعلى الصفحة" : "Top"}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{ar ? "المسافة (pt)" : "Offset (pt)"}</Label>
                <Input
                  type="number"
                  min={0}
                  max={400}
                  value={l.offset}
                  onChange={(e) => set({ offset: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{ar ? "المحاذاة" : "Alignment"}</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={l.align}
                  onChange={(e) => set({ align: e.target.value as SigAlign })}
                >
                  <option value="start">{ar ? "بداية السطر" : "Start"}</option>
                  <option value="center">{ar ? "وسط" : "Center"}</option>
                  <option value="end">{ar ? "نهاية السطر" : "End"}</option>
                </select>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
