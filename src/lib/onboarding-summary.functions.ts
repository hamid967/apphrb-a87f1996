import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingSummary = {
  profile: {
    full_name: string | null;
    phone: string | null;
    job_title: string | null;
    signup_reason: string | null;
    onboarding_completed_at: string | null;
  } | null;
  company: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    created_at: string;
  } | null;
  branches: Array<{
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    created_at: string;
    departments: Array<{ id: string; name: string }>;
  }>;
  properties: Array<{
    id: string;
    title_ar: string | null;
    title_en: string | null;
    property_type: string | null;
    city: string | null;
    price: number | null;
    currency: string | null;
    created_at: string;
  }>;
};

export const getOnboardingSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OnboardingSummary> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, job_title, signup_reason, onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle();

    const { data: member } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    const orgId = member?.org_id as string | undefined;
    if (!orgId) {
      return { profile: profile ?? null, company: null, branches: [], properties: [] };
    }

    const [{ data: company }, { data: branchRows }, { data: propertyRows }] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name, phone, address, created_at")
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("branches")
        .select("id, name, phone, address, created_at")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("properties")
        .select("id, title_ar, title_en, property_type, city, price, currency, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(20),
    ]);

    const branchIds = (branchRows ?? []).map((b) => b.id as string);
    let departments: Array<{ id: string; name: string; branch_id: string }> = [];
    if (branchIds.length) {
      const { data: depRows } = await supabase
        .from("departments")
        .select("id, name, branch_id")
        .in("branch_id", branchIds);
      departments = (depRows ?? []) as typeof departments;
    }

    const branches = (branchRows ?? []).map((b) => ({
      id: b.id as string,
      name: b.name as string,
      phone: (b.phone as string | null) ?? null,
      address: (b.address as string | null) ?? null,
      created_at: b.created_at as string,
      departments: departments
        .filter((d) => d.branch_id === b.id)
        .map((d) => ({ id: d.id, name: d.name })),
    }));

    return {
      profile: profile ?? null,
      company: company
        ? {
            id: company.id as string,
            name: company.name as string,
            phone: (company.phone as string | null) ?? null,
            address: (company.address as string | null) ?? null,
            created_at: company.created_at as string,
          }
        : null,
      branches,
      properties: (propertyRows ?? []).map((p) => ({
        id: p.id as string,
        title_ar: (p.title_ar as string | null) ?? null,
        title_en: (p.title_en as string | null) ?? null,
        property_type: (p.property_type as string | null) ?? null,
        city: (p.city as string | null) ?? null,
        price: (p.price as number | null) ?? null,
        currency: (p.currency as string | null) ?? null,
        created_at: p.created_at as string,
      })),
    };
  });
