"""
Integration test: an expired /portal-invite/<token> invitation must
  - render the expiry message (`portalInvite.expired` — "The invitation has expired.")
  - NOT render the Accept button (so the user cannot accept it)
  - never call the `acceptPortalInvitation` server fn
  - never navigate the user into /portal or /portal/owner from the invite page

Guarded by `expired = new Date(invite.expires_at).getTime() < Date.now()`
in src/routes/portal-invite.$token.tsx.

Run:
  python3 tests/integration/portal-invite-expired.spec.py
"""

import asyncio
import base64
import json
import re
import sys
from playwright.async_api import async_playwright, BrowserContext, Page, Route

BASE = "http://localhost:8080"
PROJECT_REF = "iefrhjjlftbijuedxmbl"
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"
TOKEN = "expired-token-abcdef"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000099"
FAKE_ORG_ID  = "00000000-0000-0000-0000-0000000000bb"
EXPIRED_TEXT_EN = "The invitation has expired."
EXPIRED_TEXT_AR = "انتهت"  # matches "انتهت صلاحية الدعوة" AR variants
results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed})
    print(f"{'PASS' if passed else 'FAIL'} — {name}{(' :: ' + detail) if detail else ''}")


# ---------- static checks --------------------------------------------------

def check_static() -> None:
    src = open("src/routes/portal-invite.$token.tsx", "r", encoding="utf-8").read()
    record("route computes `expired` from expires_at",
           "new Date(invite.expires_at).getTime() < Date.now()" in src)
    record("expired branch renders portalInvite.expired message",
           't("portalInvite.expired")' in src)
    record("Accept button is gated behind `!used && !expired && !emailMismatch`",
           "!used && !expired && !emailMismatch" in src)


# ---------- helpers --------------------------------------------------------

def fake_user(email: str) -> dict:
    return {
        "id": FAKE_USER_ID, "aud": "authenticated", "role": "authenticated",
        "email": email, "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": {}, "identities": [], "created_at": "2026-01-01T00:00:00Z",
    }


def fake_session(email: str) -> dict:
    return {
        "access_token": "fake.access.token", "refresh_token": "fake-refresh",
        "expires_in": 3600, "expires_at": 9999999999, "token_type": "bearer",
        "user": fake_user(email),
    }


def decode_fn_url(url: str) -> dict | None:
    marker = "/_serverFn/"
    idx = url.find(marker)
    if idx < 0:
        return None
    seg = url[idx + len(marker):].split("?", 1)[0].split("/", 1)[0]
    seg += "=" * (-len(seg) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(seg).decode("utf-8"))
    except Exception:
        return None


async def install_mocks(page: Page, invite: dict, calls: dict) -> None:
    async def handle(route: Route) -> None:
        req = route.request
        url = req.url

        if url.endswith("/sw.js") or url.endswith("/service-worker.js"):
            await route.fulfill(status=404, body=""); return

        if "/auth/v1/user" in url:
            await route.fulfill(status=200, content_type="application/json",
                                body=json.dumps(fake_user(invite["email"]))); return

        if "/auth/v1/token" in url and req.method == "POST":
            await route.fulfill(status=200, content_type="application/json",
                                body=json.dumps(fake_session(invite["email"]))); return

        if "/_serverFn/" in url:
            meta = decode_fn_url(url) or {}
            export = str(meta.get("export", ""))
            if export.startswith("getPortalInvitationByToken"):
                calls["get"] = calls.get("get", 0) + 1
                await route.fulfill(status=200, content_type="application/json",
                                    body=json.dumps({"result": invite})); return
            if export.startswith("acceptPortalInvitation"):
                # MUST NOT be called for an expired invite.
                calls["accept"] = calls.get("accept", 0) + 1
                await route.fulfill(status=200, content_type="application/json",
                                    body=json.dumps({"result": {"orgId": FAKE_ORG_ID}})); return
            await route.fulfill(status=200, content_type="application/json",
                                body='{"result": null}'); return

        await route.continue_()

    await page.route("**/*", handle)


async def seed_session(page: Page, email: str) -> None:
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    await page.evaluate(
        "({ k, v }) => window.localStorage.setItem(k, v)",
        {"k": STORAGE_KEY, "v": json.dumps(fake_session(email))},
    )
    await page.evaluate(
        "async () => {"
        " if (navigator.serviceWorker) {"
        "   const regs = await navigator.serviceWorker.getRegistrations();"
        "   await Promise.all(regs.map(r => r.unregister()));"
        " }"
        " if (window.caches) {"
        "   const keys = await caches.keys();"
        "   await Promise.all(keys.map(k => caches.delete(k)));"
        " }"
        "}"
    )


# ---------- runtime cases --------------------------------------------------

async def run_role(browser, label: str, kind: str, expected_blocked_path: str) -> None:
    ctx: BrowserContext = await browser.new_context(viewport={"width": 1280, "height": 900})
    email = f"portal-{label}-expired@example.com"
    # expires_at strictly in the past
    invite = {
        "id": "44444444-4444-4444-4444-444444444444",
        "org_id": FAKE_ORG_ID, "org_name": "Test Org", "kind": kind,
        "tenant_id": "22222222-2222-2222-2222-222222222222" if kind == "tenant" else None,
        "owner_id":  "33333333-3333-3333-3333-333333333333" if kind == "owner"  else None,
        "email": email,
        "expires_at": "2020-01-01T00:00:00Z",
        "accepted_at": None,
    }
    calls: dict = {}
    try:
        page = await ctx.new_page()
        await install_mocks(page, invite, calls)
        await seed_session(page, email)

        await page.goto(f"{BASE}/portal-invite/{TOKEN}", wait_until="domcontentloaded")

        # Wait until the invite payload is applied by looking for the org name
        # (rendered by the `invite &&` branch in AcceptPage).
        try:
            await page.wait_for_selector(f"text={invite['org_name']}", timeout=12000, state="visible")
            rendered = True
        except Exception:
            rendered = False
        record(f"{label}: invite card rendered", rendered, f"url={page.url}")

        # Expiry message must be visible.
        body_text = await page.evaluate("() => document.body.innerText || ''")
        expired_shown = (EXPIRED_TEXT_EN in body_text) or (EXPIRED_TEXT_AR in body_text)
        record(f"{label}: expiry message visible", expired_shown,
               f"snippet={body_text[:160]!r}")

        # Accept button must NOT render at all for expired invites.
        accept_btn = await page.query_selector(
            "button:not([disabled]):has-text('قبول'), "
            "button:not([disabled]):has-text('Accept')"
        )
        record(f"{label}: Accept button not rendered for expired invite",
               accept_btn is None)

        # Give any stray navigation a chance to happen.
        await page.wait_for_timeout(1500)

        # Never navigated into /portal or /portal/owner from the invite page.
        landed = page.url
        blocked = not re.match(rf"^{re.escape(BASE)}{re.escape(expected_blocked_path)}(/|\?|$)", landed)
        record(f"{label}: user not routed into {expected_blocked_path}",
               blocked, f"url={landed}")

        # acceptPortalInvitation must never have been called.
        record(f"{label}: acceptPortalInvitation never called",
               calls.get("accept", 0) == 0,
               f"accept_calls={calls.get('accept', 0)}")
    finally:
        await ctx.close()


async def check_runtime() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            await run_role(browser, "tenant", "tenant", "/portal")
            await run_role(browser, "owner",  "owner",  "/portal/owner")
        finally:
            await browser.close()


async def main() -> int:
    check_static()
    await check_runtime()
    passed = sum(1 for r in results if r["passed"])
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))