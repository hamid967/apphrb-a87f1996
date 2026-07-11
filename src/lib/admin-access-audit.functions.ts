import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Audit log for FAILED attempts to reach the /admin surface.
 *
 * Runs WITHOUT `requireSupabaseAuth` because the whole point is to record
 * the visitor who could not authenticate. To avoid exposing sensitive data
 * or being weaponised into a spam sink, this function:
 *
 *   - Only accepts a fixed enum of `kind` values.
 *   - Persists only the enum, the pathname, and (best-effort) the JWT
 *     `sub` claim decoded from the bearer header. No email, no IP, no
 *     stack traces, no arbitrary payload from the client.
 *   - Writes through `supabaseAdmin` because `system_events` has no
 *     public INSERT policy.
 */

type Kind = "signin_required" | "session_expired" | "access_denied";
const KINDS = new Set<Kind>(["signin_required", "session_expired", "access_denied"]);

// Decode a JWT payload without verifying the signature. Used only to
// extract the `sub` claim for correlation; the token has already been
// rejected upstream, so we treat it as untrusted metadata.
function decodeSub(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    const claims = JSON.parse(json) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

export const logAdminAccessDenied = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const d = (data ?? {}) as Record<string, unknown>;
    const kind = String(d.kind ?? "") as Kind;
    if (!KINDS.has(kind)) throw new Error("invalid_kind");
    const path = typeof d.path === "string" ? d.path.slice(0, 256) : null;
    const subReason = typeof d.subReason === "string" ? d.subReason.slice(0, 64) : null;
    return { kind, path, subReason };
  })
  .handler(async ({ data }) => {
    // Best-effort actor id from the bearer token, or null.
    const auth = getRequestHeader("authorization") || getRequestHeader("Authorization");
    const token = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
    const actorId = decodeSub(token);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("system_events").insert({
      event_type: `admin.access_denied.${data.kind}`,
      actor_id: actorId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: { path: data.path, subReason: data.subReason } as any,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
