"""
Integration test: the "رقم المنشأة غير صحيح" rejection toast must appear
ONLY when a wrong establishment number is submitted. Submitting the form
with an EMPTY establishment number must never trigger it — that gate lives
behind `if (estNo)` in src/routes/auth.tsx.

Approach:

  - Static: assert the exact rejection string appears exactly once in
    src/routes/auth.tsx and lies inside the `if (estNo) { ... }` block —
    if the guard is ever removed, the source check fails.

  - Runtime: intercept Supabase network so the flow is deterministic
    without real credentials:
        POST /auth/v1/token?grant_type=password     -> fake success session
        POST /rest/v1/rpc/verify_my_establishment   -> returns `false`
        POST /rest/v1/rpc/check_login_rate_limit    -> not blocked
        POST /rest/v1/rpc/record_login_event        -> no-op
    Then run two submissions on /auth:
        (a) empty est_no  -> toast MUST NOT appear
        (b) wrong est_no  -> toast MUST appear and page stays on /auth

Run:
  python3 tests/integration/portal-est-toast.spec.py
"""

import asyncio
import json
import re
import sys
from playwright.async_api import async_playwright, Page, Route

BASE = "http://localhost:8080"
TOAST = "رقم المنشأة غير صحيح"
results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed})
    print(f"{'PASS' if passed else 'FAIL'} — {name}{(' :: ' + detail) if detail else ''}")


# ---------- static guard ---------------------------------------------------

def check_source_guard() -> None:
    try:
        src = open("src/routes/auth.tsx", "r", encoding="utf-8").read()
    except FileNotFoundError:
        record("source file exists", False, "src/routes/auth.tsx missing")
        return

    occurrences = src.count(TOAST)
    record("rejection string appears exactly once", occurrences == 1,
           f"count={occurrences}")

    # The rejection throw must live inside the `if (estNo) { ... }` block.
    m = re.search(r"if\s*\(\s*estNo\s*\)\s*\{([\s\S]*?)\n\s{8,10}\}\s*\n", src)
    inside = (m and TOAST in m.group(1))
    record("rejection lives inside `if (estNo)` block", bool(inside))


# ---------- runtime with mocked backend ------------------------------------

FAKE_SESSION = {
    "access_token": "fake.access.token",
    "refresh_token": "fake-refresh",
    "expires_in": 3600,
    "expires_at": 9999999999,
    "token_type": "bearer",
    "user": {
        "id": "00000000-0000-0000-0000-000000000001",
        "aud": "authenticated",
        "role": "authenticated",
        "email": "portal-user@example.com",
        "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": {},
        "identities": [],
        "created_at": "2026-01-01T00:00:00Z",
    },
}


async def install_mocks(page: Page) -> None:
    """Mock only the direct Supabase endpoints.

    TanStack Start `_serverFn` responses use a framed encoding; returning
    plain JSON from a mock corrupts the fetcher and the whole flow throws
    before `signInWithPassword` runs. So we let `checkLoginRateLimit` and
    `recordLoginEvent` hit the real backend (they're safe: read-only rate
    check + best-effort logging) and mock only the Supabase auth surface.
    """
    async def handle(route: Route) -> None:
        url = route.request.url
        method = route.request.method
        if "/auth/v1/token" in url and method == "POST":
            await route.fulfill(status=200, content_type="application/json",
                                body=json.dumps(FAKE_SESSION))
            return
        if "/rest/v1/rpc/verify_my_establishment" in url:
            await route.fulfill(status=200, content_type="application/json",
                                body="false")
            return
        if "/auth/v1/logout" in url:
            await route.fulfill(status=204, body="")
            return
        await route.continue_()

    await page.route("**/*.supabase.co/**", handle)


async def submit(page: Page, est: str) -> None:
    await page.goto(f"{BASE}/auth", wait_until="domcontentloaded")
    await page.wait_for_selector("input#est_no", timeout=10000)
    await page.fill("input#email", "portal-user@example.com")
    # Must satisfy the HTML5 minlength=6 constraint or the browser blocks
    # form submission before any network request is made.
    await page.fill("input#password", "mocked-password")
    await page.fill("input#est_no", est)
    await page.click("button[type=submit]", force=True)


async def toast_appears(page: Page, timeout_ms: int) -> bool:
    try:
        await page.wait_for_selector(f"text={TOAST}", timeout=timeout_ms,
                                     state="visible")
        return True
    except Exception:
        return False


async def check_runtime() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            # (a) EMPTY est_no — rejection toast must NEVER appear.
            # Fresh context per case: the "empty" flow ends with a mocked
            # successful session in storage, which would otherwise auto-redirect
            # the next /auth visit away from the sign-in form.
            ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
            page = await ctx.new_page()
            await install_mocks(page)
            await submit(page, est="")
            saw_empty = await toast_appears(page, timeout_ms=6000)
            record("empty est_no does NOT show rejection toast",
                   saw_empty is False,
                   f"url={page.url} toast_shown={saw_empty}")
            await ctx.close()

            # (b) WRONG est_no — rejection toast MUST appear and we stay on /auth.
            ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
            page = await ctx.new_page()
            await install_mocks(page)
            await submit(page, est="HBS-000000")
            saw_wrong = await toast_appears(page, timeout_ms=8000)
            record("wrong est_no DOES show rejection toast",
                   saw_wrong is True, f"url={page.url}")
            record("wrong est_no keeps user on /auth",
                   "/auth" in page.url, f"url={page.url}")
            await ctx.close()
        finally:
            await browser.close()


async def main() -> int:
    check_source_guard()
    await check_runtime()
    passed = sum(1 for r in results if r["passed"])
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
