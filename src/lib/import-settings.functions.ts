import { createServerFn } from "@tanstack/react-start";
import type { ServerSupabase } from "@/lib/server-types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ROLES, type OrgRole } from "@/lib/permissions";

export const DUP_STRATEGIES = ["skip", "update", "merge"] as const;
export type DupStrategy = (typeof DUP_STRATEGIES)[number];
export const CONTACT_MATCH_KEYS = ["email", "phone"] as const;
export type ContactMatchKey = (typeof CONTACT_MATCH_KEYS)[number];

export type ImportSettings = {
  org_id: string;
  contacts_strategy: DupStrategy;
  contacts_match_keys: ContactMatchKey[];
  leads_strategy: DupStrategy;
};

const DEFAULTS = {
  contacts_strategy: "skip" as DupStrategy,
  contacts_match_keys: ["email", "phone"] as ContactMatchKey[],
  leads_strategy: "skip" as DupStrategy,
};

async function assertOrgRole(
  supabase: ServerSupabase,
  userId: string,
  orgId: string,
  allowed: OrgRole[],
) {
  const { data, error } = await supabase.rpc("has_org_role", {
    _org: orgId,
    _user: userId,
    _roles: allowed,
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden: insufficient role");
}

export async function loadImportSettings(
  supabase: ServerSupabase,
  orgId: string,
): Promise<ImportSettings> {
  const { data, error } = await supabase
    .from("org_import_settings")
    .select("org_id, contacts_strategy, contacts_match_keys, leads_strategy")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { org_id: orgId, ...DEFAULTS };
  return {
    org_id: orgId,
    contacts_strategy: (data.contacts_strategy ?? DEFAULTS.contacts_strategy) as DupStrategy,
    contacts_match_keys: (
      (data.contacts_match_keys ?? DEFAULTS.contacts_match_keys) as string[]
    ).filter((k): k is ContactMatchKey => (CONTACT_MATCH_KEYS as readonly string[]).includes(k)),
    leads_strategy: (data.leads_strategy ?? DEFAULTS.leads_strategy) as DupStrategy,
  };
}

export const getImportSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => loadImportSettings(context.supabase, data.org_id));

const updateSchema = z.object({
  org_id: z.string().uuid(),
  contacts_strategy: z.enum(DUP_STRATEGIES),
  contacts_match_keys: z.array(z.enum(CONTACT_MATCH_KEYS)).min(1),
  leads_strategy: z.enum(DUP_STRATEGIES),
});

export const updateImportSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, context.userId, data.org_id, ADMIN_ROLES);
    const { error } = await context.supabase.from("org_import_settings").upsert(
      {
        org_id: data.org_id,
        contacts_strategy: data.contacts_strategy,
        contacts_match_keys: data.contacts_match_keys,
        leads_strategy: data.leads_strategy,
        updated_by: context.userId,
      },
      { onConflict: "org_id" },
    );
    if (error) throw error;
    return { ok: true };
  });
