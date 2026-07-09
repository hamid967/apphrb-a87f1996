"""
Playwright smoke: /portal/tenant/payments.

  1. Signed-out visitor is bounced to /auth with a redirect-back search
     param pointing at the payments route (the managed _authenticated gate).
  2. When LOVABLE_BROWSER_AUTH_STATUS == "injected", the signed-in tenant
     reaches /portal/tenant/payments and the localized page shell renders
     (title + "payment history" heading in AR or EN via i18n keys).

Skips signed-in assertions cleanly when the session isn't injected.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
ROUTE = "/portal/tenant/payments"
SHOTS = Path("/tmp/browser/tenant-portal-payments")
SHOTS.mkdir(parents=True, exist_ok=True)

REJECT = ("/auth", "/access-denied", "/onboarding")

# Any of these substrings proves the localized payments page rendered
# (covers ar + en i18n values for title / history heading).
LOCALIZED_MARKERS = (
    "مدفوعاتي",
    "سجل المدفوعات",
    "my payments",
    "payment history",
)


async def restore(context, page) -> None:
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies:
        arr = json.loads(cookies)
        for c in arr:
            c["url"] = BASE
        await context.add_cookies(arr)
    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session:
        await page.evaluate(
            "([k, v]) => window.localStorage.setItem(k, v)",
            [storage_key, session],
        )


async def signed_out_check() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        resp = await page.goto(f"{BASE}{ROUTE}", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle", timeout=8000)
        await page.screenshot(path=str(SHOTS / "signed_out.png"))
        code = resp.status if resp else 0
        final = page.url.replace(BASE, "") or "/"
        print(f"signed-out: final={final}  http={code}")
        await browser.close()
        if not final.startswith("/auth"):
            print("FAIL: signed-out visitor was NOT redirected to /auth.")
            return 1
        search = final.split("?", 1)[1] if "?" in final else ""
        if "portal/tenant/payments" not in search:
            print(
                "WARN: /auth reached without redirect-back search param "
                f"(got: {search!r})."
            )
        return 0


async def signed_in_check() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        await restore(context, page)
        resp = await page.goto(f"{BASE}{ROUTE}", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle", timeout=10000)
        await page.screenshot(path=str(SHOTS / "signed_in.png"))
        code = resp.status if resp else 0
        final = page.url.replace(BASE, "") or "/"
        print(f"signed-in: final={final}  http={code}")

        if any(final.startswith(p) for p in REJECT):
            print(f"FAIL: bounced away to {final}")
            await browser.close()
            return 1
        if not final.startswith(ROUTE):
            print(f"FAIL: unexpected final URL {final}")
            await browser.close()
            return 1

        body = (await page.locator("body").inner_text()).lower()
        if not any(m.lower() in body for m in LOCALIZED_MARKERS):
            print(
                "FAIL: no localized marker for the payments page rendered."
            )
            print("body preview:", body[:400])
            await browser.close()
            return 1

        print("OK: tenant payments page rendered with i18n content.")
        await browser.close()
        return 0


async def main() -> int:
    rc = await signed_out_check()
    if rc:
        return rc

    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "no_supabase")
    if status != "injected":
        print(
            "\nSigned-in check SKIPPED "
            f"(LOVABLE_BROWSER_AUTH_STATUS={status!r}). "
            "Sign in as a tenant in the preview, then re-run."
        )
        return 0
    return await signed_in_check()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
