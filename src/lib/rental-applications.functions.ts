/**
 * Server functions for the rental-applications admin pipeline.
 *
 * Public submission is handled by `submitApplication` in
 * `src/lib/appfolio.functions.ts` (uses the anon-callable
 * `submit_rental_application` RPC). This file covers the org-side
 * list/detail/status-update/approve flow.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_STATUS = z.enum(["new", "reviewing", "approved", "rejected"]);

export const listRentalApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string; status?: string; search?: string; listingId?: string }) =>
    z
      .object({
        orgId: z.string().uuid(),
        status: APP_STATUS.optional(),
        search: z.string().trim().max(120).optional(),
        listingId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("rental_applications")
      .select(
        "id, listing_id, applicant_name, email, phone, monthly_income, employment_type, status, score, created_at, reviewed_at, converted_contract_id, converted_tenant_id",
      )
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.listingId) q = q.eq("listing_id", data.listingId);
    if (data.search && data.search.length > 0) {
      const s = data.search.replace(/[,%]/g, "");
      q = q.or(`applicant_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const listOrgListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) =>
    z.object({ orgId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("listings")
      .select("id, title, slug, published")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return rows ?? [];
  });

export const getRentalApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("rental_applications")
      .select(
        "id, org_id, listing_id, applicant_name, email, phone, monthly_income, employer, move_in_date, credit_check_consent, national_id, id_type, employment_type, dependents, current_rent, documents, status, score, score_reason, notes, reviewed_by, reviewed_at, converted_tenant_id, converted_contract_id, created_at, updated_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const updateApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["reviewing", "rejected"]), // "approved" flows through approveApplication
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Load previous state so notifications know the old status.
    const { data: prev } = await context.supabase
      .from("rental_applications")
      .select(
        "org_id, listing_id, applicant_name, email, status, listings(title, slug)",
      )
      .eq("id", data.id)
      .maybeSingle();
    const patch: {
      status: "reviewing" | "rejected";
      reviewed_by: string;
      reviewed_at: string;
      updated_at: string;
      notes?: string;
    } = {
      status: data.status,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (data.notes !== undefined) patch.notes = data.notes;
    const { data: row, error } = await context.supabase
      .from("rental_applications")
      .update(patch)
      .eq("id", data.id)
      .select("id, status, reviewed_at")
      .single();
    if (error) throw error;

    // Fan out notifications (fire-and-forget — never fail the mutation).
    if (prev) {
      const { notifyApplicationUpdate } = await import(
        "@/lib/application-notify.server"
      );
      const listing = (prev as unknown as {
        listings: { title: string | null; slug: string | null } | null;
      }).listings;
      const actorName = await lookupProfileName(context.supabase, context.userId);
      await notifyApplicationUpdate({
        applicationId: data.id,
        orgId: prev.org_id,
        event: data.status === "rejected" ? "rejected" : "status_changed",
        applicantName: prev.applicant_name,
        applicantEmail: prev.email ?? null,
        listingId: prev.listing_id,
        listingTitle: listing?.title ?? null,
        listingSlug: listing?.slug ?? null,
        newStatus: data.status,
        oldStatus: prev.status,
        note: data.notes ?? null,
        actorId: context.userId,
        actorName,
      });
    }
    return row;
  });

export const approveApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        unitId: z.string().uuid(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
        monthlyRent: z.number().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("approve_rental_application", {
      _app_id: data.id,
      _unit_id: data.unitId,
      _start_date: data.startDate,
      _end_date: data.endDate,
      _monthly_rent: data.monthlyRent,
    });
    if (error) throw error;

    // Notify applicant + org reviewers of approval.
    const { data: prev } = await context.supabase
      .from("rental_applications")
      .select("org_id, listing_id, applicant_name, email, listings(title, slug)")
      .eq("id", data.id)
      .maybeSingle();
    if (prev) {
      const { notifyApplicationUpdate } = await import(
        "@/lib/application-notify.server"
      );
      const listing = (prev as unknown as {
        listings: { title: string | null; slug: string | null } | null;
      }).listings;
      const actorName = await lookupProfileName(context.supabase, context.userId);
      await notifyApplicationUpdate({
        applicationId: data.id,
        orgId: prev.org_id,
        event: "approved",
        applicantName: prev.applicant_name,
        applicantEmail: prev.email ?? null,
        listingId: prev.listing_id,
        listingTitle: listing?.title ?? null,
        listingSlug: listing?.slug ?? null,
        newStatus: "approved",
        oldStatus: "reviewing",
        actorId: context.userId,
        actorName,
      });
    }
    return result as { tenant_id: string; contract_id: string };
  });

/**
 * Append a note to a rental application without changing its status.
 * Notifies the applicant + org reviewers about the new note.
 */
