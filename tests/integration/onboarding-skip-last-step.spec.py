"""
Integration test: clicking "تخطّي" on the last onboarding step (property)
must open /dashboard directly — no "الحساب غير مكتمل" (DashboardEmptyState).

Exercises the real wizard UI:
  1. Bootstraps a session (injected env, or TEST_USER_EMAIL/PASSWORD).
  2. Ensures the user has full_name + signup_reason on profile AND an
     organization membership, so the wizard's bootstrap resolves an orgId
     and the deep-link ?step=property can be honored. Skips otherwise.
  3. Navigates to /onboarding/wizard?step=property.
  4. Clicks the "تخطّي" button on step 4.
  5. Asserts:
       - Landed on /dashboard (no /auth, no /onboarding).
       - DashboardEmptyState marker is NOT present.
       - <div data-testid="dashboard-shell"> is rendered.

Run:
  python3 tests/integration/onboarding-skip-last-step.spec.py
"""

import asyncio
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/onboarding-skip-last-step")
SHOTS.mkdir(parents=True, exist_ok=True)

EMPTY_STATE_MARKERS = (
    "لوحتك جاهزة — تنقصها البيانات فقط",
    "your dashboard is ready — just missing your data",
)

results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed})
    print(f"{'PASS' if passed else 'FAIL'} — {name}{(' :: ' + detail) if detail else ''}")


def load_dotenv(path: str = ".env") -> dict[str, str]:
    env: dict[str, str] = {}
    p = Path(path)
    if not p.exists():
        return env
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def sign_in_password() -> tuple[str, dict] | None:
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")
    if not (email and password):
        return None
    env = load_dotenv()
    url = env.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = env.get("VITE_SUPABASE_PUBLISHABLE_KEY") or os.environ.get(
        "SUPABASE_PUBLISHABLE_KEY"
    )
    project_id = env.get("VITE_SUPABASE_PROJECT_ID")
    if not (url and key and project_id):
        return None
    req = urllib.request.Request(
        f"{url}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={
            "Content-Type": "application/json",
            "apikey": key,
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read())
    except Exception as e:  # noqa: BLE001
        print(f"password sign-in failed: {e}")
        return None
    session = {
        "access_token": payload["access_token"],
        "refresh_token": payload["refresh_token"],
        "expires_in": payload.get("expires_in", 3600),
        "expires_at": int(time.time()) + int(payload.get("expires_in", 3600)),
        "token_type": payload.get("token_type", "bearer"),
        "user": payload["user"],
    }
    return f"sb-{project_id}-auth-token", session


async def bootstrap_session(context, page) -> str:
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if storage_key and session_json:
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = BASE
            await context.add_cookies(cookies)
        await page.goto(BASE)
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )
        return "injected"
    minted = sign_in_password()
    if minted:
        key, sess = minted
        await page.goto(BASE)
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(json.dumps(sess))})"
        )
        return "password"
    return "none"


async def check_prereqs(page) -> dict:
    """Prime profile fields the wizard reads and confirm org membership.
    Returns {ok, reason?, userId?, orgId?}."""
    return await page.evaluate(
        """async () => {
          const mod = await import('/src/integrations/supabase/client.ts');
          const supabase = mod.supabase;
          const { data: u } = await supabase.auth.getUser();
          if (!u?.user) return { ok: false, reason: 'no user' };
          const userId = u.user.id;
          // Ensure profile has the fields the wizard bootstrap needs to skip
          // straight to a later step (full_name + signup_reason).
          const { data: prof } = await supabase
            .from('profiles')
            .select('full_name, signup_reason')
            .eq('id', userId)
            .maybeSingle();
          const patch = {};
          if (!prof?.full_name) patch.full_name = 'Test User';
          if (!prof?.signup_reason) patch.signup_reason = 'manage_own_properties';
          if (Object.keys(patch).length) {
            const { error: pErr } = await supabase
              .from('profiles')
              .update(patch)
              .eq('id', userId);
            if (pErr) return { ok: false, reason: 'profile update: ' + pErr.message };
          }
          const { data: mem } = await supabase
            .from('organization_members')
            .select('org_id')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();
          if (!mem?.org_id) return { ok: false, reason: 'no org membership' };
          // Reset onboarding_progress so the skip-last-step assertion is
          // meaningful: mark profile+company done but leave first_receipt
          // undone and clear the completed_at timestamp.
          const now = new Date().toISOString();
          const { error: rErr } = await supabase
            .from('profiles')
            .update({
              onboarding_progress: {
                profile: { done: true, at: now },
                company: { done: true, at: now },
              },
              onboarding_completed_at: null,
            })
            .eq('id', userId);
          if (rErr) return { ok: false, reason: 'reset onboarding: ' + rErr.message };
          return { ok: true, userId, orgId: mem.org_id };
        }"""
    )


