import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ServerSupabase } from "@/lib/server-types";

async function getLeadOrg(supabase: ServerSupabase, id: string): Promise<string> {
  const { data, error } = await supabase.from("leads").select("org_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lead not found");
  return data.org_id as string;
}

/* ----- Lead detail with activities & matches ----- */

export const getLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: lead, error } = await context.supabase
      .from("leads")
      .select(
        "*, contact:contacts(id, full_name, email, phone), property:properties(id, title_ar, title_en)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!lead) throw new Error("Lead not found");

    const [activitiesRes, matchesRes] = await Promise.all([
      context.supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200),
      context.supabase
        .from("listing_lead_matches")
        .select(
          "*, listing:listings(id, slug, title, price, currency, city, hero_image, bedrooms, bathrooms, area)",
        )
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false }),
    ]);
    if (activitiesRes.error) throw activitiesRes.error;
    if (matchesRes.error) throw matchesRes.error;

    return {
      lead,
      activities: activitiesRes.data ?? [],
      matches: matchesRes.data ?? [],
    };
  });

/* ----- Add manual activity (note / call / email / whatsapp) ----- */

const activityType = z.enum(["note", "call", "email", "whatsapp", "viewing", "contract"]);

export const addLeadActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        lead_id: z.string().uuid(),
        activity_type: activityType,
        body: z.string().trim().min(1).max(4000),
        metadata: z.record(z.string(), z.any()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getLeadOrg(context.supabase, data.lead_id);
    const { error } = await context.supabase.from("lead_activities").insert({
      org_id: orgId,
      lead_id: data.lead_id,
      actor_id: context.userId,
      activity_type: data.activity_type,
      body: data.body,
      metadata: data.metadata ?? {},
    });
    if (error) throw error;
    await context.supabase
      .from("leads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", data.lead_id);
    return { ok: true };
  });

/* ----- Listing <-> lead matches ----- */

export const listMatchesForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("listing_lead_matches")
      .select(
        "*, listing:listings(id, slug, title, price, currency, city, hero_image, bedrooms, bathrooms, area)",
      )
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

/** Suggest listings for a lead by budget & city (from linked property or contact-notes) */
export const suggestListingsForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await getLeadOrg(context.supabase, data.lead_id);
    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .select("id, org_id, budget_min, budget_max")
      .eq("id", data.lead_id)
      .maybeSingle();
    if (lErr) throw lErr;
    if (!lead) throw new Error("Lead not found");

    let q = context.supabase
      .from("listings")
      .select("id, title, price, currency, city, hero_image, bedrooms, bathrooms, area")
      .eq("org_id", orgId)
      .eq("published", true)
      .limit(20);
    if (lead.budget_min != null) q = q.gte("price", lead.budget_min);
    if (lead.budget_max != null) q = q.lte("price", lead.budget_max);
    const { data: listings, error } = await q;
    if (error) throw error;

    const inserts = (listings ?? []).map((l) => ({
      org_id: orgId,
      lead_id: data.lead_id,
      listing_id: l.id,
      score: 50,
      status: "suggested" as const,
    }));
    if (inserts.length) {
      await context.supabase
        .from("listing_lead_matches")
        .upsert(inserts, { onConflict: "lead_id,listing_id", ignoreDuplicates: true });
    }
    return { count: inserts.length };
  });

export const updateMatchStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["suggested", "sent", "interested", "rejected"]),
        notes: z.string().max(1000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("listing_lead_matches")
      .update({ status: data.status, notes: data.notes ?? null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const removeMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("listing_lead_matches")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ----- Pipeline analytics ----- */

export const getPipelineAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("v_lead_pipeline")
      .select("*")
      .eq("org_id", data.org_id);
    if (error) throw error;

    const byStage: Record<string, { count: number; value: number }> = {};
    let total = 0;
    let totalValue = 0;
    for (const r of rows ?? []) {
      const stage = String(r.stage);
      byStage[stage] = byStage[stage] ?? { count: 0, value: 0 };
      byStage[stage].count += Number(r.leads_count ?? 0);
      byStage[stage].value += Number(r.pipeline_value ?? 0);
      total += Number(r.leads_count ?? 0);
      totalValue += Number(r.pipeline_value ?? 0);
    }
    const wonCount = byStage["won"]?.count ?? 0;
    const lostCount = byStage["lost"]?.count ?? 0;
    const closedTotal = wonCount + lostCount;
    const winRate = closedTotal > 0 ? Math.round((wonCount / closedTotal) * 100) : 0;

    return { byStage, total, totalValue, winRate, wonCount, lostCount };
  });

/* ----- List activities for a lead (used by deal detail history panel) ----- */
export const listActivitiesForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await getLeadOrg(context.supabase, data.lead_id);
    const { data: rows, error } = await context.supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });
