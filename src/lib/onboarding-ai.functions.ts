import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const StepEnum = z.enum(["profile", "company", "branch", "property"]);
type Step = z.infer<typeof StepEnum>;

const Input = z.object({
  step: StepEnum,
  description: z.string().trim().min(3).max(2000),
});

export type ExtractedFields = {
  full_name?: string;
  phone?: string;
  job_title?: string;
  reason?: string;
  name?: string;
  address?: string;
  departments?: string[];
  title?: string;
  property_type?: "apartment" | "villa" | "office" | "land" | "shop" | "building";
  city?: string;
  price?: number;
};

// مخطط موحّد اختياري لكل الحقول لتجنّب اتحاد المخططات (تعارض أنواع في AI SDK).
const UnifiedSchema = z.object({
  full_name: z.string().optional(),
  phone: z.string().optional(),
  job_title: z.string().optional(),
  reason: z.string().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  departments: z.array(z.string()).optional(),
  title: z.string().optional(),
  property_type: z
    .enum(["apartment", "villa", "office", "land", "shop", "building"])
    .optional(),
  city: z.string().optional(),
  price: z.number().optional(),
});

function promptFor(step: Step, description: string) {
  const rules =
    "استخرج البيانات من الوصف التالي كما هي بلا تخمين. اترك أي حقل غير مذكور خارج الإجابة. " +
    "لأرقام الجوال السعودية، أعِدها بصيغة +9665XXXXXXXX. لا تُترجم الأسماء.";
  const stepHint =
    step === "profile"
      ? "املأ فقط: full_name، phone، job_title، reason (اختر من: إدارة عقارات وإيجارات، إدارة صيانة ومهام، تنظيم المبيعات والعمولات، تقارير مالية وتحليلات، تجربة النظام قبل الاشتراك، أخرى)."
      : step === "company"
        ? "املأ فقط: name (اسم الشركة)، phone (رقم اتصال الشركة)."
        : step === "branch"
          ? "املأ فقط: name (اسم الفرع)، phone، address، departments (مصفوفة أسماء الأقسام)."
          : "املأ فقط: title (اسم العقار)، property_type (apartment/villa/office/land/shop/building)، city، price (رقم بالريال).";
  return `${rules}\n${stepHint}\n\nالوصف:\n${description}`;
}

const ALLOWED: Record<Step, ReadonlyArray<keyof ExtractedFields>> = {
  profile: ["full_name", "phone", "job_title", "reason"],
  company: ["name", "phone"],
  branch: ["name", "phone", "address", "departments"],
  property: ["title", "property_type", "city", "price"],
};

function pickAllowed(step: Step, raw: Record<string, unknown>): ExtractedFields {
  const out: ExtractedFields = {};
  for (const k of ALLOWED[step]) {
    const v = raw[k];
    if (v === undefined || v === null || v === "") continue;
    // @ts-expect-error narrowing per allowed key set
    out[k] = v;
  }
  return out;
}

/**
 * مساعد ذكي أثناء الأونبوردنق: يستخرج حقول الخطوة الحالية من وصف حرّ.
 * يُعيد كائناً جزئياً فقط بالحقول المُستنتجة.
 */
export const aiExtractOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; step: Step; fields: ExtractedFields }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(apiKey);

    try {
      const result = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        experimental_output: Output.object({ schema: UnifiedSchema }),
        prompt: promptFor(data.step, data.description),
      });
      const raw = (result.experimental_output ?? {}) as Record<string, unknown>;
      return { ok: true, step: data.step, fields: pickAllowed(data.step, raw) };
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        return { ok: false, step: data.step, fields: {} };
      }
      throw err;
    }
  });
