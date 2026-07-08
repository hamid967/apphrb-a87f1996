import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ocrInput = z.object({
  path: z.string().min(1).max(512),
  mime: z.string().min(3).max(64),
});

export type ReceiptOcr = {
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null; // ISO YYYY-MM-DD
  raw?: string;
};

export const ocrReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ocrInput.parse(d))
  .handler(async ({ data, context }): Promise<ReceiptOcr & { path: string }> => {
    const { data: file, error } = await context.supabase.storage
      .from("receipts")
      .download(data.path);
    if (error || !file) throw new Error(error?.message || "تعذّر قراءة الملف");

    const buf = new Uint8Array(await file.arrayBuffer());
    // base64
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY غير مهيأ");

    const isPdf = data.mime === "application/pdf";
    const userBlocks: Array<Record<string, unknown>> = [
      {
        type: "text",
        text:
          "استخرج من هذا الإيصال الحقول التالية كـ JSON فقط بدون أي شرح: " +
          '{"merchant": string|null, "amount": number|null, "currency": string|null, "date": "YYYY-MM-DD"|null}. ' +
          "amount رقم عشري بدون رموز. currency كود ISO مثل SAR/USD. لا تضف حقولاً أخرى.",
      },
      isPdf
        ? {
            type: "file",
            file: { filename: "receipt.pdf", file_data: `data:application/pdf;base64,${b64}` },
          }
        : {
            type: "image_url",
            image_url: { url: `data:${data.mime};base64,${b64}` },
          },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: userBlocks }],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OCR failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: ReceiptOcr = { merchant: null, amount: null, currency: null, date: null };
    try {
      const obj = JSON.parse(content) as Partial<ReceiptOcr>;
      parsed = {
        merchant: obj.merchant ?? null,
        amount:
          typeof obj.amount === "number" ? obj.amount : obj.amount ? Number(obj.amount) : null,
        currency: obj.currency ?? null,
        date: obj.date ?? null,
      };
    } catch {
      parsed.raw = content;
    }

    // Save into onboarding_progress.first_receipt
    const { data: profRow } = await context.supabase
      .from("profiles")
      .select("onboarding_progress")
      .eq("id", context.userId)
      .maybeSingle();
    const cur = (profRow?.onboarding_progress ?? {}) as Record<string, unknown>;
    const nextProgress = {
      ...cur,
      first_receipt: {
        done: true,
        at: new Date().toISOString(),
        path: data.path,
        ...parsed,
      },
    };
    const requiredSteps = ["profile", "company", "first_receipt"];
    const allDone = requiredSteps.every(
      (s) => (nextProgress as Record<string, { done?: boolean }>)[s]?.done,
    );
    await context.supabase
      .from("profiles")
      .update({
        onboarding_progress: nextProgress,
        onboarding_completed_at: allDone ? new Date().toISOString() : null,
      })
      .eq("id", context.userId);

    return { ...parsed, path: data.path };
  });