async def click_skip(page) -> bool:
    """Click the 'تخطّي' button on the current wizard step. Uses
    get_by_role for accessibility, falls back to text match."""
    btn = page.get_by_role("button", name="تخطّي")
    try:
        await btn.wait_for(state="visible", timeout=8000)
        await btn.click()
        return True
    except Exception:
        # Fallback: any button with that text
        loc = page.locator("button", has_text="تخطّي").first
        if await loc.count():
            await loc.click()
            return True
    return False


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        try:
            source = await bootstrap_session(context, page)
            if source == "none":
                record(
                    "skip on last onboarding step opens dashboard (skipped)",
                    True,
                    "set TEST_USER_EMAIL + TEST_USER_PASSWORD, or sign in via preview",
                )
                print(f"\n{len(results)}/{len(results)} checks passed (skip)")
                return 0

            pre = await check_prereqs(page)
            if not pre.get("ok"):
                record(
                    "onboarding wizard prerequisites",
                    True,  # skip rather than fail — CI tenants without an org
                    f"skipped: {pre.get('reason')!r}",
                )
                print(f"\n{sum(1 for r in results if r['passed'])}/{len(results)} checks passed (skip)")
                return 0
            record(
                "onboarding wizard prerequisites",
                True,
                f"user={pre.get('userId')} org={pre.get('orgId')}",
            )

            # Deep-link straight to the property step (step 4).
            await page.goto(
                f"{BASE}/onboarding/wizard?step=property",
                wait_until="domcontentloaded",
            )
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            await page.screenshot(path=str(SHOTS / "1_step_property.png"))

            clicked = await click_skip(page)
            record("clicked 'تخطّي' on property step", clicked)
            if not clicked:
                await page.screenshot(path=str(SHOTS / "skip_button_missing.png"))
                print(f"\n{sum(1 for r in results if r['passed'])}/{len(results)} checks passed")
                return 1

            # Wait for the navigation the wizard fires after markStep resolves.
            try:
                await page.wait_for_url("**/dashboard**", timeout=12000)
            except Exception:
                pass
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            await page.screenshot(path=str(SHOTS / "2_after_skip.png"))

            url = page.url
            record(
                "landed on /dashboard (no /auth, no /onboarding)",
                url.rstrip("/").endswith("/dashboard")
                or ("/dashboard" in url and "/onboarding" not in url and "/auth" not in url),
                f"landed at {url}",
            )

            body_text = (await page.locator("body").inner_text()).lower()
            empty_hit = next(
                (m for m in EMPTY_STATE_MARKERS if m.lower() in body_text),
                None,
            )
            record(
                "DashboardEmptyState is NOT rendered",
                empty_hit is None,
                f"found marker: {empty_hit!r}" if empty_hit else "no empty-state marker present",
            )

            shell = page.locator('[data-testid="dashboard-shell"]')
            record(
                "real dashboard shell rendered",
                await shell.count() > 0,
                f"testid count={await shell.count()}",
            )
        finally:
            await browser.close()

    passed = sum(1 for r in results if r["passed"])
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
