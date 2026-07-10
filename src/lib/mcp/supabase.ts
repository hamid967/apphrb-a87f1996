import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Returns a Supabase client bound to the caller's OAuth token so PostgREST
 * enforces the same RLS policies that apply to that user in the app.
 * Never returns or logs the token.
 */
export function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Resolve the user's active organization id (first membership). */
export async function getUserOrgId(
  ctx: ToolContext,
): Promise<{ orgId: string | null; error?: string }> {
  const sb = supabaseForUser(ctx);
  const { data, error } = await sb
    .from("organization_members")
    .select("org_id")
    .eq("user_id", ctx.getUserId())
    .limit(1)
    .maybeSingle();
  if (error) return { orgId: null, error: error.message };
  return { orgId: (data?.org_id as string | undefined) ?? null };
}

export function errorContent(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

import { z } from "zod";

/** Shared pagination + search inputs for MCP list tools. */
export const listInputShape = {
  q: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Optional case-insensitive text search across the tool's primary fields."),
  page: z.number().int().min(1).max(1000).default(1).describe("1-based page number."),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Rows per page (1-100)."),
} as const;

export type ListInput = { q?: string; page: number; page_size: number };

/** Escape a value for use inside a PostgREST `or(...)` `ilike` filter. */
export function escapeIlike(value: string): string {
  // PostgREST treats `,` `(` `)` and `*` specially; strip them defensively.
  return value.replace(/[,()*]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build a unified list response. `essentials` maps each raw row to a compact
 * shape ({ id, title, subtitle?, status?, date?, meta? }) so every list tool
 * returns the same top-level fields regardless of the underlying table.
 */
export function buildListResponse<TRow extends { id: string | number }>(
  entity: string,
  rows: TRow[],
  input: ListInput,
  total: number | null,
  essentials: (row: TRow) => {
    id: string;
    title: string;
    subtitle?: string | null;
    status?: string | null;
    date?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  const items = rows.map((row) => ({ ...essentials(row), raw: row }));
  const totalKnown = typeof total === "number";
  const hasMore = totalKnown
    ? input.page * input.page_size < total
    : rows.length === input.page_size;
  const summary = totalKnown
    ? `Showing ${items.length} of ${total} ${entity} (page ${input.page}).`
    : `Showing ${items.length} ${entity} on page ${input.page}.`;
  return {
    content: [
      {
        type: "text" as const,
        text: `${summary}\n${JSON.stringify(items.map((i) => ({ id: i.id, title: i.title, status: i.status, date: i.date })), null, 2)}`,
      },
    ],
    structuredContent: {
      entity,
      page: input.page,
      page_size: input.page_size,
      total,
      has_more: hasMore,
      count: items.length,
      items,
    },
  };
}
