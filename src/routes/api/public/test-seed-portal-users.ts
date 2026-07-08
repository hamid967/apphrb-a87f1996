// Public seed endpoint for end-to-end Playwright tests.
//
// Creates (idempotently) two auth users — one tenant, one owner — with
// fixed credentials, then wires up the minimum org / tenant / owner /
// contract / statement graph needed to exercise the portal routes.
//
// Auth model: this route is under /api/public/* so it bypasses the
// published-site auth gate. It is protected exclusively by a shared
// TEST_SEED_TOKEN sent via `x-test-seed-token` header (or
// `Authorization: Bearer <token>`) using a constant-time comparison.
// The endpoint refuses to run at all if TEST_SEED_TOKEN is not set on
// the server, so it is inert on any project that doesn't opt in.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const TENANT_EMAIL = "tenant.e2e@hbspro.test";
const OWNER_EMAIL = "owner.e2e@hbspro.test";
const FIXED_PASSWORD = "Aqari-E2E-2026!Portal";

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function upsertUser(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  email: string,
): Promise<string> {
  // Idempotent: create if missing, otherwise fetch existing id.
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: FIXED_PASSWORD,
    email_confirm: true,
    user_metadata: { e2e_seed: true },
  });
  if (!error && created?.user?.id) {
    return created.user.id;
  }
  // Existing user path: paginate to find them (admin.getUserByEmail is not
  // in the JS client). Page size 200 is enough for a test project.
  for (let page = 1; page <= 20; page++) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) throw listErr;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) {
      // Reset password so the fixed credential always works even if a
      // previous run left the user with a stale password.
      await admin.auth.admin.updateUserById(hit.id, {
        password: FIXED_PASSWORD,
        email_confirm: true,
      });
      return hit.id;
    }
    if (data.users.length < 200) break;
  }
  throw new Error(
    `Failed to upsert auth user ${email}: ${error?.message ?? "not found after list"}`,
  );
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const Route = createFileRoute("/api/public/test-seed-portal-users")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.TEST_SEED_TOKEN;
        if (!expected) {
          return new Response("Seed endpoint disabled", { status: 404 });
        }
        const header =
          request.headers.get("x-test-seed-token") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!header || !tokensMatch(header, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const admin = await loadAdmin();
          const tenantUid = await upsertUser(admin, TENANT_EMAIL);
          const ownerUid = await upsertUser(admin, OWNER_EMAIL);

          const { data, error } = await admin.rpc("seed_portal_test_users", {
            _tenant_uid: tenantUid,
            _owner_uid: ownerUid,
          });
          if (error) throw error;

          return Response.json({
            ok: true,
            credentials: {
              tenant: { email: TENANT_EMAIL, password: FIXED_PASSWORD, user_id: tenantUid },
              owner: { email: OWNER_EMAIL, password: FIXED_PASSWORD, user_id: ownerUid },
            },
            seed: data,
          });
        } catch (err) {
          const anyErr = err as {
            message?: string;
            details?: string;
            hint?: string;
            code?: string;
            status?: number;
          };
          const message = anyErr?.message ?? (typeof err === "string" ? err : JSON.stringify(err));
          return Response.json(
            {
              ok: false,
              error: message,
              details: anyErr?.details,
              hint: anyErr?.hint,
              code: anyErr?.code,
              status: anyErr?.status,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
