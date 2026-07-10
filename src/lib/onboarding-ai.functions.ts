import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const StepEnum = z.enum(["profile", "company", "branch", "property"]);

const Input = z.object({
  step: StepEnum,
  description: z.string().trim().min(3).max(2000),
});

/**
 * مساعد ذكي أثناء الأونبوردنق: يستخرج حقول الخطوة الحالية من وصف حرّ يكتبه
 * المستخدم بالعربية. يعيد كائن جزئي لا يحتوي إلا الحقول التي أمكن استنتاجها،
 * وتُترك القيم الأخرى غير مُعرَّفة كي يُبقي الفورم قيمها الحالية.
 */

const ProfileSchema = z.object({
  full_name: z.string().optional(),
  phone: z.string().optional(),
  job_title: z.string().optional(),
  reason: z
    .enum([
      "إدارة عقارات وإيجارات",
      "إدارة صيانة ومهام",
      "تنظيم المبيعات والعمولات",
      "تقارير مالية وتحليلات",
      "تجربة النظام قبل الاشتراك",
      "أخرى",
    ])
    .optional(),
});

const CompanySchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
});

const BranchSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  departments: z.array(z.string()).optional(),
});

const PropertySchema = z.object({
  title: z.string().optional(),
  property_type: z.enum(["apartment", "villa", "office", "land", "shop", "building"]).optional(),
  city: z.string().optional(),
  price: z.number().optional(),
});

function schemaFor(step: z.infer<typeof StepEnum>) {
  switch (step) {
    case "profile":
      return ProfileSchema;
    case "company":
      return CompanySchema;
    case "branch":
      return BranchSchema;
    case "property":
      return PropertySchema;
  }
}

function promptFor(step: z.infer<typeof StepEnum>, description: string) {
  const rules =
    "استخرج البيانات من الوصف التالي كما هي بلا تخمين. اترك أي حقل غير مذكور خارج الإجابة. " +
    "استخدم الأرقام العربية للأرقام. لأرقام الجوال السعودية، أعِدها بصيغة +9665XXXXXXXX. " +
    "لا تُترجم الأسماء، احتفظ باللغة كما ذكرها المستخدم.";
  const stepHint =
    step === "profile"
      ? "الحقول المطلوبة: الاسم الكامل، رقم الجوال، المسمى الوظيفي، سبب الاشتراك."
      : step === "company"
        ? "الحقول: اسم الشركة/مساحة العمل، رقم اتصال الشركة."
        : step === "branch"
          ? "الحقول: اسم الفرع، رقم هاتف الفرع، العنوان، قائمة الأقسام (departments) كمصفوفة نصية."
          : "الحقول: اسم العقار (title)، نوع العقار (apartment/villa/office/land/shop/building)، المدينة، السعر بالريال (رقم فقط).";
  return `${rules}\n${stepHint}\n\nالوصف:\n${description}`;
}

export const aiExtractOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const schema = schemaFor(data.step);

    try {
      const { experimental_output: output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        output: Output.object({ schema }),
        prompt: promptFor(data.step, data.description),
      });
      return { ok: true as const, step: data.step, fields: output };
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        // نموذج لم يُطابق المخطط — نُعيد فراغاً بدل الأعطال
        return { ok: false as const, step: data.step, fields: {} as Record<string, unknown> };
      }
      throw err;
    }
  });
