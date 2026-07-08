import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const purposeSchema = z.enum(["sale", "rent_monthly", "rent_yearly"]);

const manualInputSchema = z.object({
  property_type: z.string().min(2).max(40),
  city: z.string().min(2).max(80),
  area_sqm: z.number().positive().max(100000),
  bedrooms: z.number().int().min(0).max(30).optional().nullable(),
  bathrooms: z.number().int().min(0).max(30).optional().nullable(),
  address: z.string().max(240).optional().nullable(),
  condition: z.enum(["new", "excellent", "good", "fair", "poor"]).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const inputSchema = z.object({
  org_id: z.string().uuid(),
  property_id: z.string().uuid().optional().nullable(),
  purpose: purposeSchema,
  manual: manualInputSchema.optional().nullable(),
  save: z.boolean().default(true),
});

type ValuationResult = {
  suggested_price: number;
  min_price: number;
  max_price: number;
  currency: string;
  confidence: "high" | "medium" | "low";
  factors: Array<{ label: string; impact: "positive" | "neutral" | "negative"; note?: string }>;
  recommendations: string[];
  ai_notes: string;
};

export const valuateProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // membership guard
    const { data: isMember, error: memberErr } = await context.supabase.rpc(
      "is_org_member",
      { _org: data.org_id, _user: context.userId },
    );
    if (memberErr) throw memberErr;
    if (!isMember) throw new Error("Forbidden: not an organization member");

    // property snapshot
    let subject: Record<string, unknown> = {};
    if (data.property_id) {
      const { data: prop, error } = await context.supabase
        .from("properties")
        .select(
          "id, title_ar, title_en, property_type, city, address, area_sqm, bedrooms, bathrooms, price, currency, listing_type, status",
        )
        .eq("id", data.property_id)
        .eq("org_id", data.org_id)
        .maybeSingle();
      if (error) throw error;
      if (!prop) throw new Error("Property not found");
      subject = prop;
    } else if (data.manual) {
      subject = { ...data.manual };
    } else {
      throw new Error("Provide property_id or manual input");
    }

    const city = (subject.city as string) ?? data.manual?.city ?? "";
    const propType = (subject.property_type as string) ?? data.manual?.property_type ?? "";
    const area = Number(subject.area_sqm ?? data.manual?.area_sqm ?? 0);

    // comparables from same org + public listings
    const areaMin = area * 0.7;
    const areaMax = area * 1.3;
    const { data: comps } = await context.supabase
      .from("properties")
      .select(
        "id, title_ar, title_en, city, area_sqm, bedrooms, bathrooms, price, currency, listing_type, property_type",
      )
      .eq("city", city)
      .eq("property_type", propType as never)
      .gte("area_sqm", areaMin || 0)
      .lte("area_sqm", areaMax || 1_000_000)
      .neq("id", data.property_id ?? "00000000-0000-0000-0000-000000000000")
      .limit(10);

    const comparables = comps ?? [];

    const system = [
      "You are a Saudi real-estate valuation expert.",
      "Estimate a fair market price in SAR for the subject property based on the provided data and local comparables.",
      "Consider: location, area, condition, market segment, comparables median, and the purpose (sale/rent_monthly/rent_yearly).",
      "Return STRICT JSON only. All prices in SAR as plain numbers (no commas).",
      "For rent_monthly return a monthly rent amount; for rent_yearly return a yearly rent; for sale return a total sale price.",
      "factors: 3-6 short items with impact positive/neutral/negative.",
      "recommendations: 2-4 short Arabic strings on how to improve the value.",
      "ai_notes: 1-3 short Arabic sentences summarizing the rationale.",
      "confidence: high if 5+ close comparables, medium if 2-4, low otherwise.",
    ].join("\n");

    const userPayload = {
      purpose: data.purpose,
      subject,
      comparables,
      currency: "SAR",
    };

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "valuation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              suggested_price: { type: "number" },
              min_price: { type: "number" },
              max_price: { type: "number" },
              currency: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              factors: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: { type: "string" },
                    impact: { type: "string", enum: ["positive", "neutral", "negative"] },
                    note: { type: "string" },
                  },
                  required: ["label", "impact", "note"],
                },
              },
              recommendations: { type: "array", items: { type: "string" } },
              ai_notes: { type: "string" },
            },
            required: [
              "suggested_price",
              "min_price",
              "max_price",
              "currency",
              "confidence",
              "factors",
              "recommendations",
              "ai_notes",
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
      if (res.status === 429) throw new Error("تم تجاوز حد الطلبات، حاول بعد قليل");
      if (res.status === 402) throw new Error("رصيد الذكاء الاصطناعي غير كافٍ");
      throw new Error(`فشل التقييم [${res.status}]: ${errBody.slice(0, 200)}`);
    }

    const json = (await res.json()) as any;
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: ValuationResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("تعذر قراءة نتيجة الذكاء الاصطناعي");
      parsed = JSON.parse(m[0]);
    }

    const result: ValuationResult = {
      suggested_price: Number(parsed.suggested_price) || 0,
      min_price: Number(parsed.min_price) || 0,
      max_price: Number(parsed.max_price) || 0,
      currency: parsed.currency || "SAR",
      confidence: (["high", "medium", "low"] as const).includes(parsed.confidence)
        ? parsed.confidence
        : "medium",
      factors: Array.isArray(parsed.factors) ? parsed.factors.slice(0, 8) : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.slice(0, 6)
        : [],
      ai_notes: String(parsed.ai_notes ?? ""),
    };

    let saved_id: string | null = null;
    if (data.save) {
      const { data: row, error } = await context.supabase
        .from("property_valuations")
        .insert({
          org_id: data.org_id,
          property_id: data.property_id ?? null,
          created_by: context.userId,
          purpose: data.purpose,
          input_snapshot: { subject, manual: data.manual ?? null } as any,
          suggested_price: result.suggested_price,
          min_price: result.min_price,
          max_price: result.max_price,
          currency: result.currency,
          confidence: result.confidence,
          factors: result.factors as any,
          recommendations: result.recommendations as any,
          comparables: comparables as any,
          ai_notes: result.ai_notes,
          model: MODEL,
        })
        .select("id")
        .single();
      if (error) throw error;
      saved_id = row.id;
    }

    return {
      ...result,
      comparables_count: comparables.length,
      saved_id,
    };
  });

export const listValuations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        property_id: z.string().uuid().optional().nullable(),
        limit: z.number().int().min(1).max(50).default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("property_valuations")
      .select("*")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.property_id) q = q.eq("property_id", data.property_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });