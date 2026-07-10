import { createServerFn } from "@tanstack/react-start";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";
import { z } from "zod";

const SubmitSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().max(255),
  company_name: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  activity_type: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().max(40).default("hamid_voice"),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected"]),
  review_notes: z.string().trim().max(1000).nullable().optional(),
});

export const submitSignupRequest = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SubmitSchema.parse(raw))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: row, error } = await supabase
      .from("signup_requests")
      .insert({
        full_name: data.full_name,
        phone: data.phone,
        email: data.email,
        company_name: data.company_name ?? null,
        city: data.city ?? null,
        activity_type: data.activity_type ?? null,
        notes: data.notes ?? null,
        source: data.source,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, created_at: row.created_at as string };
  });

export const listSignupRequests = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("signup_requests")
      .select(
        "id, full_name, phone, email, company_name, city, activity_type, notes, status, source, reviewed_by, reviewed_at, review_notes, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateSignupRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((raw: unknown) => UpdateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("signup_requests")
      .update({
        status: data.status,
        review_notes: data.review_notes ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
