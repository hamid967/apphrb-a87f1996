import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ApiAuthResult =
  | { ok: true; orgId: string; keyId: string; scopes: string[] }
  | { ok: false; status: number; message: string };

const RATE_LIMIT_PER_MIN = 60;

export async function verifyApiKey(request: Request, endpoint: string): Promise<ApiAuthResult> {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, message: "Missing bearer token" };
  }
  const token = auth.slice(7).trim();
  if (!token) return { ok: false, status: 401, message: "Empty token" };
  const hash = createHash("sha256").update(token).digest("hex");
  const prefix = token.slice(0, 8);
  const { data: row } = await supabaseAdmin
    .from("api_keys")
    .select("id, org_id, scopes, revoked_at, expires_at")
    .eq("key_prefix", prefix)
    .eq("key_hash", hash)
    .maybeSingle();
  if (!row) return { ok: false, status: 401, message: "Invalid API key" };
  if (row.revoked_at) return { ok: false, status: 401, message: "API key revoked" };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { ok: false, status: 401, message: "API key expired" };
  }
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("api_key_usage")
    .select("id", { count: "exact", head: true })
    .eq("api_key_id", row.id)
    .gte("created_at", since);
  if ((count ?? 0) >= RATE_LIMIT_PER_MIN) {
    await logUsage(row.id, row.org_id, endpoint, 429, request);
    return { ok: false, status: 429, message: "Rate limit exceeded (60 req/min)" };
  }
  await supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);
  return {
    ok: true,
    orgId: row.org_id,
    keyId: row.id,
    scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
  };
}

export async function logUsage(
  apiKeyId: string,
  orgId: string,
  endpoint: string,
  status: number,
  request: Request,
) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  await supabaseAdmin.from("api_key_usage").insert({
    api_key_id: apiKeyId,
    org_id: orgId,
    endpoint,
    status_code: status,
    request_ip: ip,
  });
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

export function optionsCors() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "86400",
    },
  });
}

export function requireScope(scopes: string[], required: string): boolean {
  return scopes.includes(required) || scopes.includes("*");
}
