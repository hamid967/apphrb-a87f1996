import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const InputSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(TurnSchema).max(20).optional(),
});

const ROUTES: Array<{ path: string; label: string; keywords: string }> = [
  { path: "/auth?mode=signup", label: "افتح التسجيل", keywords: "تسجيل حساب signup register" },
  { path: "/dashboard", label: "افتح لوحة التحكم", keywords: "لوحة رئيسية dashboard" },
  { path: "/properties", label: "افتح العقارات", keywords: "عقارات properties" },
  { path: "/properties/new", label: "أضف عقار", keywords: "اضف عقار add property" },
  { path: "/leasing", label: "افتح التأجير والعقود", keywords: "عقود تأجير leasing" },
  { path: "/accounting", label: "افتح المحاسبة", keywords: "تحصيل محاسبة دفعات" },
  { path: "/maintenance", label: "افتح الصيانة", keywords: "صيانة بلاغ" },
  { path: "/reports", label: "افتح التقارير", keywords: "تقارير مؤشرات" },
  { path: "/contacts", label: "افتح العملاء", keywords: "عملاء مالك مستأجر crm" },
  { path: "/tasks", label: "افتح المهام", keywords: "مهام tasks" },
  { path: "/assistant", label: "افتح المساعد الكامل", keywords: "مساعد ai" },
  { path: "/settings/import", label: "افتح الاستيراد", keywords: "استيراد csv excel" },
];

const SYSTEM_PROMPT = `أنت "حامد"، مساعد صوتي سعودي داخل منصة HBSpro لإدارة العقارات.
- تكلّم باللهجة السعودية الدارجة الطبيعية (نجدية مهذّبة)، استخدم عبارات مثل: "هلا والله"، "أبشر"، "حيّاك"، "طيّب"، "على طول"، "تمام"، "من عيوني"، "وش تبي أسوّي لك؟"، "خلّها عليّ"، "زين".
- لا تستخدم الفصحى الجافة ولا لهجات مصرية أو شامية.
- ردودك قصيرة جداً (جملة أو جملتين)، طبيعية للنطق الصوتي، بدون Markdown أو رموز أو قوائم.
- إذا كان طلب المستخدم مرتبطاً بصفحة داخل النظام، اقترح الانتقال لها بإرجاع action_path من القائمة المسموحة فقط.
- إذا ما فيه مسار مناسب، خلّ action_path و action_label فاضيين.
- لا تخترع مسارات أو أرقام أو بيانات؛ إذا ما تعرف اطلب توضيح بسرعة.
- لا تطلب كلمات مرور ولا رموز تحقق أبداً.

القائمة المسموحة للمسارات:
${ROUTES.map((r) => `- ${r.path} — ${r.label} (${r.keywords})`).join("\n")}

أعد الرد كـ JSON صالح فقط بهذا الشكل بدون أي شرح خارجي:
{"reply":"...","action_path":"/... or empty","action_label":"... or empty"}`;

type AgentReply = {
  reply: string;
  action_path?: string;
  action_label?: string;
};

function safeParse(text: string): AgentReply {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(trimmed) as AgentReply;
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) throw new Error("no reply");
    const allowed = new Set(ROUTES.map((r) => r.path));
    const path = parsed.action_path && allowed.has(parsed.action_path) ? parsed.action_path : undefined;
    const label = path ? parsed.action_label || ROUTES.find((r) => r.path === path)?.label : undefined;
    return { reply: parsed.reply.trim(), action_path: path, action_label: label };
  } catch {
    return { reply: text.trim() || "حاضر، أعد صياغة طلبك رجاءً." };
  }
}

export const askHamidAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AgentReply> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...(data.history ?? []).map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content: data.message },
    ];

    try {
      const { text } = await generateText({ model, messages });
      return safeParse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير متوقع";
      if (/402/.test(message)) {
        return { reply: "انتهى رصيد الذكاء الاصطناعي، يرجى التواصل مع مدير الحساب." };
      }
      if (/429/.test(message)) {
        return { reply: "الطلبات كثيرة الآن، جرّب بعد لحظات قليلة." };
      }
      return { reply: "حصل خطأ مؤقت أثناء التفكير، حاول مرة ثانية." };
    }
  });
