// Public seed endpoint for the full company-signup + subscription-approval
// Playwright spec (tests/e2e/full-signup-flow.spec.py).
//
// Idempotently ensures:
//   - a super_admin auth user (fixed creds)
//   - a fresh company-owner auth user (fixed creds) with NO org membership,
//     so register_company() can run cleanly in the test
//
// All prior orgs / subscriptions / payments tied to the owner are wiped so
// each run starts from a clean slate.
//
// Protected by the same TEST_SEED_TOKEN header as the other seed endpoints.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const OWNER_EMAIL = "owner.e2e@hbspro.test";
const ADMIN_EMAIL = "superadmin.e2e@hbspro.test";
const FIXED_PASSWORD = "Aqari-E2E-2026!Signup";

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function upsertUser(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  email: string,
): Promise<string> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: FIXED_PASSWORD,
    email_confirm: true,
    user_metadata: { e2e_seed: true },
  });
  if (!error && created?.user?.id) return created.user.id;
  for (let page = 1; page <= 20; page++) {
    const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listErr) throw listErr;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) {
      await admin.auth.admin.updateUserById(hit.id, {
        password: FIXED_PASSWORD,
        email_confirm: true,
      });
      return hit.id;
    }
    if (data.users.length < 200) break;
  }
  throw new Error(`Failed to upsert auth user ${email}: ${error?.message ?? "not found"}`);
}

export const Route = createFileRoute("/api/public/test-seed-full-signup-flow")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.TEST_SEED_TOKEN;
        if (!expected) return new Response("Seed endpoint disabled", { status: 404 });
        const header =
          request.headers.get("x-test-seed-token") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!header || !tokensMatch(header, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const admin = await loadAdmin();
          const ownerUid = await upsertUser(admin, OWNER_EMAIL);
          const adminUid = await upsertUser(admin, ADMIN_EMAIL);

          // Grant super_admin role (idempotent).
          {
            const { error } = await admin
              .from("user_roles")
              .upsert({ user_id: adminUid, role: "super_admin" }, { onConflict: "user_id,role" });
            if (error) throw error;
          }

          // Wipe any orgs created by the owner in prior runs so
          // register_company() can succeed again this run.
          const { data: priorOrgs } = await admin
            .from("organizations")
            .select("id")
            .eq("created_by", ownerUid);
          const priorOrgIds = (priorOrgs ?? []).map((o) => o.id);
          if (priorOrgIds.length) {
            await admin.from("subscription_payments").delete().in("org_id", priorOrgIds);
            await admin.from("subscriptions").delete().in("org_id", priorOrgIds);
            await admin.from("organization_members").delete().in("org_id", priorOrgIds);
            await admin.from("organizations").delete().in("id", priorOrgIds);
          }
          // Belt-and-suspenders: drop any lingering membership rows so the
          // "already belongs to a company" guard cannot fire.
          await admin.from("organization_members").delete().eq("user_id", ownerUid);

          // Reset owner onboarding state so each run exercises the
          // /onboarding/wizard redirect from a clean slate. Without this
          // the second run would find profile.onboarding_completed_at
          // already set from the previous run and skip the gate.
          await admin
            .from("profiles")
            .update({ onboarding_progress: {}, onboarding_completed_at: null })
            .eq("id", ownerUid);

          // Wipe any MFA factors on the super_admin user so the E2E can
          // enroll a fresh TOTP factor each run. Uses the JS SDK's admin
          // MFA methods (list + delete).
          const mfaDeleted = await resetMfaFactors(admin, adminUid);

          return Response.json({
            ok: true,
            mfa_factors_deleted: mfaDeleted,
            credentials: {
              owner: { email: OWNER_EMAIL, password: FIXED_PASSWORD, user_id: ownerUid },
              super_admin: { email: ADMIN_EMAIL, password: FIXED_PASSWORD, user_id: adminUid },
            },
          });
        } catch (err) {
          const anyErr = err as {
            message?: string;
            details?: string;
            hint?: string;
            code?: string;
          };
          return Response.json(
            {
              ok: false,
              error: anyErr?.message ?? String(err),
              details: anyErr?.details,
              hint: anyErr?.hint,
              code: anyErr?.code,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});

// -------- MFA reset helper (GoTrue admin REST) --------
// Supabase JS SDK doesn't expose `auth.admin.mfa.*`; use the REST admin
// endpoint directly with the service role key.
async function resetMfaFactors(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  userId: string,
): Promise<number> {
  // GET /admin/users/{id}/factors → { factors: [...] }
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error || !data) return 0;
  const factors = data.factors ?? [];
  let deleted = 0;
  for (const f of factors) {
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
      userId,
      id: f.id,
    });
    if (!delErr) deleted += 1;
  }
  return deleted;
}
