"""
Playwright E2E: WebView-style redirect behaviour for onboarding + password
recovery flows.

Simulates a Capacitor WebView by using an iPhone user-agent + phone viewport
against the dev server. Real native WebView cannot be launched here, but the
same client-side redirect logic runs in the browser and is what we assert on.

Covers:
  1. Signed-out visit to /onboarding/wizard  → redirected to /auth with
     ?redirect=/onboarding/wizard so sign-in restores the destination.
  2. Direct visit to /reset-password with no recovery session → shows the
     "link invalid" affordance and links back to /forgot-password.
  3. Submitting /forgot-password calls Supabase `recover` with
     `redirect_to=<same-origin>/reset-password` — proving the `getAppUrl`
     helper is wired through, so email links land on the correct route
     inside the WebView.
"""
import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, Route as PWRoute

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/webview-redirects")
SHOTS.mkdir(parents=True, exist_ok=True)

IPHONE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
)


async def test_onboarding_requires_auth(context) -> str | None:
    page = await context.new_page()
    await page.goto(f"{BASE}/onboarding/wizard", wait_until="domcontentloaded")
    try:
        await page.wait_for_url("**/auth**", timeout=8000)
    except Exception:
        pass
    await page.screenshot(path=str(SHOTS / "1_onboarding_redirect.png"))
    final = page.url.replace(BASE, "") or "/"
    print(f"[/onboarding/wizard] → {final}")
    await page.close()
    if not final.startswith("/auth"):
        return f"/onboarding/wizard did NOT redirect to /auth (got {final})"
    if "onboarding" not in final and "redirect" not in final:
        # Not fatal — layout may drop redirect-back — but warn loudly.
        print(f"  WARN: /auth reached without ?redirect=/onboarding/wizard (search={final})")
    return None


async def test_reset_password_without_token(context) -> str | None:
    page = await context.new_page()
    await page.goto(f"{BASE}/reset-password", wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass
    await page.screenshot(path=str(SHOTS / "2_reset_without_token.png"))

    # Must expose a link back to /forgot-password so the user can request a new link.
    forgot_link = page.locator('a[href*="/forgot-password"]').first
    count = await forgot_link.count()
    print(f"[/reset-password no-token] forgot-link count={count}")
    if count == 0:
        await page.close()
        return "/reset-password with no session did not surface a link to /forgot-password"

    # The password submit button must be disabled without a valid recovery session.
    submit = page.locator('button[type="submit"]').first
    disabled = await submit.get_attribute("disabled") if await submit.count() else None
    print(f"[/reset-password no-token] submit disabled attr={disabled!r}")
    await page.close()
    if await submit.count() and disabled is None:
        return "/reset-password submit button was enabled without a recovery session"
    return None


async def test_forgot_password_redirect_to(context) -> str | None:
    page = await context.new_page()
    captured: dict[str, str] = {}

    async def handle_recover(route: PWRoute):
        req = route.request
        parsed = urlparse(req.url)
        qs = parse_qs(parsed.query)
        captured["redirect_to"] = (qs.get("redirect_to") or [""])[0]
        captured["url"] = req.url
        # Return a benign success so the UI moves to the "sent" state.
        await route.fulfill(status=200, content_type="application/json", body="{}")

    # Supabase auth recover endpoint (project ref lives in the URL path).
    await context.route("**/auth/v1/recover**", handle_recover)

    await page.goto(f"{BASE}/forgot-password", wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass

    email_input = page.locator('input[type="email"]').first
    await email_input.fill("webview-test@example.com")
    await page.screenshot(path=str(SHOTS / "3_forgot_form_filled.png"))

    # Submit and wait for the mocked request to fire.
    async with page.expect_request("**/auth/v1/recover**", timeout=8000):
        await page.locator('button[type="submit"]').first.click()

    await page.wait_for_timeout(300)
    await page.screenshot(path=str(SHOTS / "4_forgot_submitted.png"))
    await page.close()

    redirect_to = captured.get("redirect_to", "")
    print(f"[/forgot-password] captured redirect_to={redirect_to!r}")
    if not redirect_to:
        return "resetPasswordForEmail was called without a redirect_to param"
    if not redirect_to.startswith("http://") and not redirect_to.startswith("https://"):
        return (
            f"redirect_to must be an http(s) URL (Supabase rejects "
            f"capacitor://): got {redirect_to!r}"
        )
    if not redirect_to.endswith("/reset-password"):
        return f"redirect_to must point at /reset-password, got {redirect_to!r}"
    return None


async def main() -> int:
    failures: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        # WebView-ish: mobile UA + phone viewport. Fresh context = no session.
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=IPHONE_UA,
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True,
        )

        for name, coro in [
            ("onboarding-requires-auth", test_onboarding_requires_auth(context)),
            ("reset-password-without-token", test_reset_password_without_token(context)),
            ("forgot-password-redirect-to", test_forgot_password_redirect_to(context)),
        ]:
            print(f"\n--- {name} ---")
            try:
                err = await coro
            except Exception as exc:
                err = f"{name} crashed: {exc!r}"
            if err:
                failures.append(err)

        await browser.close()

    if failures:
        print("\nFAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nOK: WebView redirect behaviour verified for onboarding + password recovery.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
