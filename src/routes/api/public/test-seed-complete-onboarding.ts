// Public seed endpoint used by tests/e2e/full-signup-flow.spec.py to
// simulate a single onboarding-wizard step submission. Mirrors what
// setOnboardingStep() writes: flips one entry in profiles.onboarding_progress
// to { done: true, at: <now> } and stamps profiles.onboarding_completed_at
// once every required step (profile / company / first_receipt) is marked
// done.
//
// Protected by the same TEST_SEED_TOKEN header as the other seed endpoints.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const REQUIRED_STEPS = ["profile", "company", "first_receipt"] as const;
type StepKey = (typeof REQUIRED_STEPS)[number];

export const Route = createFileRoute("/api/public/test-seed-complete-onboarding")({
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

        let body: { user_id?: string; step?: string; reset?: boolean; all?: boolean };
        try {
          body = (await request.json()) as {
            user_id?: string;
            step?: string;
            reset?: boolean;
            all?: boolean;
          };
        } catch {
          return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
        }
        const userId = body.user_id;
        if (!userId || typeof userId !== "string") {
          return Response.json({ ok: false, error: "user_id is required" }, { status: 400 });
        }
        // `reset: true` (with no step) wipes onboarding_progress and
        // onboarding_completed_at back to a clean slate — used by tests
        // that exercise "only step X done" permutations.
        // `all: true` marks every REQUIRED_STEP done in one call and
        // stamps onboarding_completed_at — used by E2E tests that need
        // a fully-onboarded profile without walking the wizard.
        const isReset = body.reset === true;
        const isAll = body.all === true;
        const step = body.step as StepKey | undefined;
        if (!isReset && !isAll && (!step || !REQUIRED_STEPS.includes(step))) {
          return Response.json(
            { ok: false, error: `step must be one of ${REQUIRED_STEPS.join(", ")}` },
            { status: 400 },
          );
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          if (isReset && !step) {
            const { error: resetErr } = await supabaseAdmin
              .from("profiles")
              .update({ onboarding_progress: {}, onboarding_completed_at: null })
              .eq("id", userId);
            if (resetErr) throw resetErr;
            return Response.json({
              ok: true,
              user_id: userId,
              step: null,
              progress: {},
              completed_at: null,
              reset: true,
            });
          }
          if (isAll) {
            const at = new Date().toISOString();
            const progress = Object.fromEntries(
              REQUIRED_STEPS.map((s) => [s, { done: true, at }]),
            ) as Record<StepKey, { done: true; at: string }>;
            const { error: allErr } = await supabaseAdmin
              .from("profiles")
              .update({
                onboarding_progress: progress,
                onboarding_completed_at: at,
              })
              .eq("id", userId);
            if (allErr) throw allErr;
            return Response.json({
              ok: true,
              user_id: userId,
              step: null,
              progress,
              completed_at: at,
              all: true,
            });
          }
          let startingProgress: Record<string, { done?: boolean; at?: string }> = {};
          if (!isReset) {
            const { data: row, error: readErr } = await supabaseAdmin
              .from("profiles")
              .select("onboarding_progress")
              .eq("id", userId)
              .maybeSingle();
            if (readErr) throw readErr;
            startingProgress =
              (row?.onboarding_progress as Record<
                string,
                { done?: boolean; at?: string }
              > | null) ?? {};
          }
          const at = new Date().toISOString();
          const progress = { ...startingProgress, [step!]: { done: true, at } };
          const allDone = REQUIRED_STEPS.every((s) => progress[s]?.done === true);
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({
              onboarding_progress: progress,
              onboarding_completed_at: allDone ? at : null,
            })
            .eq("id", userId);
          if (error) throw error;
          return Response.json({
            ok: true,
            user_id: userId,
            step,
            progress,
            completed_at: allDone ? at : null,
          });
        } catch (err) {
          const anyErr = err as { message?: string; details?: string; hint?: string };
          return Response.json(
            {
              ok: false,
              error: anyErr?.message ?? String(err),
              details: anyErr?.details,
              hint: anyErr?.hint,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
