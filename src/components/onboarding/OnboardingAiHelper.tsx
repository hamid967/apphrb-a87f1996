import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

export function OnboardingAiHelper({
  step,
  onApply,
}: {
  step: Step;
  onApply: (fields: ExtractedFields) => void;
}) {
  const extract = useServerFn(aiExtractOnboarding);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

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
      onApply(res.fields);
      toast.success(`تم تعبئة ${count} حقلاً — راجعها ثم تابع`);
      setOpen(false);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الاستخراج");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent align="end" className="w-[min(92vw,26rem)] p-3" sideOffset={8}>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Wand2 className="size-4 text-primary" />
          مساعد إدخال البيانات
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          اكتب المعلومات بلغة عادية وسأملأ الحقول لك — يمكنك مراجعتها قبل الحفظ.
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
          <Button type="button" size="sm" onClick={run} disabled={busy || text.trim().length < 3}>
            {busy && <Loader2 className="me-1.5 size-3.5 animate-spin" />}
            استخرج وعبّئ
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
