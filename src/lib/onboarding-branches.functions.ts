import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  org_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  departments: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

export const createOnboardingBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: branch, error: bErr } = await context.supabase
      .from("branches")
      .insert({
        org_id: data.org_id,
        name: data.name,
        phone: data.phone ?? null,
        address: data.address ?? null,
      })
      .select("id")
      .single();
    if (bErr) throw new Error(bErr.message);

    const uniq = Array.from(new Set(data.departments.map((d) => d.trim()).filter(Boolean)));
    if (uniq.length) {
      const rows = uniq.map((name) => ({
        org_id: data.org_id,
        branch_id: branch.id as string,
        name,
      }));
      const { error: dErr } = await context.supabase.from("departments").insert(rows);
      if (dErr) throw new Error(dErr.message);
    }
    return { branch_id: branch.id as string, departments: uniq.length };
  });