export const addApplicationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        note: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: prev, error: readErr } = await context.supabase
      .from("rental_applications")
      .select(
        "org_id, listing_id, applicant_name, email, status, notes, listings(title, slug)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!prev) throw new Error("Application not found");

    const actorName = await lookupProfileName(context.supabase, context.userId);
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const header = actorName ? `[${stamp} — ${actorName}]` : `[${stamp}]`;
    const merged = prev.notes
      ? `${prev.notes}\n\n${header}\n${data.note}`
      : `${header}\n${data.note}`;

    const { error } = await context.supabase
      .from("rental_applications")
      .update({ notes: merged, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;

    const { notifyApplicationUpdate } = await import(
      "@/lib/application-notify.server"
    );
    const listing = (prev as unknown as {
      listings: { title: string | null; slug: string | null } | null;
    }).listings;
    await notifyApplicationUpdate({
      applicationId: data.id,
      orgId: prev.org_id,
      event: "note_added",
      applicantName: prev.applicant_name,
      applicantEmail: prev.email ?? null,
      listingId: prev.listing_id,
      listingTitle: listing?.title ?? null,
      listingSlug: listing?.slug ?? null,
      newStatus: prev.status,
      note: data.note,
      actorId: context.userId,
      actorName,
    });

    return { ok: true as const };
  });

async function lookupProfileName(
  supabase: unknown,
  userId: string,
): Promise<string | null> {
  try {
    const client = supabase as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            a: string,
            b: string,
          ) => {
            maybeSingle: () => Promise<{
              data: { full_name: string | null } | null;
            }>;
          };
        };
      };
    };
    const { data } = await client
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    return data?.full_name ?? null;
  } catch {
    return null;
  }
}

export const listVacantUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orgId: string }) =>
    z.object({ orgId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("units")
      .select("id, code, status, rent_amount, building_id")
      .eq("org_id", data.orgId)
      .eq("status", "vacant")
      .is("deleted_at", null)
      .order("code", { ascending: true })
      .limit(500);
    if (error) throw error;
    return rows ?? [];
  });

export const listApplicationAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("audit_log")
      .select("id, action, diff, actor, created_at")
      .eq("entity", "rental_applications")
      .eq("entity_id", data.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const actors = Array.from(
      new Set((rows ?? []).map((r) => r.actor).filter((a): a is string => !!a)),
    );
    let names = new Map<string, string>();
    if (actors.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actors);
      names = new Map((profs ?? []).map((p) => [p.id, p.full_name ?? ""]));
    }
    return (rows ?? []).map((r) => ({
      ...r,
      actor_name: r.actor ? names.get(r.actor) || null : null,
    }));
  });

export const signApplicationDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { paths: string[] }) =>
    z.object({ paths: z.array(z.string().min(1).max(500)).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.paths.length === 0) return [] as { path: string; url: string | null }[];
    const { data: signed, error } = await context.supabase.storage
      .from("application-documents")
      .createSignedUrls(data.paths, 60 * 10);
    if (error) throw error;
    return (signed ?? []).map((s) => ({ path: s.path ?? "", url: s.signedUrl ?? null }));
  });