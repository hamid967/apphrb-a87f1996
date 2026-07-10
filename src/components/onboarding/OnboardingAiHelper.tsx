import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  aiExtractOnboarding,
  type ExtractedFields,
} from "@/lib/onboarding-ai.functions";

type Step = "profile" | "company" | "branch" | "property";

const PLACEHOLDERS: Record<Step, string> = {
  profile:
    "اكتب باختصار: اسمك الكامل، جوالك، مسمّاك الوظيفي، وسبب استخدامك للنظام.\nمثال: أنا خالد الحربي، مدير عقاري، جوالي 0555123456، أستخدم النظام لإدارة الإيجارات.",
  company:
    "اكتب اسم شركتك ورقم اتصالها.\nمثال: شركة النور العقارية، الاتصال 0112345678.",
  branch:
    "اكتب اسم الفرع ورقم هاتفه وعنوانه، وقائمة الأقسام.\nمثال: الفرع الرئيسي، الرياض حي النخيل، جوال 0501112222، الأقسام: المبيعات، الإيجارات، الصيانة.",
  property:
    "اكتب وصف العقار الأول: الاسم، النوع، المدينة، السعر.\nمثال: شقة رقم 12 في حي النرجس بالرياض، إيجار سنوي 45000 ريال.",
};

const REASONS = [
  "إدارة عقارات وإيجارات",
  "إدارة صيانة ومهام",
  "تنظيم المبيعات والعمولات",
  "تقارير مالية وتحليلات",
  "تجربة النظام قبل الاشتراك",
  "أخرى",
];

const PROP_TYPE_LABELS: Record<
  NonNullable<ExtractedFields["property_type"]>,
  string
> = {
  apartment: "شقة",
  villa: "فيلا",
  office: "مكتب",
  shop: "محل",
  building: "عمارة",
  land: "أرض",
};

type DraftState = {
  full_name: string;
  phone: string;
  job_title: string;
  reason: string;
  name: string;
  address: string;
  departments: string; // comma-separated in the editor
  title: string;
  property_type: NonNullable<ExtractedFields["property_type"]> | "";
  city: string;
  price: string;
};

const EMPTY_DRAFT: DraftState = {
  full_name: "",
  phone: "",
  job_title: "",
  reason: "",
  name: "",
  address: "",
  departments: "",
  title: "",
  property_type: "",
  city: "",
  price: "",
};

function toDraft(fields: ExtractedFields): DraftState {
  return {
    ...EMPTY_DRAFT,
    full_name: fields.full_name ?? "",
    phone: fields.phone ?? "",
    job_title: fields.job_title ?? "",
    reason: fields.reason ?? "",
    name: fields.name ?? "",
    address: fields.address ?? "",
    departments: (fields.departments ?? []).join("، "),
    title: fields.title ?? "",
    property_type: fields.property_type ?? "",
    city: fields.city ?? "",
    price: typeof fields.price === "number" ? String(fields.price) : "",
  };
}

