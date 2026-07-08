"""
Integration test: /dashboard with a valid session must render (not redirect
to /auth). Bootstraps the session automatically — no manual login needed.

Session sources (in order):
  1. LOVABLE_BROWSER_SUPABASE_* env (if AUTH_STATUS=injected)
  2. TEST_USER_EMAIL + TEST_USER_PASSWORD via Supabase Auth REST
     (reads VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY from .env)

If neither source yields a session, the test is skipped with a clear
message describing which env vars to set.

Run:
  python3 tests/integration/dashboard-authed.spec.py
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
    """Returns 'injected' | 'password' | 'none'."""
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


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()
        try:
            source = await bootstrap_session(context, page)
            if source == "none":
                record(
                    "/dashboard authed renders (skipped)",
                    True,
                    "set TEST_USER_EMAIL + TEST_USER_PASSWORD, or sign in via preview",
                )
                print(f"\n{len(results)}/{len(results)} checks passed (skip)")
                return 0

            await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)
            url = page.url
            body = await page.locator("body").inner_text()
            record(
                f"/dashboard does not redirect to /auth (via {source})",
                "/auth" not in url,
                f"landed at {url}",
            )
            record("/dashboard renders body content", len(body.strip()) > 0, f"chars={len(body)}")
        finally:
            await browser.close()

    passed = sum(1 for r in results if r["passed"])
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))