import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";
import {
  DEFAULT_SERVICE_KEYS,
  SERVICE_CATALOG,
  normalizeServiceKeys,
  type ServiceKey,
} from "@/lib/service-catalog";

const settingKey = (orgId: string) => `org_services:${orgId}`;

type ServiceSettingsPayload = {
  enabled: ServiceKey[];
  updated_at?: string;
  updated_by?: string | null;
};

function parsePayload(value: string | null | undefined): ServiceSettingsPayload {
  if (!value) return { enabled: DEFAULT_SERVICE_KEYS };
  try {
    const parsed = JSON.parse(value) as Partial<ServiceSettingsPayload>;
    return {
      enabled: normalizeServiceKeys(parsed.enabled),
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : undefined,
      updated_by: typeof parsed.updated_by === "string" ? parsed.updated_by : null,
    };
  } catch {
    return { enabled: DEFAULT_SERVICE_KEYS };
  }
}

const updateSchema = z.object({
  orgId: z.string().uuid(),
  enabled: z.array(z.string()).default([]),
});

export const getMyServiceEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("org_id, role, organizations!inner(id, name)")
      .eq("user_id", context.userId)
      .limit(1);

    if (memberError) throw memberError;
    const membership = memberships?.[0] as any;
    const orgId = membership?.org_id ?? null;
    if (!orgId) {
      return {
        org_id: null,
        org_name: null,
        role: null,
        enabled: DEFAULT_SERVICE_KEYS,
        catalog: SERVICE_CATALOG,
      };
    }

    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", settingKey(orgId))
      .maybeSingle();

    const payload = parsePayload(data?.value);
    return {
      org_id: orgId,
      org_name: membership.organizations?.name ?? null,
      role: membership.role ?? null,
      enabled: payload.enabled,
      catalog: SERVICE_CATALOG,
    };
  });

export const listOrgServiceSettings = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: orgs, error: orgError }, { data: settings, error: settingsError }] =
      await Promise.all([
        supabaseAdmin
          .from("organizations")
          .select("id, name, slug, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabaseAdmin
          .from("app_settings")
          .select("key, value, updated_at, updated_by")
          .like("key", "org_services:%"),
      ]);

    if (orgError) throw orgError;
    if (settingsError) throw settingsError;

    const byOrg = new Map((settings ?? []).map((row: any) => [String(row.key).replace("org_services:", ""), row]));

    return (orgs ?? []).map((org: any) => {
      const row = byOrg.get(org.id);
      const payload = parsePayload(row?.value);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        created_at: org.created_at,
        enabled: payload.enabled,
        updated_at: row?.updated_at ?? payload.updated_at ?? null,
        services_count: payload.enabled.length,
        total_services: SERVICE_CATALOG.length,
      };
    });
  });

export const updateOrgServiceSettings = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const enabled = normalizeServiceKeys(data.enabled);
    const value = JSON.stringify({
      enabled,
      updated_at: new Date().toISOString(),
      updated_by: context.userId ?? null,
    });

    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        {
          key: settingKey(data.orgId),
          value,
          updated_by: context.userId ?? null,
        },
        { onConflict: "key" },
      );

    if (error) throw error;
    return { ok: true, enabled };
  });
