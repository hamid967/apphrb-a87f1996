import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getTurnstileSiteKey = createServerFn({ method: "GET" }).handler(async () => {
  return { siteKey: process.env.TURNSTILE_SITE_KEY ?? "" };
});

export const verifyTurnstile = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ token: z.string().min(1) }).parse(i))
  .handler(async ({ data }) => {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) return { success: false, error: "captcha_not_configured" as const };
    const body = new URLSearchParams({ secret, response: data.token });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const json = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    return { success: !!json.success, errors: json["error-codes"] ?? [] };
  });
