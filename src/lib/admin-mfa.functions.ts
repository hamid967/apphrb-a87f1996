import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAAL2SuperAdmin } from "@/lib/admin-auth-middleware";

/**
 * Admin-only: remove all TOTP factors from auth.mfa_factors for a given user
 * (or all users) after 2FA has been disabled application-wide.
 *
 * Uses Supabase Auth Admin API (mfa.listFactors + mfa.deleteFactor) — never
 * writes directly to the auth schema.
 */
export const purgeUserTotpFactors = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: factorsResp, error: listErr } =
      await supabaseAdmin.auth.admin.mfa.listFactors({ userId: data.userId });
    if (listErr) throw listErr;

    const factors = factorsResp?.factors ?? [];
    const totp = factors.filter((f) => f.factor_type === "totp");

    let deleted = 0;
    for (const f of totp) {
      const { error: delErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        userId: data.userId,
        id: f.id,
      });
      if (delErr) throw delErr;
      deleted++;
    }

    return { userId: data.userId, deleted, remaining: factors.length - deleted };
  });

export const purgeAllTotpFactors = createServerFn({ method: "POST" })
  .middleware([requireAAL2SuperAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const results: { userId: string; deleted: number }[] = [];
    let page = 1;
    while (page <= 50) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw error;

      for (const u of list.users) {
        const { data: factorsResp, error: lErr } =
          await supabaseAdmin.auth.admin.mfa.listFactors({ userId: u.id });
        if (lErr) throw lErr;
        const totp = (factorsResp?.factors ?? []).filter(
          (f) => f.factor_type === "totp",
        );
        if (totp.length === 0) continue;

        let deleted = 0;
        for (const f of totp) {
          const { error: dErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
            userId: u.id,
            id: f.id,
          });
          if (dErr) throw dErr;
          deleted++;
        }
        results.push({ userId: u.id, deleted });
      }

      if (list.users.length < 200) break;
      page++;
    }

    const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);
    return { usersAffected: results.length, totalDeleted, results };
  });
