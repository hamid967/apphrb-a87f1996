import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RequestBadgeCounts = {
  /** Expense claims + batches submitted by the caller and awaiting approval. */
  myPendingRequests: number;
  /** Rental applications in the org that are pending approval/review. */
  approvalRequests: number;
};

const inputSchema = z.object({ org_id: z.string().uuid() });

export const getRequestBadgeCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { org_id: string }) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<RequestBadgeCounts> => {
    const { supabase, userId } = context;
    const orgId = data.org_id;

    const [myClaims, myBatches, approvalApps] = await Promise.all([
      supabase
        .from("expense_claims")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("submitted_by", userId)
        .is("deleted_at", null)
        .in("status", ["submitted", "in_review"]),
      supabase
        .from("expense_batches")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("submitted_by", userId)
        .is("deleted_at", null)
        .in("status", ["submitted", "in_review"]),
      supabase
        .from("rental_applications")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .in("status", ["new", "reviewing"]),
    ]);

    if (myClaims.error) throw myClaims.error;
    if (myBatches.error) throw myBatches.error;
    if (approvalApps.error) throw approvalApps.error;

    return {
      myPendingRequests: (myClaims.count ?? 0) + (myBatches.count ?? 0),
      approvalRequests: approvalApps.count ?? 0,
    };
  });
