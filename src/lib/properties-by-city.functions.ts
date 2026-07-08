import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CityCount = { city: string; count: number };

const input = z.object({ org_id: z.string().uuid() });

export const getPropertiesByCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { org_id: string }) => input.parse(data))
  .handler(async ({ data, context }): Promise<CityCount[]> => {
    const supabase = context.supabase as unknown as { from: (t: string) => any };
    const { data: rows, error } = await supabase
      .from("properties")
      .select("city")
      .eq("org_id", data.org_id);
    if (error) throw error;
    const map = new Map<string, number>();
    for (const r of (rows as { city: string | null }[] | null) ?? []) {
      const key = (r.city ?? "").trim();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([city, count]) => ({ city, count }));
  });
