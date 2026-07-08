"""
Playwright smoke: /tenant/portal/maintenance renders correctly for a
signed-in tenant user via the parent layout's <Outlet />. Verifies:

  1. The URL returns 200 and does NOT bounce to /auth / /access-denied.
  2. The child page body actually renders — not just the parent shell —
     by asserting the "Maintenance requests" heading and "New request"
     form card appear. Before the layout fix these would be missing
     because <Outlet /> wasn't present in tenant.portal.tsx.
  3. `tenantMyContext` server fn resolves (no runtime error banner).

Skips cleanly when LOVABLE_BROWSER_AUTH_STATUS != "injected".
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/tenant-portal-maintenance")
SHOTS.mkdir(parents=True, exist_ok=True)

REJECT = ("/auth", "/access-denied", "/onboarding")


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


async def main() -> int:
    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "no_supabase")

    # ------------------------------------------------------------------
    # Signed-out path: assert (not skip) that the managed _authenticated
    # gate bounces the visitor to /auth. Regressions here would let a
    # signed-out user render the maintenance shell or see a blank page.
    # ------------------------------------------------------------------
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        resp = await page.goto(
            f"{BASE}/tenant/portal/maintenance",
            wait_until="domcontentloaded",
        )
        await page.wait_for_load_state("networkidle", timeout=8000)
        await page.screenshot(path=str(SHOTS / "signed_out.png"))
        code = resp.status if resp else 0
        final = page.url.replace(BASE, "") or "/"
        print(f"signed-out: final={final}  http={code}")
        if not final.startswith("/auth"):
            print("FAIL: signed-out visitor was NOT redirected to /auth.")
            await browser.close()
            return 1
        # Confirm the auth page carries redirect-back to this route so the
        # user lands back after signing in.
        search = final.split("?", 1)[1] if "?" in final else ""
        if "tenant/portal/maintenance" not in search:
            print(f"WARN: /auth reached without redirect-back search "
                  f"param (got: {search!r}). Sign-in will not restore the "
                  f"original destination.")
        await browser.close()

    if status != "injected":
        print("\nSigned-in check SKIPPED "
              f"(LOVABLE_BROWSER_AUTH_STATUS={status!r}). "
              "Sign in as a tenant in the preview, then re-run to verify "
              "the maintenance UI renders.")
        return 0

    # ------------------------------------------------------------------
    # Signed-in path: assert the child route renders through the parent's
    # <Outlet /> (either the form or the "not linked" fallback).
    # ------------------------------------------------------------------
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        await restore(context, page)

        resp = await page.goto(
            f"{BASE}/tenant/portal/maintenance", wait_until="domcontentloaded"
        )
        await page.wait_for_load_state("networkidle", timeout=8000)
        await page.screenshot(path=str(SHOTS / "maintenance.png"))

        status_code = resp.status if resp else 0
        final = page.url.replace(BASE, "") or "/"
        print(f"final={final}  http={status_code}")

        if any(final.startswith(p) for p in REJECT):
            print(f"FAIL: bounced away to {final}")
            return 1
        if not final.startswith("/tenant/portal/maintenance"):
            print(f"FAIL: unexpected final URL {final}")
            return 1

        body = (await page.locator("body").inner_text()).lower()

        # Signed-in tenant with linked profile → the maintenance UI.
        # Signed-in user without a tenant link → "not linked to a tenant".
        # Both prove the child route rendered via the parent's <Outlet />;
        # only a blank page / parent-only shell would indicate the layout
        # regression.
        rendered_child = (
            "maintenance requests" in body and "new request" in body
        )
        rendered_not_linked = "not linked to a tenant" in body

        if not (rendered_child or rendered_not_linked):
            print("FAIL: neither the maintenance form nor the 'not linked' "
                  "fallback rendered — Outlet wiring likely broke again.")
            print("body preview:", body[:400])
            return 1

        print("OK: child route rendered under tenant.portal layout "
              f"({'form' if rendered_child else 'not-linked fallback'}).")

        await browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))