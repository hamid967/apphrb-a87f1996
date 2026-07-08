import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ReceiptExtract = {
  amount: number | null;
  currency: string | null;
  bank_name: string | null;
  reference: string | null;
  transferred_at: string | null; // ISO date yyyy-mm-dd
  confidence: "high" | "medium" | "low";
  raw_notes?: string | null;
};

export const extractReceiptFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { image_data_url: string; known_banks?: string[] }) => {
      if (!data?.image_data_url?.startsWith("data:image/")) {
        throw new Error("image_data_url must be a data:image/* base64 URL");
      }
      // ~7MB cap on base64 payload
      if (data.image_data_url.length > 7_500_000) {
        throw new Error("Image too large for OCR (max ~5MB source)");
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<ReceiptExtract> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const banksLine = (data.known_banks ?? []).slice(0, 30).join(" | ");
    const system = [
      "You extract structured fields from Saudi bank transfer receipts (Arabic or English).",
      "Return STRICT JSON only, matching the requested schema. Use null when unsure.",
      "amount: the transferred amount as a plain number (no commas). Prefer the total/transferred amount, not fees.",
      "currency: 3-letter code (SAR by default for Saudi receipts).",
      "bank_name: the sending or receiving bank name in English if possible; if the receipt clearly matches one of the known banks below, return that exact name.",
      "reference: transaction/reference number if visible.",
      "transferred_at: transfer or transaction date as ISO yyyy-mm-dd. Convert Hijri to Gregorian if only Hijri is shown.",
      "confidence: high/medium/low based on legibility.",
      banksLine ? `Known banks: ${banksLine}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the fields from this bank transfer receipt.",
            },
            { type: "image_url", image_url: { url: data.image_data_url } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "receipt_fields",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              amount: { type: ["number", "null"] },
              currency: { type: ["string", "null"] },
              bank_name: { type: ["string", "null"] },
              reference: { type: ["string", "null"] },
              transferred_at: { type: ["string", "null"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              raw_notes: { type: ["string", "null"] },
            },
            required: [
              "amount",
              "currency",
              "bank_name",
              "reference",
              "transferred_at",
              "confidence",
              "raw_notes",
            ],
          },
        },
      },
    };

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      if (res.status === 429) throw new Error("OCR rate limit — try again shortly");
      if (res.status === 402) throw new Error("AI credits exhausted");
      throw new Error(`OCR failed [${res.status}]: ${errBody.slice(0, 300)}`);
    }

    const json = (await res.json()) as any;
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // model sometimes wraps in ```json fences
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("OCR returned unparseable output");
    }

    const num = (v: unknown) => {
      if (v == null) return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const isoDate = (v: unknown) => {
      if (!v || typeof v !== "string") return null;
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    };

    return {
      amount: num(parsed.amount),
      currency: parsed.currency ?? null,
      bank_name: parsed.bank_name ?? null,
      reference: parsed.reference ?? null,
      transferred_at: isoDate(parsed.transferred_at),
      confidence: (["high", "medium", "low"] as const).includes(parsed.confidence)
        ? parsed.confidence
        : "low",
      raw_notes: parsed.raw_notes ?? null,
    };
  });