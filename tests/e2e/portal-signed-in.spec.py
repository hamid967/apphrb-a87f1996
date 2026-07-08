"""
Playwright: full signed-in coverage for the tenant and owner portals.

Unlike the *-redirects and *-maintenance specs which cover the signed-out
path, this spec actually creates test users, signs in as each, and verifies
that the protected pages render — the "real CI coverage" the ai/user asked
for.

Flow:
  1. POST /api/public/test-seed-portal-users with TEST_SEED_TOKEN
     to receive fixed credentials + a seeded org / contract / statement.
  2. Playwright signs in as the tenant → hits /tenant/portal, asserts we
     stayed off /auth.
  3. Repeats for the owner on /owner/portal and
     /owner/portal/statements/<seeded statement id>.

Skips (exit 0) only when TEST_SEED_TOKEN is not present in the sandbox env.
CI must set that secret for the spec to actually run.
"""
import asyncio
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/portal-signed-in")
SHOTS.mkdir(parents=True, exist_ok=True)


def _load_env_file() -> dict:
    env = {}
    for p in (Path(".env"), Path(".env.local")):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


_ENV = _load_env_file()
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL") or _ENV.get("VITE_SUPABASE_URL")
SUPABASE_KEY = (
    os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    or _ENV.get("VITE_SUPABASE_PUBLISHABLE_KEY")
)
SUPABASE_PROJECT_ID = (
    os.environ.get("VITE_SUPABASE_PROJECT_ID")
    or _ENV.get("VITE_SUPABASE_PROJECT_ID")
    or (SUPABASE_URL.split("//", 1)[-1].split(".", 1)[0] if SUPABASE_URL else "")
)


def seed_via_endpoint(token: str) -> dict:
    req = urllib.request.Request(
        f"{BASE}/api/public/test-seed-portal-users",
        method="POST",
        headers={"x-test-seed-token": token, "content-type": "application/json"},
        data=b"{}",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"seed failed: {payload}")
    return payload


async def sign_in(page, email: str, password: str) -> None:
    """Sign in via Supabase Auth REST + localStorage injection.

    Bypasses the /auth form and any Turnstile / rate-limit friction so the
    protected-portal coverage is deterministic in CI. The supabase-js client
    reads `sb-<projectRef>-auth-token` on next mount and picks up the
    session automatically.
    """
    if not (SUPABASE_URL and SUPABASE_KEY and SUPABASE_PROJECT_ID):
        raise RuntimeError("VITE_SUPABASE_URL / _PUBLISHABLE_KEY missing from env")
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    result = await page.evaluate(
        """async ({ url, key, projectRef, email, password }) => {
          const res = await fetch(url + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: key,
              Authorization: 'Bearer ' + key,
            },
            body: JSON.stringify({ email, password }),
          });
          const body = await res.json();
          if (!res.ok || !body.access_token) {
            return { ok: false, status: res.status, body };
          }
          const storageKey = 'sb-' + projectRef + '-auth-token';
          window.localStorage.setItem(storageKey, JSON.stringify(body));
          return { ok: true, userId: body.user && body.user.id };
        }""",
        {
            "url": SUPABASE_URL,
            "key": SUPABASE_KEY,
            "projectRef": SUPABASE_PROJECT_ID,
            "email": email,
            "password": password,
        },
    )
    if not result.get("ok"):
        raise PWTimeout(f"password-grant failed for {email}: {result}")
    print(f"[diag] {email} signed in via REST, user={result.get('userId')}", file=sys.stderr, flush=True)


async def verify_portal(page, path: str, slug: str) -> str | None:
    resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=10000)
    await page.screenshot(path=str(SHOTS / f"{slug}.png"))
    if "/auth" in page.url:
        return f"{slug}: unexpectedly bounced to /auth (url={page.url})"
    status = resp.status if resp else 0
    if status >= 500:
        return f"{slug}: server error {status}"
    return None


async def run(seed: dict) -> list[str]:
    creds = seed["credentials"]
    seed_ids = seed["seed"]
    statement_id = seed_ids.get("statement_id")
    if not statement_id:
        return ["seed response missing statement_id"]

    errors: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            # --- Tenant ---
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            try:
                await sign_in(page, creds["tenant"]["email"], creds["tenant"]["password"])
            except PWTimeout:
                await page.screenshot(path=str(SHOTS / "tenant_signin_fail.png"))
                errors.append(f"tenant sign-in did not redirect off /auth (url={page.url})")
            else:
                err = await verify_portal(page, "/tenant/portal", "tenant_portal_index")
                if err: errors.append(err)
            await ctx.close()

            # --- Owner ---
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            try:
                await sign_in(page, creds["owner"]["email"], creds["owner"]["password"])
            except PWTimeout:
                await page.screenshot(path=str(SHOTS / "owner_signin_fail.png"))
                errors.append(f"owner sign-in did not redirect off /auth (url={page.url})")
            else:
                err = await verify_portal(page, "/owner/portal", "owner_portal_index")
                if err: errors.append(err)
                err = await verify_portal(
                    page,
                    f"/owner/portal/statements/{statement_id}",
                    "owner_portal_statement_detail",
                )
                if err: errors.append(err)
            await ctx.close()
        finally:
            await browser.close()
    return errors


def main() -> int:
    token = os.environ.get("TEST_SEED_TOKEN")
    if not token:
        print("SKIP: TEST_SEED_TOKEN not set; signed-in portal spec cannot run.")
        return 0
    try:
        seed = seed_via_endpoint(token)
    except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError) as e:
        print(f"FAIL: seed endpoint error: {e}", file=sys.stderr)
        return 1
    print(f"seeded: {json.dumps(seed['seed'])}")
    errors = asyncio.run(run(seed))
    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print("OK: signed-in tenant + owner portals render without redirect")
    return 0


if __name__ == "__main__":
    sys.exit(main())