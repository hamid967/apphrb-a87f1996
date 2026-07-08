import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type PortalInvitation = Pick<
  Tables["portal_invitations"]["Row"],
  | "id"
  | "kind"
  | "tenant_id"
  | "owner_id"
  | "email"
  | "token"
  | "expires_at"
  | "accepted_at"
  | "created_at"
>;

export type InvitationTarget = Pick<Tables["tenants"]["Row"], "id" | "full_name" | "email">;

export type RevokeKind = "cancel" | "delete";

export type OnAskRevoke = (inv: PortalInvitation, kind: RevokeKind) => void;
