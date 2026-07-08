import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { runDashboardTool } from "@/lib/ai-assistant.functions";
import { Loader2, Play, Terminal, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { sectionHead } from "@/lib/section-og-head";
export const Route = createFileRoute("/_authenticated/assistant/scripts")({
  head: () => sectionHead({ section: "assistant", entityAr: "سكربتات المساعد", entityEn: "Assistant Scripts", path: "/assistant/scripts" }),
  component: AssistantScriptsPage,
});

type ParamField = {
  name: string;
  type: "number" | "string";
  label: string;
  placeholder?: string;
};

type ScriptDef = {
  name: string;
  title: string;
  description: string;
  category: "تقارير" | "تحليل" | "توقعات" | "عمليات";
  fields: ParamField[];
};

const SCRIPTS: ScriptDef[] = [
  {
    name: "revenue_summary",
    title: "ملخص الإيرادات",
    description: "الإيرادات المدفوعة مجمّعة حسب الشهر خلال آخر N شهر.",
    category: "تقارير",
    fields: [{ name: "months", type: "number", label: "عدد الأشهر", placeholder: "6" }],
  },
  {
    name: "overdue_payments",
    title: "المدفوعات المتأخرة",
    description: "قائمة وإجمالي رسوم الإيجار المتأخرة.",
    category: "تقارير",
    fields: [],
  },
  {
    name: "expiring_contracts",
    title: "العقود المنتهية قريباً",
    description: "العقود النشطة التي ستنتهي خلال N يوم.",
    category: "تقارير",
    fields: [{ name: "days", type: "number", label: "عدد الأيام", placeholder: "60" }],
  },
  {
    name: "expense_summary",
    title: "ملخص المصروفات",
    description: "إجمالي المصروفات مجمّعة حسب الفئة خلال آخر N شهر.",
    category: "تقارير",
    fields: [{ name: "months", type: "number", label: "عدد الأشهر", placeholder: "6" }],
  },
  {
    name: "occupancy_snapshot",
    title: "لقطة الإشغال",
    description: "لقطة حالية لإشغال الوحدات.",
    category: "تحليل",
    fields: [],
  },
  {
    name: "rent_forecast",
    title: "توقعات الإيجار",
    description: "توقع إيرادات الإيجار للأشهر القادمة.",
    category: "توقعات",
    fields: [{ name: "months", type: "number", label: "أفق الأشهر", placeholder: "3" }],
  },
  {
    name: "risk_analysis",
    title: "تحليل المخاطر",
    description: "تجميع للمخاطر عبر التدفق النقدي والاحتفاظ والإشغال.",
    category: "تحليل",
    fields: [],
  },
  {
    name: "suggest_rent_price",
    title: "اقتراح سعر إيجار",
    description: "اقتراح نطاق سعري لوحدة أو مدينة بناءً على المقارنات.",
    category: "توقعات",
    fields: [
      { name: "unit_id", type: "string", label: "معرّف الوحدة (UUID)", placeholder: "اختياري" },
      { name: "city", type: "string", label: "المدينة", placeholder: "اختياري" },
    ],
  },
  {
    name: "employee_performance",
    title: "أداء الموظفين",
    description: "عدد الصفقات وقيمة المكسب لكل موظف مبيعات.",
    category: "تحليل",
    fields: [],
  },
  {
    name: "summarize_system",
    title: "ملخص النظام",
    description: "مؤشرات KPIs عالية المستوى للوحة تحكم.",
    category: "تقارير",
    fields: [],
  },
];

function ScriptCard({
  script,
  onRun,
}: {
  script: ScriptDef;
  onRun: (name: string, args: Record<string, unknown>) => Promise<any>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const args: Record<string, unknown> = {};
      for (const f of script.fields) {
        const v = values[f.name]?.trim();
        if (!v) continue;
        args[f.name] = f.type === "number" ? Number(v) : v;
      }
      const res = await onRun(script.name, args);
      setResult(res);
      setOpen(true);
      toast.success(`تم تنفيذ ${script.title}`);
    } catch (e: any) {
      const msg = e?.message ?? "فشل التنفيذ";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Terminal className="size-3.5" />
            <span className="font-mono">{script.name}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{script.category}</span>
          </div>
          <h3 className="mt-1 font-semibold">{script.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{script.description}</p>
        </div>
      </div>

      {script.fields.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {script.fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <input
                type={f.type === "number" ? "number" : "text"}
                placeholder={f.placeholder}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          تشغيل السكربت
        </button>
        {(result || error) && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "إخفاء النتيجة" : "عرض النتيجة"}
          </button>
        )}
      </div>

      {open && error && (
        <pre
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive overflow-x-auto"
          dir="ltr"
        >
          {error}
        </pre>
      )}
      {open && result && (
        <pre
          className="rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto max-h-80"
          dir="ltr"
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AssistantScriptsPage() {
  const runFn = useServerFn(runDashboardTool);
  const onRun = async (name: string, args: Record<string, unknown>) => {
    const res = await runFn({ data: { name: name as any, args } });
    return res.result;
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-6" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">سكربتات حامد</h1>
        <p className="text-sm text-muted-foreground">
          شغّل سكربتات المساعد يدوياً، وأدخل المعطيات المطلوبة، واعرض النتائج المهيكلة قبل استخدامها
          في المحادثة.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SCRIPTS.map((s) => (
          <ScriptCard key={s.name} script={s} onRun={onRun} />
        ))}
      </div>
    </div>
  );
}