function draftToFields(step: Step, d: DraftState): ExtractedFields {
  const out: ExtractedFields = {};
  const put = <K extends keyof ExtractedFields>(k: K, v: ExtractedFields[K] | undefined) => {
    if (v !== undefined && v !== null && v !== ("" as unknown)) out[k] = v;
  };
  if (step === "profile") {
    put("full_name", d.full_name.trim() || undefined);
    put("phone", d.phone.trim() || undefined);
    put("job_title", d.job_title.trim() || undefined);
    put("reason", d.reason.trim() || undefined);
  } else if (step === "company") {
    put("name", d.name.trim() || undefined);
    put("phone", d.phone.trim() || undefined);
  } else if (step === "branch") {
    put("name", d.name.trim() || undefined);
    put("phone", d.phone.trim() || undefined);
    put("address", d.address.trim() || undefined);
    const deps = d.departments
      .split(/[،,\n]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (deps.length) out.departments = deps;
  } else {
    put("title", d.title.trim() || undefined);
    if (d.property_type) out.property_type = d.property_type;
    put("city", d.city.trim() || undefined);
    const n = Number(d.price);
    if (d.price.trim() && Number.isFinite(n) && n >= 0) out.price = n;
  }
  return out;
}

function countAppliedFields(step: Step, d: DraftState): number {
  return Object.keys(draftToFields(step, d)).length;
}

export function OnboardingAiHelper({
  step,
  onApply,
}: {
  step: Step;
  onApply: (fields: ExtractedFields) => void;
}) {
  const extract = useServerFn(aiExtractOnboarding);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"input" | "preview">("input");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);

  const reset = () => {
    setMode("input");
    setText("");
    setDraft(EMPTY_DRAFT);
  };

  const run = async () => {
    if (text.trim().length < 3) {
      toast.error("اكتب وصفاً موجزاً أولاً");
      return;
    }
    setBusy(true);
    try {
      const res = await extract({ data: { step, description: text.trim() } });
      const count = Object.keys(res.fields).length;
      if (count === 0) {
        toast.info("لم أتمكّن من استخراج بيانات — جرّب صياغة أوضح.");
        return;
      }
      setDraft(toDraft(res.fields));
      setMode("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الاستخراج");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const fields = draftToFields(step, draft);
    const count = Object.keys(fields).length;
    if (count === 0) {
      toast.info("لا توجد حقول للتطبيق");
      return;
    }
    onApply(fields);
    toast.success(`تم تطبيق ${count} حقلاً`);
    setOpen(false);
    reset();
  };

  const set = <K extends keyof DraftState>(k: K, v: DraftState[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
        >
          <Sparkles className="size-3.5" />
          دعني أساعدك
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,28rem)] p-3" sideOffset={8}>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Wand2 className="size-4 text-primary" />
          مساعد إدخال البيانات
        </div>

        {mode === "input" ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              اكتب المعلومات بلغة عادية، وسأستخرج الحقول لتراجعها وتعدّلها قبل التطبيق.
            </p>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder={PLACEHOLDERS[step]}
              className="resize-none text-sm"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={run}
                disabled={busy || text.trim().length < 3}
              >
                {busy && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
                استخرج وعاين
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              راجع الحقول المستخرجة وعدّلها إن لزم، ثم اضغط «تطبيق على النموذج».
            </p>
            <div className="max-h-[52vh] space-y-3 overflow-y-auto pe-1">
              {step === "profile" && (
                <>
                  <FieldRow label="الاسم الكامل">
                    <Input
                      value={draft.full_name}
                      onChange={(e) => set("full_name", e.target.value)}
                      className="h-9"
                    />
                  </FieldRow>
                  <FieldRow label="رقم الجوال">
                    <Input
                      value={draft.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      dir="ltr"
                      className="h-9"
                      placeholder="+9665XXXXXXXX"
                    />
                  </FieldRow>
                  <FieldRow label="المسمى الوظيفي">
                    <Input
                      value={draft.job_title}
                      onChange={(e) => set("job_title", e.target.value)}
                      className="h-9"
                    />
                  </FieldRow>
                  <FieldRow label="سبب الاشتراك">
                    <Select value={draft.reason} onValueChange={(v) => set("reason", v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldRow>
                </>
              )}

              {step === "company" && (
                <>
                  <FieldRow label="اسم الشركة">
                    <Input
                      value={draft.name}
                      onChange={(e) => set("name", e.target.value)}
                      className="h-9"
                    />
                  </FieldRow>
                  <FieldRow label="هاتف الشركة">
                    <Input
                      value={draft.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      dir="ltr"
                      className="h-9"
                      placeholder="+9665XXXXXXXX"
                    />
                  </FieldRow>
                </>
              )}

              {step === "branch" && (
                <>
                  <FieldRow label="اسم الفرع">
                    <Input
                      value={draft.name}
                      onChange={(e) => set("name", e.target.value)}
                      className="h-9"
                    />
                  </FieldRow>
                  <FieldRow label="هاتف الفرع">
                    <Input
                      value={draft.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      dir="ltr"
                      className="h-9"
                      placeholder="+9665XXXXXXXX"
                    />
                  </FieldRow>
                  <FieldRow label="العنوان">
                    <Input
                      value={draft.address}
                      onChange={(e) => set("address", e.target.value)}
                      className="h-9"
                    />
                  </FieldRow>
                  <FieldRow label="الأقسام (افصل بفاصلة)">
                    <Input
                      value={draft.departments}
                      onChange={(e) => set("departments", e.target.value)}
                      className="h-9"
                      placeholder="المبيعات، الإيجارات، الصيانة"
                    />
                  </FieldRow>
                </>
              )}

              {step === "property" && (
                <>
                  <FieldRow label="اسم العقار">
                    <Input
                      value={draft.title}
                      onChange={(e) => set("title", e.target.value)}
                      className="h-9"
                    />
                  </FieldRow>
                  <FieldRow label="النوع">
                    <Select
                      value={draft.property_type || undefined}
                      onValueChange={(v) =>
                        set("property_type", v as DraftState["property_type"])
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROP_TYPE_LABELS).map(([v, label]) => (
                          <SelectItem key={v} value={v}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldRow>
                  <FieldRow label="المدينة">
                    <Input
                      value={draft.city}
                      onChange={(e) => set("city", e.target.value)}
                      className="h-9"
                    />
                  </FieldRow>
                  <FieldRow label="السعر (ر.س)">
                    <Input
                      value={draft.price}
                      onChange={(e) => set("price", e.target.value)}
                      type="number"
                      min={0}
                      dir="ltr"
                      className="h-9"
                    />
                  </FieldRow>
                </>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("input")}
                disabled={busy}
                className="gap-1"
              >
                <ArrowLeft className="size-3.5 rtl:rotate-180" />
                رجوع للنص
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={apply}
                disabled={countAppliedFields(step, draft) === 0}
              >
                تطبيق على النموذج
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
