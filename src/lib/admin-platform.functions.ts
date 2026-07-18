import { createServerFn } from "@tanstack/react-start";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";
import { z } from "zod";

// ============================== PACKAGES ==============================
export const listPackages = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("packages")
      .select("*")
      .order("price_monthly", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

const packageSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price_monthly: z.number().nonnegative(),
  price_yearly: z.number().nonnegative(),
  max_users: z.number().int().nullable().optional(),
  max_properties: z.number().int().nullable().optional(),
  max_units: z.number().int().nullable().optional(),
  active: z.boolean().default(true),
});

export const upsertPackage = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) => packageSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    if (id) {
      const { error } = await supabaseAdmin.from("packages").update(rest).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("packages").insert(rest);
      if (error) throw error;
    }
    return { ok: true };
  });

export const togglePackageActive = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("packages")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============================== BACKUPS ==============================
export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("backups")
      .select("id, org_id, file_path, size_bytes, status, notes, created_at, organizations(name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((b: any) => ({ ...b, org_name: b.organizations?.name ?? null }));
  });

export const createBackupEntry = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        org_id: z.string().uuid(),
        file_path: z.string().min(1),
        size_bytes: z.number().int().nonnegative().optional(),
        status: z.string().default("completed"),
        notes: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("backups")
      .insert({ ...data, created_by: context.userId });
    if (error) throw error;
    return { ok: true };
  });

// ============================== EMAIL / SMS PROVIDERS ==============================
const providerSchema = z.object({
  id: z.string().uuid().optional(),
  org_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  provider: z.string().min(1),
  config: z.record(z.any()).default({}),
  active: z.boolean().default(true),
});

function makeProviderFns(table: "email_providers" | "sms_providers") {
  const list = createServerFn({ method: "GET" })
    .middleware([requireAAL2SuperAdmin])
    .handler(async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("*, organizations(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, org_name: r.organizations?.name ?? null }));
    });

  const upsert = createServerFn({ method: "POST" })
    .middleware([requireAAL2SuperAdmin])
    .inputValidator((input: unknown) => providerSchema.parse(input))
    .handler(async ({ data }) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { id, ...rest } = data;
      if (id) {
        const { error } = await supabaseAdmin.from(table).update(rest as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin.from(table).insert(rest as any);
        if (error) throw error;
      }
      return { ok: true };
    });

  const toggle = createServerFn({ method: "POST" })
    .middleware([requireAAL2SuperAdmin])
    .inputValidator((input: unknown) =>
      z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
    )
    .handler(async ({ data }) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from(table)
        .update({ active: data.active })
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true };
    });

  return { list, upsert, toggle };
}

const emailFns = makeProviderFns("email_providers");
export const listEmailProviders = emailFns.list;
export const upsertEmailProvider = emailFns.upsert;
export const toggleEmailProvider = emailFns.toggle;

const smsFns = makeProviderFns("sms_providers");
export const listSmsProviders = smsFns.list;
export const upsertSmsProvider = smsFns.upsert;
export const toggleSmsProvider = smsFns.toggle;

// ============================== BANKS ==============================
export const listBanks = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("banks")
      .select("id, name, swift, country_id, created_at, countries(name, name_ar)")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((b: any) => ({
      ...b,
      country_name_ar: b.countries?.name_ar ?? null,
      country_name_en: b.countries?.name ?? null,
    }));
  });

export const upsertBank = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        swift: z.string().optional().nullable(),
        country_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    if (id) {
      const { error } = await supabaseAdmin.from("banks").update(rest).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("banks").insert(rest);
      if (error) throw error;
    }
    return { ok: true };
  });

export const deleteBank = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("banks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============================== DEMO REQUESTS ==============================
export const listDemoRequests = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("demo_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  });

// ============================== SUPPORT TICKETS ==============================
export const listAllTickets = createServerFn({ method: "GET" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select(
        "id, ticket_number, subject, status, priority, category, org_id, created_at, organizations(name)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []).map((t: any) => ({ ...t, org_name: t.organizations?.name ?? null }));
  });

export const updateTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tickets")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
