import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "documents";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function assertMember(supabase: any, userId: string, orgId: string) {
  const { data, error } = await supabase.rpc("is_org_member", {
    _org: orgId,
    _user: userId,
  });
  if (error) throw error;
  if (!data) throw new Error("Forbidden");
}

/** Signed upload URL under {org_id}/... to satisfy documents-bucket RLS. */
export const createArchiveUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { org_id: string; filename: string }) =>
    z
      .object({
        org_id: z.string().uuid(),
        filename: z.string().trim().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.org_id);
    const safe = data.filename.replace(/[^\w.\-]/g, "_").slice(-120);
    const path = `${data.org_id}/${Date.now()}-${safe}`;
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

/** Smart search: matches title, notes, tags, plus linked property/contact names. */
export const searchArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    org_id: string;
    q?: string | null;
    category?: string | null;
    property_id?: string | null;
    contact_id?: string | null;
    status?: "active" | "archived" | null;
  }) =>
    z
      .object({
        org_id: z.string().uuid(),
        q: z.string().max(200).optional().nullable(),
        category: z
          .enum(["contract", "invoice", "id", "report", "other"])
          .optional()
          .nullable(),
        property_id: z.string().uuid().optional().nullable(),
        contact_id: z.string().uuid().optional().nullable(),
        status: z.enum(["active", "archived"]).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.org_id);

    let query = context.supabase
      .from("documents")
      .select(
        "id, title, category, status, tags, notes, property_id, contact_id, current_version_id, created_at, updated_at, signature_status, property:properties(id, title_ar, title_en, city), contact:contacts(id, full_name, phone), current_version:document_versions!documents_current_version_fk(id, file_path, file_size, mime_type, created_at)",
      )
      .eq("org_id", data.org_id)
      .order("updated_at", { ascending: false })
      .limit(300);

    if (data.status) query = query.eq("status", data.status);
    if (data.category) query = query.eq("category", data.category);
    if (data.property_id) query = query.eq("property_id", data.property_id);
    if (data.contact_id) query = query.eq("contact_id", data.contact_id);

    const term = (data.q ?? "").trim();
    if (term.length >= 2) {
      // ILIKE across title / notes; also tag exact match
      const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
      query = query.or(
        `title.ilike.${like},notes.ilike.${like},tags.cs.{${term}}`,
      );
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    return rows ?? [];
  });

/** AI-suggested auto-link: proposes property_id / contact_id from filename+title. */
export const suggestArchiveLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    org_id: string;
    title: string;
    filename?: string | null;
    notes?: string | null;
  }) =>
    z
      .object({
        org_id: z.string().uuid(),
        title: z.string().min(1).max(300),
        filename: z.string().max(300).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.org_id);

    const [{ data: props }, { data: cts }] = await Promise.all([
      context.supabase
        .from("properties")
        .select("id, title_ar, title_en, city, address")
        .eq("org_id", data.org_id)
        .limit(120),
      context.supabase
        .from("contacts")
        .select("id, full_name, phone, email")
        .eq("org_id", data.org_id)
        .limit(200),
    ]);

    const key = process.env.LOVABLE_API_KEY;
    const haystack = `${data.title} ${data.filename ?? ""} ${data.notes ?? ""}`.toLowerCase();

    // Fast local fallback: substring match on names/phones
    const localProp =
      (props ?? []).find((p: any) => {
        const t = `${p.title_ar ?? ""} ${p.title_en ?? ""} ${p.address ?? ""}`.toLowerCase();
        return t && haystack.includes(t.slice(0, 20));
      }) ?? null;
    const localContact =
      (cts ?? []).find((c: any) => {
        const n = (c.full_name ?? "").toLowerCase();
        const ph = (c.phone ?? "").replace(/\D/g, "");
        return (
          (n && n.length > 3 && haystack.includes(n)) ||
          (ph && ph.length > 6 && haystack.replace(/\D/g, "").includes(ph))
        );
      }) ?? null;

    if (!key || (!props?.length && !cts?.length)) {
      return {
        property_id: localProp?.id ?? null,
        contact_id: localContact?.id ?? null,
        suggested_category: null as string | null,
        rationale: localProp || localContact ? "Local match" : "No match",
      };
    }

    const body = {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You classify real-estate documents. Return ONLY strict JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            document: {
              title: data.title,
              filename: data.filename ?? "",
              notes: data.notes ?? "",
            },
            properties: (props ?? []).map((p: any) => ({
              id: p.id,
              name: p.title_ar || p.title_en,
              city: p.city,
              address: p.address,
            })),
            contacts: (cts ?? []).map((c: any) => ({
              id: c.id,
              name: c.full_name,
              phone: c.phone,
            })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "archive_link",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              property_id: { type: ["string", "null"] },
              contact_id: { type: ["string", "null"] },
              suggested_category: {
                type: ["string", "null"],
                enum: ["contract", "invoice", "id", "report", "other", null],
              },
              rationale: { type: "string" },
            },
            required: [
              "property_id",
              "contact_id",
              "suggested_category",
              "rationale",
            ],
          },
        },
      },
    };

    try {
      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const json = (await res.json()) as any;
      const content: string = json?.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);

      const validPropId = (props ?? []).some(
        (p: any) => p.id === parsed.property_id,
      )
        ? parsed.property_id
        : null;
      const validCtId = (cts ?? []).some(
        (c: any) => c.id === parsed.contact_id,
      )
        ? parsed.contact_id
        : null;

      return {
        property_id: validPropId ?? localProp?.id ?? null,
        contact_id: validCtId ?? localContact?.id ?? null,
        suggested_category: parsed.suggested_category ?? null,
        rationale: parsed.rationale ?? "",
      };
    } catch {
      return {
        property_id: localProp?.id ?? null,
        contact_id: localContact?.id ?? null,
        suggested_category: null,
        rationale: "Fallback local match",
      };
    }
  });