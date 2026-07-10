import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Wave 3 Sprint 1 — ZATCA Fatoora onboarding.
 *
 * Manages per-org CSID (Compliance / Simulation / Production).
 *
 * Sprint 1 scope:
 *   - `getZatcaCsidStatus`: read current CSID rows for the org.
 *   - `saveManualCsid`: persist a CSID obtained externally (ZATCA SDK/Postman).
 *     ZATCA requires ECDSA secp256k1 keys + XAdES-BES signing. WebCrypto in
 *     the Cloudflare Worker runtime does not expose secp256k1, so Sprint 2
 *     will add a pure-JS crypto pipeline (elliptic + node-forge for CSR) to
 *     issue the CSR and call Fatoora `/compliance` in-app. Until then,
 *     admins onboard once with the ZATCA CLI/SDK and paste the returned
 *     `binarySecurityToken` + `secret` here.
 *   - `revokeCsid`: soft-revoke a CSID (sets revoked_at); doesn't purge secret
 *     history for audit reasons.
 */

const GetSchema = z.object({ orgId: z.string().uuid() });
const SaveSchema = z.object({
  orgId: z.string().uuid(),
  environment: z.enum(["sandbox", "simulation", "production"]),
  csidBinaryToken: z.string().min(20),
  csidSecret: z.string().min(8),
  requestId: z.string().optional(),
  dispositionMessage: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});
const RevokeSchema = z.object({ csidId: z.string().uuid() });

export type ZatcaCsidRow = {
  id: string;
  org_id: string;
  environment: "sandbox" | "simulation" | "production";
  csid_binary_token: string; // masked in the read path
  request_id: string | null;
  disposition_message: string | null;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 12) return "****";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export const getZatcaCsidStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GetSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("zatca_csid")
      .select(
        "id, org_id, environment, csid_binary_token, request_id, disposition_message, issued_at, expires_at, revoked_at",
      )
      .eq("org_id", data.orgId)
      .order("environment", { ascending: true });
    if (error) throw new Error(error.message);

    const now = Date.now();
    return (rows ?? []).map((r) => {
      const expired = r.expires_at ? new Date(r.expires_at).getTime() < now : false;
      const active = !r.revoked_at && !expired;
      return {
        ...r,
        csid_binary_token: maskToken(r.csid_binary_token),
        active,
        expired,
      };
    });
  });

export const saveManualCsid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Enforce admin scoping at the app layer too (RLS will also block).
    const { data: isAdmin, error: roleErr } = await supabase.rpc("is_org_admin", {
      _org: data.orgId,
      _user: userId,
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Only organization admins can manage ZATCA CSID");

    const payload = {
      org_id: data.orgId,
      environment: data.environment,
      csid_binary_token: data.csidBinaryToken,
      csid_secret: data.csidSecret,
      request_id: data.requestId ?? null,
      disposition_message: data.dispositionMessage ?? null,
      expires_at: data.expiresAt ?? null,
      revoked_at: null,
      issued_at: new Date().toISOString(),
      created_by: userId,
    };

    const { data: row, error } = await supabase
      .from("zatca_csid")
      .upsert(payload, { onConflict: "org_id,environment" })
      .select("id, environment")
      .single();
    if (error) throw new Error(error.message);

    try {
      await supabase.rpc("log_audit", {
        _entity: "zatca_csid",
        _entity_id: row.id,
        _action: "csid.saved",
        _diff: { environment: row.environment } as unknown as never,
        _actor: userId,
      });
    } catch {
      /* audit best-effort */
    }

    return { ok: true, id: row.id, environment: row.environment };
  });

export const revokeCsid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RevokeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("zatca_csid")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.csidId);
    if (error) throw new Error(error.message);

    try {
      await supabase.rpc("log_audit", {
        _entity: "zatca_csid",
        _entity_id: data.csidId,
        _action: "csid.revoked",
        _diff: {} as unknown as never,
        _actor: userId,
      });
    } catch {
      /* audit best-effort */
    }
    return { ok: true };
  });
