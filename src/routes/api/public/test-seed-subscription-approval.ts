// Public seed endpoint for the double-approval Playwright spec.
//
// Creates (idempotently):
//   - a super_admin auth user with a fixed password
//   - a minimal organization owned by that user
//   - a fresh PENDING subscription_payment on that organization
//
// Returns the credentials + payment_id so the test can sign in, race two
// approve calls, and assert that the second call reports already_reviewed
// and that exactly ONE `approved` row was written to payment_approvals.
//
// Protected by the same TEST_SEED_TOKEN header as the portal seed endpoint.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

const ADMIN_EMAIL = "superadmin.e2e@hbspro.test";
const FIXED_PASSWORD = "Aqari-E2E-2026!Approve";
const ORG_SLUG = "e2e-approval-org";

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

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const Route = createFileRoute("/api/public/test-seed-subscription-approval")({
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
          const adminUid = await upsertUser(admin, ADMIN_EMAIL);

          // Grant super_admin role (idempotent via unique (user_id, role)).
          {
            const { error } = await admin
              .from("user_roles")
              .upsert({ user_id: adminUid, role: "super_admin" }, { onConflict: "user_id,role" });
            if (error) throw error;
          }

          // Upsert organization by slug.
          let orgId: string;
          {
            const { data: existing } = await admin
              .from("organizations")
              .select("id")
              .eq("slug", ORG_SLUG)
              .maybeSingle();
            if (existing?.id) {
              orgId = existing.id;
            } else {
              const { data, error } = await admin
                .from("organizations")
                .insert({ name: "E2E Approval Org", slug: ORG_SLUG, created_by: adminUid })
                .select("id")
                .single();
              if (error) throw error;
              orgId = data.id;
            }
          }

          // Wipe any prior payments + audit rows for this org so every run
          // starts from a clean slate — the test needs a fresh PENDING row
          // and an empty audit trail to assert exactly-one approval.
          await admin.from("subscription_payments").delete().eq("org_id", orgId);

          // Insert a fresh pending payment. The tg_log_payment_status_change
          // trigger will record a `submitted` audit row automatically.
          const { data: payment, error: payErr } = await admin
            .from("subscription_payments")
            .insert({
              org_id: orgId,
              submitted_by: adminUid,
              amount: 199.0,
              currency: "SAR",
              bank_name: "E2E Bank",
              bank_reference: "E2E-SEED-REF",
              receipt_url: "https://example.test/e2e-receipt.pdf",
              status: "pending",
            })
            .select("id")
            .single();
          if (payErr) throw payErr;

          return Response.json({
            ok: true,
            credentials: {
              super_admin: { email: ADMIN_EMAIL, password: FIXED_PASSWORD, user_id: adminUid },
            },
            seed: { org_id: orgId, payment_id: payment.id },
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
