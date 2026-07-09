import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Tenant/portal-facing support ticket API. The user creates a ticket, lists
 * their own tickets, and reads ticket details. Admin management lives in
 * `admin-platform.functions.ts` (`listAllTickets`, `updateTicketStatus`).
 *
 * The write path uses the admin client because portal users are not always
 * org members with insert privileges under the `is_org_member` policy — we
 * explicitly bind `requester_id` to the verified `auth.uid()` and derive
 * `org_id` from the caller's first org membership (or accept a passed org).
 */

const createInput = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  category: z.string().max(60).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  org_id: z.string().uuid().optional(),
});

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let orgId = data.org_id ?? null;
    if (!orgId) {
      const { data: mem } = await context.supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", context.userId)
        .limit(1)
        .maybeSingle();
      orgId = mem?.org_id ?? null;
    }
    if (!orgId) throw new Error("لا توجد شركة مرتبطة بالحساب لإنشاء التذكرة.");

    const { data: row, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        org_id: orgId,
        subject: data.subject,
        description: data.description ?? null,
        category: data.category ?? null,
        priority: data.priority,
        requester_id: context.userId,
        status: "open",
      })
      .select("id, ticket_number, subject, status, priority, category, created_at")
      .single();
    if (error) throw error;
    return row;
  });

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, subject, description, status, priority, category, created_at, updated_at")
      .eq("requester_id", context.userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });
