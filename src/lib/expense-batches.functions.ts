import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enqueueNotification } from "@/lib/notifications.functions";

/**
 * Grouping of expense claims into a single "trip" or "project" submission
 * so a manager can approve/reject the whole batch at once instead of every
 * line item individually.
 */

const orgSchema = z.object({ org_id: z.string().uuid() });

export const listMyBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof orgSchema>) => orgSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("expense_batches")
      .select(
        "id, batch_number, title, batch_type, description, status, start_date, end_date, total_amount, currency, submitted_at, reviewed_at, rejection_reason, created_at",
      )
      .eq("org_id", data.org_id)
      .eq("submitted_by", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return rows ?? [];
  });

const createSchema = z.object({
  org_id: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  batch_type: z.enum(["trip", "project"]).default("trip"),
  description: z.string().trim().max(2000).optional().nullable(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  currency: z.string().trim().length(3).default("SAR"),
});

function randomBatchNumber(kind: "trip" | "project") {
  const prefix = kind === "trip" ? "TRP" : "PRJ";
  const y = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `${prefix}-${y}-${rand}`;
}

export const createExpenseBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof createSchema>) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("expense_batches")
      .insert({
        org_id: data.org_id,
        batch_number: randomBatchNumber(data.batch_type),
        title: data.title,
        batch_type: data.batch_type,
        description: data.description ?? null,
        start_date: data.start_date ?? null,
        end_date: data.end_date ?? null,
        currency: data.currency,
        status: "draft",
        submitted_by: userId,
      })
      .select("id, batch_number, title, batch_type, status, total_amount, currency, created_at")
      .single();
    if (error) throw error;
    return row;
  });

const idSchema = z.object({ batch_id: z.string().uuid() });

export const getBatchDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [batchRes, claimsRes] = await Promise.all([
      supabase
        .from("expense_batches")
        .select(
          "id, org_id, batch_number, title, batch_type, description, status, start_date, end_date, total_amount, currency, submitted_at, reviewed_at, rejection_reason, submitted_by, created_at",
        )
        .eq("id", data.batch_id)
        .maybeSingle(),
      supabase
        .from("expense_claims")
        .select(
          "id, claim_number, title, amount, currency, category, status, receipt_url, description, created_at",
        )
        .eq("batch_id", data.batch_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);
    if (batchRes.error) throw batchRes.error;
    if (claimsRes.error) throw claimsRes.error;
    if (!batchRes.data) throw new Error("batch_not_found");
    return { batch: batchRes.data, claims: claimsRes.data ?? [] };
  });

export const submitBatchForApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Ensure batch belongs to caller, is in draft/rejected, has ≥1 claim
    const { data: batch, error: bErr } = await supabase
      .from("expense_batches")
      .select("id, org_id, title, batch_number, total_amount, currency, status, submitted_by")
      .eq("id", data.batch_id)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!batch) throw new Error("batch_not_found");
    if (batch.submitted_by !== userId) throw new Error("not_owner");
    if (batch.status !== "draft" && batch.status !== "rejected") {
      throw new Error("batch_not_editable");
    }
    const { count, error: cErr } = await supabase
      .from("expense_claims")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", data.batch_id)
      .is("deleted_at", null);
    if (cErr) throw cErr;
    if (!count || count === 0) throw new Error("batch_empty");

    const now = new Date().toISOString();
    const { data: updated, error: uErr } = await supabase
      .from("expense_batches")
      .update({ status: "submitted", submitted_at: now, rejection_reason: null })
      .eq("id", data.batch_id)
      .select("id, status, submitted_at")
      .single();
    if (uErr) throw uErr;

    // Also move linked draft claims to submitted so approvers see them.
    await supabase
      .from("expense_claims")
      .update({ status: "submitted", submitted_at: now })
      .eq("batch_id", data.batch_id)
      .eq("status", "draft");

    // Confirm the submission to the owner.
    try {
      await enqueueNotification({
        data: {
          org_id: batch.org_id,
          channel: "email",
          template: "expense_batch_submitted",
          event_key: "expense_batch_submitted",
          recipient_user_id: userId,
          idempotency_key: `expense_batch_submitted:${batch.id}`,
          variables: {
            batch_number: batch.batch_number ?? "",
            batch_title: batch.title ?? "",
            amount: batch.total_amount ?? 0,
            currency: batch.currency ?? "SAR",
            claim_count: count,
            status: "submitted",
            reference_type: "expense_batch",
            reference_id: batch.id,
          },
          dispatch_now: false,
        },
      });
    } catch {
      /* notification failures must not block submission */
    }

    return updated;
  });

