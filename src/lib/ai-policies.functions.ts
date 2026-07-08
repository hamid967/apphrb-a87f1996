import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  description: z.string().trim().min(4).max(2000),
  defaultCurrency: z.string().trim().min(3).max(4).default("SAR"),
});

const PolicySchema = z.object({
  category: z.string().trim().min(1).max(40),
  max_amount: z.number().nonnegative().max(1_000_000).nullable().optional(),
  currency: z.string().trim().min(3).max(4),
  note: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().default(true),
  rule_type: z
    .enum([
      "max_amount",
      "requires_receipt",
      "requires_description",
      "forbidden_keywords",
      "max_per_period",
    ])
    .default("max_amount"),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  period_days: z.number().int().positive().max(365).nullable().optional(),
  severity: z.enum(["warn", "block"]).default("warn"),
});

const OutputSchema = z.object({ policies: z.array(PolicySchema).min(1).max(20) });

export type AiPolicyDraft = z.infer<typeof PolicySchema>;

export const generatePoliciesFromDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }): Promise<{ policies: AiPolicyDraft[] }> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const system =
      "You convert a natural-language description of spending rules into structured policies for a rules engine. " +
      "Each policy has: category (short lowercase slug — maintenance, utilities, marketing, salaries, supplies, travel, general; use '*' for all), " +
      "rule_type (one of: max_amount, requires_receipt, requires_description, forbidden_keywords, max_per_period), " +
      "max_amount (numeric cap when the rule needs one — max_amount and max_per_period), " +
      "period_days (integer window for max_per_period, e.g. 30 = monthly), " +
      "keywords (list of forbidden substrings when rule_type is forbidden_keywords), " +
      "severity ('warn' by default, 'block' when the user says must/never/strict/hard-cap), " +
      "currency (3-letter ISO, default " +
      data.defaultCurrency +
      "). " +
      "Emit one policy per rule. Return only the tool call; no prose.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: data.description },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "emit_policies",
              description: "Emit the list of spending policies extracted from the description.",
              parameters: {
                type: "object",
                properties: {
                  policies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string" },
                        max_amount: { type: "number" },
                        currency: { type: "string" },
                        note: { type: "string" },
                        active: { type: "boolean" },
                        rule_type: { type: "string" },
                        keywords: { type: "array", items: { type: "string" } },
                        period_days: { type: "number" },
                        severity: { type: "string" },
                      },
                      required: ["category", "currency", "rule_type"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["policies"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "emit_policies" } },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached, try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
    if (!res.ok)
      throw new Error(`AI request failed: ${res.status} ${await res.text().catch(() => "")}`);

    const json = await res.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return a structured response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      throw new Error("AI returned invalid JSON");
    }
    return OutputSchema.parse(parsed);
  });
