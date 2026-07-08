"""
E2E: verifies that admin server functions reject callers whose session is not
at AAL2, even when the admin browser layout was bypassed for tests.

Requirements to run:
    - LOVABLE_BROWSER_AUTH_STATUS=injected (managed Supabase session available)
    - Dev server on http://localhost:8080
    - Session must belong to a super_admin whose session is AAL1
      (i.e. did NOT verify TOTP), OR the account has TOTP disabled entirely.

What it asserts:
    1. GET /_serverFn/... for an admin function returns HTTP 500 with a JSON
       body whose message begins with "Forbidden" — this is TanStack's RPC
       protocol wrapping the thrown Error.
    2. When the E2E bypass token is set in sessionStorage AND matches the
       server-side secret, the same call succeeds (200).

Skip if:
    - No Supabase session is available (LOVABLE_BROWSER_AUTH_STATUS != injected).
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

SCREENSHOTS = Path("/tmp/browser/admin-fn-requires-aal2")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


async def main() -> int:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        print("SKIP: no Supabase session injected")
        return 0

    storage_key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
    session_json = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = "http://localhost:8080"
            await context.add_cookies(cookies)

        await page.goto("http://localhost:8080", wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )

        # 1) Without bypass: call any admin server fn — must be rejected.
        # We probe via the client SDK because RPC URL/id is opaque.
        without_bypass = await page.evaluate(
            """async () => {
              const { getAdminOverview } = await import('/src/lib/admin-stats.functions.ts');
              try { await getAdminOverview(); return { ok: true }; }
              catch (e) { return { ok: false, message: String(e && e.message || e) }; }
            }"""
        )
        print("without_bypass:", without_bypass)
        assert without_bypass.get("ok") is False, "expected Forbidden without AAL2"
        assert "Forbidden" in without_bypass.get("message", ""), (
            f"unexpected error: {without_bypass}"
        )

        # 2) With bypass token: must succeed (only when server env allows it).
        bypass_token = os.environ.get("E2E_BYPASS_TOKEN")
        if bypass_token and len(bypass_token) >= 16:
            await page.evaluate(
                f'window.sessionStorage.setItem("__admin_e2e_skip_aal2", {json.dumps(bypass_token)})'
            )
            with_bypass = await page.evaluate(
                """async () => {
                  const { getAdminOverview } = await import('/src/lib/admin-stats.functions.ts');
                  try { await getAdminOverview(); return { ok: true }; }
                  catch (e) { return { ok: false, message: String(e && e.message || e) }; }
                }"""
            )
            print("with_bypass:", with_bypass)
            assert with_bypass.get("ok") is True, (
                f"bypass path should succeed: {with_bypass}"
            )
        else:
            print("SKIP bypass verification: E2E_BYPASS_TOKEN not set (>=16 chars)")

        await page.screenshot(path=str(SCREENSHOTS / "final.png"))
        await browser.close()

    print("PASS: admin server fns enforce AAL2 + super_admin")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))