export const deleteBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("expense_batches")
      .delete()
      .eq("id", data.batch_id)
      .eq("submitted_by", userId)
      .eq("status", "draft");
    if (error) throw error;
    return { ok: true };
  });

const decisionSchema = z.object({
  batch_id: z.string().uuid(),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export const approveBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isSuper } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (!isAdmin && !isSuper) throw new Error("forbidden");
    const now = new Date().toISOString();
    const { data: batch } = await supabase
      .from("expense_batches")
      .select("id, org_id, title, batch_number, total_amount, currency, submitted_by")
      .eq("id", data.batch_id)
      .maybeSingle();
    const { error } = await supabase
      .from("expense_batches")
      .update({ status: "approved", reviewed_at: now, reviewed_by: userId })
      .eq("id", data.batch_id)
      .eq("status", "submitted");
    if (error) throw error;
    await supabase
      .from("expense_claims")
      .update({ status: "approved", reviewed_at: now, reviewed_by: userId, approved_at: now })
      .eq("batch_id", data.batch_id)
      .in("status", ["submitted", "in_review"]);

    // Notify the submitter that their batch was approved.
    if (batch?.submitted_by && batch.org_id) {
      const { data: submitter } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", batch.submitted_by)
        .maybeSingle();
      try {
        await enqueueNotification({
          data: {
            org_id: batch.org_id,
            channel: "email",
            template: "expense_batch_approved",
            event_key: "expense_batch_approved",
            recipient_user_id: batch.submitted_by,
            idempotency_key: `expense_batch_approved:${batch.id}`,
            variables: {
              batch_title: batch.title ?? "",
              batch_number: batch.batch_number ?? "",
              amount: batch.total_amount ?? 0,
              currency: batch.currency ?? "SAR",
              reference_type: "expense_batch",
              reference_id: batch.id,
              submitter_name: submitter?.full_name ?? "",
            },
            dispatch_now: false,
          },
        });
      } catch {
        // Notification failure must not block the approval itself.
      }
    }
    return { ok: true };
  });

export const rejectBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof decisionSchema>) => decisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const { data: isSuper } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (!isAdmin && !isSuper) throw new Error("forbidden");
    const now = new Date().toISOString();
    // Fetch batch (org, submitter, title) before mutating so we can notify.
    const { data: batch } = await supabase
      .from("expense_batches")
      .select("id, org_id, title, batch_number, submitted_by")
      .eq("id", data.batch_id)
      .maybeSingle();
    const { error } = await supabase
      .from("expense_batches")
      .update({
        status: "rejected",
        reviewed_at: now,
        reviewed_by: userId,
        rejection_reason: data.reason ?? null,
      })
      .eq("id", data.batch_id)
      .eq("status", "submitted");
    if (error) throw error;
    await supabase
      .from("expense_claims")
      .update({
        status: "rejected",
        reviewed_at: now,
        reviewed_by: userId,
        rejection_reason: data.reason ?? null,
      })
      .eq("batch_id", data.batch_id)
      .in("status", ["submitted", "in_review"]);

    // Notify the submitter that their batch was rejected.
    if (batch?.submitted_by && batch.org_id) {
      const { data: submitter } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", batch.submitted_by)
        .maybeSingle();
      try {
        await enqueueNotification({
          data: {
            org_id: batch.org_id,
            channel: "email",
            template: "expense_batch_rejected",
            event_key: "expense_batch_rejected",
            recipient_user_id: batch.submitted_by,
            idempotency_key: `expense_batch_rejected:${batch.id}`,
            variables: {
              batch_title: batch.title ?? "",
              batch_number: batch.batch_number ?? "",
              rejection_reason: data.reason ?? "",
              rejection_type: "expense_batch",
              submitter_name: submitter?.full_name ?? "",
            },
            dispatch_now: false,
          },
        });
      } catch {
        // Notification failure must not block the rejection itself.
      }
    }
    return { ok: true };
  });

const removeSchema = z.object({ claim_id: z.string().uuid() });

export const detachClaimFromBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof removeSchema>) => removeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("expense_claims")
      .update({ batch_id: null })
      .eq("id", data.claim_id);
    if (error) throw error;
    return { ok: true };
  });
