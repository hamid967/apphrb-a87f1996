import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { redirect } from "@tanstack/react-router";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OnboardingProgress = Record<string, { done: boolean; at: string }>;

export const REQUIRED_ONBOARDING_STEPS = ["profile", "company", "first_receipt"] as const;

/**
 * Pure merger used by `setOnboardingStep`. Extracted so the backfill
 * behaviour for pre-existing users (implicit `profile` when a full_name
 * exists, implicit `company` when an organization membership exists) can
 * be unit-tested without a live database.
 */
export function computeNextOnboarding(input: {
  current: OnboardingProgress;
  step: string;
  done: boolean;
  fullName: string | null;
  hasCompany: boolean;
  now?: Date;
}): { next: OnboardingProgress; completed: boolean } {
  const nowIso = (input.now ?? new Date()).toISOString();
  const next: OnboardingProgress = { ...input.current };
  if (input.done) {
    next[input.step] = { done: true, at: nowIso };
  } else {
    delete next[input.step];
  }
  if (input.fullName && !next.profile?.done) {
    next.profile = { done: true, at: nowIso };
  }
  if (input.hasCompany && !next.company?.done) {
    next.company = { done: true, at: nowIso };
  }
  const completed = REQUIRED_ONBOARDING_STEPS.every((s) => next[s]?.done === true);
  return { next, completed };
}

export const getOnboardingProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("onboarding_progress, onboarding_completed_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      progress: (data?.onboarding_progress ?? {}) as OnboardingProgress,
      completed_at: data?.onboarding_completed_at ?? null,
    };
  });

const setStepInput = z.object({
  step: z.string().min(1).max(64),
  done: z.boolean().default(true),
});

export const setOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => setStepInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error: readErr } = await context.supabase
      .from("profiles")
      .select("onboarding_progress, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    // Does the user already belong to a company? Used to auto-mark the
    // `company` step done for pre-existing accounts.
    const { data: membership } = await context.supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    const hasCompany = !!membership?.org_id;
    const { next, completed: allDone } = computeNextOnboarding({
      current: (row?.onboarding_progress ?? {}) as OnboardingProgress,
      step: data.step,
      done: data.done,
      fullName: row?.full_name ?? null,
      hasCompany,
    });
    const { error } = await context.supabase
      .from("profiles")
      .update({
        onboarding_progress: next,
        onboarding_completed_at: allDone ? new Date().toISOString() : null,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { progress: next, completed: allDone };
  });

/**
 * Server-side access guard: throws a router redirect to /onboarding/wizard
 * unless the caller's onboarding_progress has `done === true` for every
 * required step AND `onboarding_completed_at` is set. super_admin bypasses.
 *
 * Call from a loader under `_authenticated/` (the managed auth gate ensures
 * the caller is signed in). The redirect throws are handled by the router.
 */
export const requireOnboardingComplete = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuperAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as never,
    });
    if (isSuperAdmin === true) return { ok: true as const, bypass: "super_admin" as const };

    const { data, error } = await context.supabase
      .from("profiles")
      .select("onboarding_progress, onboarding_completed_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const progress = (data?.onboarding_progress ?? {}) as OnboardingProgress;
    const allDone = REQUIRED_ONBOARDING_STEPS.every((s) => progress[s]?.done === true);
    const completedAt = data?.onboarding_completed_at ?? null;

    if (!allDone || !completedAt) {
      throw redirect({ to: "/onboarding/wizard" });
    }
    return { ok: true as const, completed_at: completedAt };
  });
