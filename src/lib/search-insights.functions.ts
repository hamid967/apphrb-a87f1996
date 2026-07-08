import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthContext } from "@/lib/server-types";

async function assertAdmin(context: AuthContext) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw error;
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

const GATEWAY = "https://connector-gateway.lovable.dev/semrush";

const COUNTRIES: { db: string; code: string; nameAr: string; nameEn: string }[] = [
  { db: "sa", code: "SA", nameAr: "السعودية", nameEn: "Saudi Arabia" },
  { db: "ae", code: "AE", nameAr: "الإمارات", nameEn: "UAE" },
  { db: "eg", code: "EG", nameAr: "مصر", nameEn: "Egypt" },
  { db: "qa", code: "QA", nameAr: "قطر", nameEn: "Qatar" },
  { db: "kw", code: "KW", nameAr: "الكويت", nameEn: "Kuwait" },
  { db: "us", code: "US", nameAr: "الولايات المتحدة", nameEn: "United States" },
  { db: "uk", code: "GB", nameAr: "المملكة المتحدة", nameEn: "United Kingdom" },
];

type Row = Record<string, string>;

async function callSemrush(path: string, params: Record<string, string>) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const semrushKey = process.env.SEMRUSH_API_KEY;
  if (!lovableKey || !semrushKey) throw new Error("Semrush connection not configured");

  const url = new URL(GATEWAY + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": semrushKey,
    },
  });
  const text = await res.text();
  let json: { data?: { columnNames?: string[]; rows?: Row[] }; error?: string; status?: number };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Semrush ${res.status}: ${text.slice(0, 160)}`);
  }
  if (!res.ok || json.error) throw new Error(json.error || `Semrush ${res.status}`);
  return json.data;
}

function parseTrends(td: string | undefined): number[] {
  // Semrush "Td" is a comma-separated list of 12 monthly relative values (0..1)
  if (!td) return new Array(12).fill(0);
  return td
    .split(",")
    .map((s) => Number(s) || 0)
    .slice(0, 12);
}

export type CountryInsight = {
  db: string;
  code: string;
  nameAr: string;
  nameEn: string;
  volume: number;
  cpc: number;
  competition: number;
  trend: number[]; // 12 months, oldest -> newest, relative 0..1
};

export type SearchInsightsResult = {
  phrase: string;
  fetchedAt: string;
  months: string[]; // 12 labels (YYYY-MM)
  countries: CountryInsight[];
  related: { phrase: string; volume: number; cpc: number; difficulty: number }[];
};

function last12MonthLabels(): string[] {
  const now = new Date();
  const arr: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return arr;
}

export const getSearchInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phrase?: string }) => ({
    phrase: (input?.phrase || "إدارة عقارات").trim().slice(0, 80),
  }))
  .handler(async ({ data, context }): Promise<SearchInsightsResult> => {
    await assertAdmin(context);

    const results = await Promise.allSettled(
      COUNTRIES.map((c) =>
        callSemrush("/keywords/phrase_this", {
          phrase: data.phrase,
          database: c.db,
          export_columns: "Ph,Nq,Cp,Co,Td",
        }).then((d) => ({ c, row: d?.rows?.[0] as Row | undefined })),
      ),
    );

    const countries: CountryInsight[] = results.map((r, i) => {
      const meta = COUNTRIES[i];
      if (r.status !== "fulfilled" || !r.value.row) {
        return {
          db: meta.db,
          code: meta.code,
          nameAr: meta.nameAr,
          nameEn: meta.nameEn,
          volume: 0,
          cpc: 0,
          competition: 0,
          trend: new Array(12).fill(0),
        };
      }
      const row = r.value.row;
      return {
        db: meta.db,
        code: meta.code,
        nameAr: meta.nameAr,
        nameEn: meta.nameEn,
        volume: Number(row.Nq || row["Search Volume"] || 0),
        cpc: Number(row.Cp || row["CPC"] || 0),
        competition: Number(row.Co || row["Competition"] || 0),
        trend: parseTrends(row.Td || row["Trends"]),
      };
    });

    return {
      phrase: data.phrase,
      fetchedAt: new Date().toISOString(),
      months: last12MonthLabels(),
      countries: countries.sort((a, b) => b.volume - a.volume),
      related: await fetchRelated(data.phrase),
    };
  });

async function fetchRelated(phrase: string) {
  try {
    const d = await callSemrush("/keywords/phrase_related", {
      phrase,
      database: "sa",
      export_columns: "Ph,Nq,Cp,Kd",
      display_limit: "10",
    });
    return (d?.rows || []).map((r) => ({
      phrase: String(r.Ph || ""),
      volume: Number(r.Nq || 0),
      cpc: Number(r.Cp || 0),
      difficulty: Number(r.Kd || 0),
    }));
  } catch {
    return [];
  }
}
