import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============= TENANT =============

export const tenantMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, full_name, tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.tenant_id) return { linked: false, tenant: null, contracts: [] };
    const { data: tenant } = await context.supabase
      .from("tenants")
      .select("id, full_name, email, org_id")
      .eq("id", profile.tenant_id)
      .is("deleted_at", null)
      .maybeSingle();
    const { data: contracts } = await context.supabase
      .from("contracts")
      .select("id, contract_number, unit_id, status, amount, currency_code, start_date, end_date")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "active")
      .is("deleted_at", null);
    return { linked: true, tenant, contracts: contracts ?? [] };
  });

export const tenantListCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("rent_charges")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("due_date", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const tenantListMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("payment_methods_saved")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .order("is_default", { ascending: false });
    return rows ?? [];
  });

export const tenantAddMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orgId: string;
      tenantId: string;
      brand: string;
      last4: string;
      makeDefault?: boolean;
    }) =>
      z
        .object({
          orgId: z.string().uuid(),
          tenantId: z.string().uuid(),
          brand: z.string().min(2).max(40),
          last4: z.string().regex(/^\d{4}$/),
          makeDefault: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.makeDefault) {
      await context.supabase
        .from("payment_methods_saved")
        .update({ is_default: false })
        .eq("tenant_id", data.tenantId);
    }
    const { data: row, error } = await context.supabase
      .from("payment_methods_saved")
      .insert({
        org_id: data.orgId,
        tenant_id: data.tenantId,
        provider: "stub",
        brand: data.brand,
        last4: data.last4,
        is_default: !!data.makeDefault,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const tenantPayCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { chargeId: string; methodId: string }) =>
    z.object({ chargeId: z.string().uuid(), methodId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: txnId, error } = await context.supabase.rpc("tenant_pay_charge", {
      _charge_id: data.chargeId,
      _method_id: data.methodId,
    });
    if (error) throw error;
    return { txnId };
  });

export const tenantSetAutopay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orgId: string;
      tenantId: string;
      contractId: string;
      methodId: string;
      day: number;
      active: boolean;
    }) =>
      z
        .object({
          orgId: z.string().uuid(),
          tenantId: z.string().uuid(),
          contractId: z.string().uuid(),
          methodId: z.string().uuid(),
          day: z.number().int().min(1).max(28),
          active: z.boolean(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("autopay_schedules")
      .upsert(
        {
          org_id: data.orgId,
          tenant_id: data.tenantId,
          contract_id: data.contractId,
          method_id: data.methodId,
          day_of_month: data.day,
          active: data.active,
        },
        { onConflict: "contract_id" },
      )
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const tenantGetAutopay = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("autopay_schedules")
      .select("*")
      .eq("tenant_id", data.tenantId);
    return rows ?? [];
  });

export const adminGenerateCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; months?: number }) =>
    z
      .object({ orgId: z.string().uuid(), months: z.number().int().min(1).max(12).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: contracts } = await context.supabase
      .from("contracts")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("status", "active")
      .is("deleted_at", null);
    let total = 0;
    for (const c of contracts ?? []) {
      const { data: n } = await context.supabase.rpc("generate_rent_charges", {
        _contract_id: c.id,
        _months: data.months ?? 3,
      });
      total += Number(n ?? 0);
    }
    return { generated: total };
  });

// ============= MAINTENANCE =============

export const tenantListTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("maintenance_tickets")
      .select(
        "id, ticket_no, title, description, status, priority, created_at, completed_at, tenant_visible_notes",
      )
      .eq("submitted_by_tenant_id", data.tenantId)
      .order("created_at", { ascending: false });
    return rows ?? [];
  });

export const tenantCreateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orgId: string;
      tenantId: string;
      title: string;
      description: string;
      priority?: string;
      photos?: string[];
    }) =>
      z
        .object({
          orgId: z.string().uuid(),
          tenantId: z.string().uuid(),
          title: z.string().trim().min(3).max(200),
          description: z.string().trim().min(5).max(2000),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
          photos: z.array(z.string()).max(10).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("maintenance_tickets")
      .insert({
        org_id: data.orgId,
        title: data.title,
        description: data.description,
        priority: (data.priority ?? "medium") as any,
        status: "open" as any,
        source: "tenant",
        submitted_by_tenant_id: data.tenantId,
        photos: data.photos ?? [],
        ticket_no: "T-" + Date.now().toString().slice(-8),
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const listTicketComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ticketId: string }) =>
    z.object({ ticketId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("maintenance_comments")
      .select("*")
      .eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: true });
    return rows ?? [];
  });

export const addTicketComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; ticketId: string; body: string; authorType: string }) =>
    z
      .object({
        orgId: z.string().uuid(),
        ticketId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
        authorType: z.enum(["tenant", "staff", "tech"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("maintenance_comments")
      .insert({
        org_id: data.orgId,
        ticket_id: data.ticketId,
        author_id: context.userId,
        author_type: data.authorType,
        body: data.body,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

// ============= OWNER =============

export const ownerMyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, owner_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.owner_id) return { linked: false, owner: null };
    const { data: owner } = await context.supabase
      .from("owners")
      .select("id, full_name, email, phone, org_id")
      .eq("id", profile.owner_id)
      .is("deleted_at", null)
      .maybeSingle();
    return { linked: true, owner };
  });

export const listOwnerStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ownerId: string }) =>
    z.object({ ownerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("owner_statements")
      .select("*")
      .eq("owner_id", data.ownerId)
      .order("period_start", { ascending: false });
    return rows ?? [];
  });

export const getOwnerStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: stmt } = await context.supabase
      .from("owner_statements")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const { data: lines } = await context.supabase
      .from("owner_statement_lines")
      .select("*")
      .eq("statement_id", data.id)
      .order("kind", { ascending: true });
    return { statement: stmt, lines: lines ?? [] };
  });

