import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DecisionKind = "subscription" | "receipt" | "user" | "invitation";
export type DecisionAction = "approve" | "reject" | "revoke";

const ENTITY: Record<DecisionKind, string> = {
  subscription: "subscriptions",
  receipt: "subscription_payments",
  user: "profiles",
  invitation: "portal_invitations",
};

export interface LogDecisionInput {
  kind: DecisionKind;
  action: DecisionAction;
  entity_id: string;
  actor: string;
  org_id?: string | null;
  target_user_id?: string | null;
  target_email?: string | null;
  reason?: string | null;
  note?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Unified audit_log writer for the admin Decision Center.
 * Never throws — decision writes must not fail if audit logging is unavailable.
 *
 * action format: `decision_center.<kind>.<action>` (e.g. `decision_center.subscription.approve`)
 * diff.source = "decision_center" so the row can be filtered from mixed audit trails.
 */
export async function logDecisionAction(input: LogDecisionInput): Promise<void> {
  try {
    await supabaseAdmin.from("audit_log").insert({
      entity: ENTITY[input.kind],
      entity_id: input.entity_id,
      actor: input.actor,
      action: `decision_center.${input.kind}.${input.action}`,
      diff: {
        source: "decision_center",
        kind: input.kind,
        decision: input.action,
        org_id: input.org_id ?? null,
        target_user_id: input.target_user_id ?? null,
        target_email: input.target_email ?? null,
        reason: input.reason ?? null,
        note: input.note ?? null,
        decided_at: new Date().toISOString(),
        actor: input.actor,
        ...(input.extra ?? {}),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[decision-audit] failed to log", e);
  }
}