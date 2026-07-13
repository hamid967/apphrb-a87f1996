"""
Integration test: completing the last onboarding step must open /dashboard
directly — no "الحساب غير مكتمل" (DashboardEmptyState) rendering.

Simulates the wizard's final action by marking the required onboarding
steps done via the authenticated Supabase client from the browser (same
RLS path the wizard uses through setOnboardingStep). Then navigates to
/dashboard and asserts:

  1. URL is /dashboard (no redirect back to /onboarding/wizard).
  2. The DashboardEmptyState marker is NOT present (i.e. the "لوحتك
     جاهزة — تنقصها البيانات فقط" / "Your dashboard is ready — just
     missing your data" hero is absent).
  3. The real dashboard shell renders (data-testid="dashboard-shell").

Session sources (in order):
  1. LOVABLE_BROWSER_SUPABASE_* env (AUTH_STATUS=injected)
  2. TEST_USER_EMAIL + TEST_USER_PASSWORD via Supabase Auth REST

Skips (exit 0) with a clear reason when no session is available.

Run:
  python3 tests/integration/onboarding-final-step-opens-dashboard.spec.py
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
SHOTS = Path("/tmp/browser/onboarding-final-step-opens-dashboard")
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
    storage_key = f"sb-{project_id}-auth-token"
    return storage_key, session


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


async def mark_onboarding_complete(page) -> dict:
    """Mark profile+company+first_receipt done and set completed_at via
    the browser's Supabase client (RLS as the signed-in user)."""
    return await page.evaluate(
        """async () => {
          // Reuse the app's browser client so the write goes through RLS.
          const mod = await import('/src/integrations/supabase/client.ts');
          const supabase = mod.supabase;
          const { data: u } = await supabase.auth.getUser();
          if (!u?.user) return { ok: false, reason: 'no user' };
          const now = new Date().toISOString();
          const progress = {
            profile:       { done: true, at: now },
            company:       { done: true, at: now },
            first_receipt: { done: true, at: now },
          };
          const { data, error } = await supabase
            .from('profiles')
            .update({ onboarding_progress: progress, onboarding_completed_at: now })
            .eq('id', u.user.id)
            .select('onboarding_progress, onboarding_completed_at')
            .maybeSingle();
          if (error) return { ok: false, reason: error.message };
          return { ok: true, data, userId: u.user.id };
        }"""
    )


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        try:
            source = await bootstrap_session(context, page)
            if source == "none":
                record(
                    "onboarding final step opens dashboard (skipped)",
                    True,
                    "set TEST_USER_EMAIL + TEST_USER_PASSWORD, or sign in via preview",
                )
                print(f"\n{len(results)}/{len(results)} checks passed (skip)")
                return 0

            # Simulate wizard final action: mark onboarding complete via RLS.
            mark = await mark_onboarding_complete(page)
            if not mark.get("ok"):
                record(
                    "mark onboarding complete via RLS",
                    False,
                    f"reason={mark.get('reason')!r}",
                )
                await page.screenshot(path=str(SHOTS / "mark_failed.png"))
                print(f"\n{sum(1 for r in results if r['passed'])}/{len(results)} checks passed")
                return 1
            record("mark onboarding complete via RLS", True, f"user={mark.get('userId')}")

            # Navigate to /dashboard just like the wizard does after success.
            await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            await page.screenshot(path=str(SHOTS / "dashboard_after_complete.png"))

            url = page.url
            record(
                "no redirect to /auth or /onboarding",
                "/auth" not in url and "/onboarding" not in url,
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
            has_shell = await shell.count() > 0
            record(
                "real dashboard shell rendered",
                has_shell,
                f"testid count={await shell.count()}",
            )
        finally:
            await browser.close()

    passed = sum(1 for r in results if r["passed"])
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