export const adminGenerateStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ownerId: string; month: string; mgmtPct?: number }) =>
    z
      .object({
        ownerId: z.string().uuid(),
        month: z.string(),
        mgmtPct: z.number().min(0).max(0.5).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("generate_owner_statement", {
      _owner_id: data.ownerId,
      _month: data.month,
      _mgmt_pct: data.mgmtPct ?? 0.08,
    });
    if (error) throw error;
    return { id };
  });

// ============= LISTINGS + APPLICATIONS =============

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const listPublishedListings = createServerFn({ method: "GET" })
  .inputValidator((input: { city?: string; minPrice?: number; maxPrice?: number }) =>
    z
      .object({
        city: z.string().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    let q = supabase
      .from("listings")
      .select(
        "id, slug, title, description, price, currency, bedrooms, bathrooms, area, city, hero_image",
      )
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.city) q = q.eq("city", data.city);
    if (data.minPrice) q = q.gte("price", data.minPrice);
    if (data.maxPrice) q = q.lte("price", data.maxPrice);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getListingBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) =>
    z.object({ slug: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    const { data: row } = await supabase
      .from("listings")
      .select(
        "id, org_id, slug, title, description, price, currency, bedrooms, bathrooms, area, city, hero_image, gallery, seo_title, seo_description",
      )
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    return row;
  });

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        listingId: z.string().uuid(),
        orgId: z.string().uuid(),
        applicantName: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(255),
        phone: z.string().trim().max(40).optional(),
        monthlyIncome: z.number().nonnegative().optional(),
        employer: z.string().trim().max(200).optional(),
        moveInDate: z.string().optional(),
        creditCheckConsent: z.boolean(),
        nationalId: z.string().trim().max(30).optional(),
        idType: z.enum(["national", "iqama", "passport"]).optional(),
        employmentType: z
          .enum(["private", "government", "self", "student", "unemployed"])
          .optional(),
        dependents: z.number().int().nonnegative().max(20).optional(),
        currentRent: z.number().nonnegative().optional(),
        documents: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(200),
              path: z.string().trim().min(1).max(500),
              size: z.number().int().nonnegative().max(10 * 1024 * 1024).optional(),
              type: z.string().trim().max(120).optional(),
            }),
          )
          .max(10)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    const { data: rpcResult, error } = await supabase.rpc("submit_rental_application", {
      _listing_id: data.listingId,
      _applicant_name: data.applicantName,
      _email: data.email,
      _phone: data.phone ?? null,
      _monthly_income: data.monthlyIncome ?? null,
      _employer: data.employer ?? null,
      _move_in_date: data.moveInDate || null,
      _credit_check_consent: data.creditCheckConsent,
      _national_id: data.nationalId ?? null,
      _id_type: data.idType ?? null,
      _employment_type: data.employmentType ?? null,
      _dependents: data.dependents ?? null,
      _current_rent: data.currentRent ?? null,
    });
    if (error) throw error;
    const appId = (rpcResult as { id?: string } | null)?.id ?? null;
    // Attach uploaded document metadata (uploaded to the private
    // `application-documents` bucket) to the new row. anon can INSERT
    // rows but has no UPDATE policy, so we do this server-side with the
    // admin client. The bucket policy already scoped the uploads to
    // `{orgId}/{listingId}/*`, and we only write metadata for files
    // whose path matches this application.
    if (appId && data.documents && data.documents.length > 0) {
      const prefix = `${data.orgId}/${data.listingId}/`;
      const safeDocs = data.documents
        .filter((d) => d.path.startsWith(prefix))
        .map((d) => ({
          name: d.name,
          path: d.path,
          size: d.size ?? null,
          type: d.type ?? null,
          uploaded_at: new Date().toISOString(),
        }));
      if (safeDocs.length > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("rental_applications")
          .update({ documents: safeDocs })
          .eq("id", appId);
      }
    }
    return { ok: true, id: appId };
  });

export const listOrgListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("listings")
      .select("*")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    return rows ?? [];
  });

export const adminUpsertListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z
      .object({
        id: z.string().uuid().optional(),
        orgId: z.string().uuid(),
        unitId: z.string().uuid().optional(),
        slug: z.string().min(3).max(200),
        title: z.string().min(3).max(200),
        description: z.string().max(4000).optional(),
        price: z.number().nonnegative(),
        currency: z.string().default("SAR"),
        bedrooms: z.number().int().optional(),
        bathrooms: z.number().int().optional(),
        area: z.number().optional(),
        city: z.string().max(80).optional(),
        heroImage: z.string().max(500).optional(),
        published: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const payload: any = {
      org_id: data.orgId,
      unit_id: data.unitId ?? null,
      slug: data.slug,
      title: data.title,
      description: data.description ?? null,
      price: data.price,
      currency: data.currency,
      bedrooms: data.bedrooms ?? null,
      bathrooms: data.bathrooms ?? null,
      area: data.area ?? null,
      city: data.city ?? null,
      hero_image: data.heroImage ?? null,
      published: data.published,
    };
    if (data.id) payload.id = data.id;
    else payload.created_by = context.userId;
    const { data: row, error } = await context.supabase
      .from("listings")
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const adminDeleteListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("listings").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("rental_applications")
      .select("*, listings(title, slug)")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    return rows ?? [];
  });

export const updateApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string; notes?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "reviewing", "approved", "rejected"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("rental_applications")
      .update({ status: data.status, notes: data.notes ?? null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const seedAppfolioDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("seed_appfolio_demo");
    if (error) throw error;
    return data;
  });
