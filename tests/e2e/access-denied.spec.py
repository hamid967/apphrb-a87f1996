"""
Playwright smoke: /access-denied page + guard behavior.

  1. Directly visiting /access-denied?reason=missing_role&from=/dashboard
     renders the localized shell:
       - localized title ("Access denied" / "غير مصرح لك بالوصول")
       - localized body copy
       - the `reason` search param is echoed as a code chip
       - "Home" and "Go to portal" navigation buttons exist and link to
         "/" and "/portal" respectively.
  2. A signed-out visit to a protected route (/portal/tenant/payments)
     lands on /auth (managed gate) — NOT on /access-denied. This proves
     the two surfaces stay distinct: /auth = "not signed in",
     /access-denied = "signed in but lacking permission".
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/access-denied")
SHOTS.mkdir(parents=True, exist_ok=True)

TITLE_MARKERS = ("access denied", "غير مصرح لك بالوصول")
BODY_MARKERS = (
    "permissions required",
    "ليست لديك الصلاحية المطلوبة",
)
HOME_MARKERS = ("home", "الرئيسية")
PORTAL_MARKERS = ("go to portal", "الذهاب إلى البوابة")


async def check_access_denied_render() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        url = f"{BASE}/access-denied?reason=missing_role&from=/dashboard"
        resp = await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle", timeout=8000)
        await page.screenshot(path=str(SHOTS / "access_denied.png"))
        code = resp.status if resp else 0
        final = page.url.replace(BASE, "") or "/"
        print(f"access-denied: final={final}  http={code}")

        if not final.startswith("/access-denied"):
            print(f"FAIL: navigation left /access-denied → {final}")
            await browser.close()
            return 1

        body = (await page.locator("body").inner_text()).lower()

        if not any(m in body for m in TITLE_MARKERS):
            print("FAIL: localized title missing.")
            print("body preview:", body[:400])
            await browser.close()
            return 1
        if not any(m in body for m in BODY_MARKERS):
            print("FAIL: localized body copy missing.")
            await browser.close()
            return 1
        if "missing_role" not in body:
            print("FAIL: reason search param not echoed on page.")
            await browser.close()
            return 1

        # Verify both nav links exist and target the right routes.
        home_link = page.locator("a[href='/']")
        portal_link = page.locator("a[href='/portal']")
        if await home_link.count() == 0:
            print("FAIL: Home link (href='/') not rendered.")
            await browser.close()
            return 1
        if await portal_link.count() == 0:
            print("FAIL: Portal link (href='/portal') not rendered.")
            await browser.close()
            return 1

        home_text = (await home_link.first.inner_text()).lower()
        portal_text = (await portal_link.first.inner_text()).lower()
        if not any(m in home_text for m in HOME_MARKERS):
            print(f"FAIL: Home button label not localized ({home_text!r}).")
            await browser.close()
            return 1
        if not any(m in portal_text for m in PORTAL_MARKERS):
            print(
                f"FAIL: Portal button label not localized ({portal_text!r})."
            )
            await browser.close()
            return 1

        print("OK: /access-denied renders localized shell + reason chip.")
        await browser.close()
        return 0


async def check_guard_does_not_use_access_denied_for_signed_out() -> int:
    """A signed-out visitor to a protected route must land on /auth, not
    on /access-denied. /access-denied is reserved for authenticated users
    who lack the required permission."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        resp = await page.goto(
            f"{BASE}/portal/tenant/payments", wait_until="domcontentloaded"
        )
        await page.wait_for_load_state("networkidle", timeout=8000)
        await page.screenshot(path=str(SHOTS / "guard_bounce.png"))
        final = page.url.replace(BASE, "") or "/"
        code = resp.status if resp else 0
        print(f"guard-bounce: final={final}  http={code}")
        await browser.close()

        if final.startswith("/access-denied"):
            print(
                "FAIL: signed-out visitor was routed to /access-denied. "
                "The unauthenticated gate must send them to /auth instead."
            )
            return 1
        if not final.startswith("/auth"):
            print(f"FAIL: expected /auth bounce, got {final}")
            return 1
        return 0


async def main() -> int:
    rc = await check_access_denied_render()
    if rc:
        return rc
    return await check_guard_does_not_use_access_denied_for_signed_out()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
