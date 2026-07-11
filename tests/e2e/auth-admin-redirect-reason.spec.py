"""
Integration test: /admin and /auth safe-redirect + reason banner.

Signed-out expectations:
  1. GET /admin           -> /auth?reason=signin_required (no redirect param for /)
  2. GET /admin/users     -> /auth?redirect=/admin/users&reason=signin_required
  3. GET /admin/companies -> /auth?redirect=/admin/companies&reason=signin_required

/auth reason banner expectations (per URL param):
  - reason=signin_required  -> "الدخول مطلوب"
  - reason=session_expired  -> "انتهت جلستك"
  - reason=access_denied    -> "لا تملك صلاحية الوصول"
  - "متابعة الآن" button is rendered whenever a reason is present.

safeRedirect() must reject unsafe targets — /auth?redirect=<bad> must NOT
persist the bad value into the "Continue now" hint. Cases:
  - //evil.com
  - https://evil.com
  - /auth  (self-loop)
  - /%2f%2fevil.com
Only a safe path like /dashboard/settings should surface in the banner hint.

Run with:  python3 tests/e2e/auth-admin-redirect-reason.spec.py
"""
import asyncio
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/auth-admin-redirect-reason")
SHOTS.mkdir(parents=True, exist_ok=True)

ADMIN_CASES = [
    # (path, expected redirect param value or None if omitted for "/")
    ("/admin", None),
    ("/admin/users", "/admin/users"),
    ("/admin/companies", "/admin/companies"),
]

REASON_BANNERS = {
    "signin_required": "الدخول مطلوب",
    "session_expired": "انتهت جلستك",
    "access_denied": "لا تملك صلاحية الوصول",
}

UNSAFE_REDIRECTS = [
    "//evil.com",
    "https://evil.com/steal",
    "/auth",
    "/%2f%2fevil.com",
    " //evil.com",
]
SAFE_REDIRECT = "/dashboard/settings"


async def goto(page, path):
    resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=5000)
    except Exception:
        pass
    return resp


def parse_auth_url(url: str):
    u = urlparse(url)
    q = parse_qs(u.query)
    return u.path, {k: v[0] for k, v in q.items()}


async def check_admin_redirect(page, path, expected_redirect) -> dict:
    await goto(page, path)
    final_path, q = parse_auth_url(page.url)
    ok = (
        final_path == "/auth"
        and q.get("reason") == "signin_required"
        and q.get("redirect") == expected_redirect
    )
    return {"case": f"admin {path}", "url": page.url, "q": q, "ok": ok}


async def check_reason_banner(page, reason) -> dict:
    await goto(page, f"/auth?reason={reason}")
    body = (await page.locator("body").inner_text()).replace("\u200f", "")
    expected_text = REASON_BANNERS[reason]
    has_banner = expected_text in body
    # "Continue now" button is bilingual — either label counts.
    has_continue = ("متابعة الآن" in body) or ("Continue now" in body)
    ok = has_banner and has_continue
    return {
        "case": f"auth reason={reason}",
        "expected": expected_text,
        "has_banner": has_banner,
        "has_continue": has_continue,
        "ok": ok,
    }


async def check_unsafe_redirect(page, bad) -> dict:
    encoded = quote(bad, safe="")
    await goto(page, f"/auth?reason=signin_required&redirect={encoded}")
    body = (await page.locator("body").inner_text())
    # The banner hint renders "→ <safeRedirect(target)>". A rejected value
    # means the arrow hint must not contain the bad host or "/auth".
    leaked = ("evil.com" in body) or ("→ /auth" in body) or ("→  //" in body)
    # Also confirm the page didn't actually navigate off-origin.
    on_auth = urlparse(page.url).path == "/auth"
    ok = on_auth and not leaked
    return {
        "case": f"auth reject redirect={bad!r}",
        "final": page.url,
        "leaked": leaked,
        "on_auth": on_auth,
        "ok": ok,
    }


async def check_safe_redirect_hint(page) -> dict:
    encoded = quote(SAFE_REDIRECT, safe="")
    await goto(page, f"/auth?reason=signin_required&redirect={encoded}")
    body = (await page.locator("body").inner_text())
    # Hint renders as "→ /dashboard/settings" next to the button.
    ok = f"→ {SAFE_REDIRECT}" in body
    return {"case": "auth accepts safe redirect", "ok": ok, "url": page.url}


async def main() -> int:
    results: list[dict] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        for path, expected in ADMIN_CASES:
            try:
                results.append(await check_admin_redirect(page, path, expected))
            except Exception as e:  # noqa: BLE001
                results.append({"case": f"admin {path}", "ok": False, "err": str(e)[:200]})

        for reason in REASON_BANNERS:
            try:
                results.append(await check_reason_banner(page, reason))
            except Exception as e:  # noqa: BLE001
                results.append({"case": f"auth reason={reason}", "ok": False, "err": str(e)[:200]})

        for bad in UNSAFE_REDIRECTS:
            try:
                results.append(await check_unsafe_redirect(page, bad))
            except Exception as e:  # noqa: BLE001
                results.append({"case": f"unsafe {bad!r}", "ok": False, "err": str(e)[:200]})

        try:
            results.append(await check_safe_redirect_hint(page))
        except Exception as e:  # noqa: BLE001
            results.append({"case": "safe redirect hint", "ok": False, "err": str(e)[:200]})

        await page.screenshot(path=str(SHOTS / "final.png"))
        await browser.close()

    failures = [r for r in results if not r.get("ok")]
    for r in results:
        marker = "OK  " if r.get("ok") else "FAIL"
        print(f"{marker} {r['case']}  {r}")
    if failures:
        print(f"\n{len(failures)} failing case(s)")
        return 1
    print(f"\nAll {len(results)} cases passed.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
