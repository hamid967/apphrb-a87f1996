"""
Integration test: accepting a /portal-invite/<token> invitation grants
portal access for both tenants and owners, lands on the correct portal
landing page, and never surfaces the wrong-establishment toast.

The invite flow lives in src/routes/portal-invite.$token.tsx:
  1. getPortalInvitationByToken({ token })  — server fn
  2. onAccept -> acceptPortalInvitation({ token }) — server fn
  3. toast.success + nav({ to: kind === "owner" ? "/portal/owner" : "/portal" })

The establishment-number gate lives on /auth (auth.tsx) and cannot be
reached from this flow, so the "رقم المنشأة غير صحيح" toast must NEVER
appear during invite acceptance.

Approach:

  - Static: assert the invite route navigates to `/portal` for tenants and
    `/portal/owner` for owners, and that neither the invite route nor the
    invite server-fn module references the est-rejection string.

  - Runtime: mock the browser-side dependencies deterministically:
      * Pre-inject a fake Supabase session into localStorage so useAuth
        reports a signed-in user (no real credentials in the sandbox).
      * Mock /auth/v1/user -> the same fake user (getUser revalidation).
      * Mock /_serverFn/<base64> by decoding the base64 URL segment and
        matching on the export name — TanStack `createServerFn` responses
        without the `x-tss-serialized` header pass through as plain JSON
        (see @tanstack/start-client-core serverFnFetcher.js), so a simple
        JSON body is enough to satisfy the client.
    Then for each role (tenant, owner):
      * Navigate to /portal-invite/<fake-token>
      * Wait for the "Accept" button, click it
      * Assert URL lands on the role's portal and the est-rejection toast
        never appeared anywhere in the flow.

Run:
  python3 tests/integration/portal-invite-accept.spec.py
"""

import asyncio
import base64
import json
import sys
from playwright.async_api import async_playwright, BrowserContext, Page, Route

BASE = "http://localhost:8080"
PROJECT_REF = "iefrhjjlftbijuedxmbl"
STORAGE_KEY = f"sb-{PROJECT_REF}-auth-token"
TOKEN = "invite-token-abcdef123456"
FAKE_USER_ID = "00000000-0000-0000-0000-000000000042"
FAKE_ORG_ID = "00000000-0000-0000-0000-0000000000aa"
EST_TOAST = "رقم المنشأة غير صحيح"
results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed})
    print(f"{'PASS' if passed else 'FAIL'} — {name}{(' :: ' + detail) if detail else ''}")


# ---------- static checks --------------------------------------------------

def check_static() -> None:
    try:
        route_src = open("src/routes/portal-invite.$token.tsx", "r", encoding="utf-8").read()
        fns_src   = open("src/lib/portal-invitations.functions.ts", "r", encoding="utf-8").read()
    except FileNotFoundError as e:
        record("invite source files exist", False, str(e))
        return

    record("invite navigates to /portal for tenants",
           '"/portal"' in route_src)
    record("invite navigates to /portal/owner for owners",
           '"/portal/owner"' in route_src)
    record("invite route does NOT reference est-rejection toast",
           EST_TOAST not in route_src)
    record("invite server-fn module does NOT reference est-rejection toast",
           EST_TOAST not in fns_src)


# ---------- helpers --------------------------------------------------------

def fake_user(email: str) -> dict:
    return {
        "id": FAKE_USER_ID,
        "aud": "authenticated",
        "role": "authenticated",
        "email": email,
        "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": {},
        "identities": [],
        "created_at": "2026-01-01T00:00:00Z",
    }


def fake_session(email: str) -> dict:
    return {
        "access_token": "fake.access.token",
        "refresh_token": "fake-refresh",
        "expires_in": 3600,
        "expires_at": 9999999999,
        "token_type": "bearer",
        "user": fake_user(email),
    }


def decode_fn_url(url: str) -> dict | None:
    """Decode the base64 segment of /_serverFn/<base64> to {file, export}."""
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


async def install_mocks(page: Page, invite: dict, seen_toast: dict) -> None:
    """Mock Supabase + TanStack server fns needed for the invite flow."""

    async def handle(route: Route) -> None:
        req = route.request
        url = req.url

        # Block service-worker registration entirely — the app's SW
        # otherwise intercepts /_serverFn/* fetches and can return a stale
        # or "offline" fallback that never resolves the invite query.
        if url.endswith("/sw.js") or url.endswith("/service-worker.js"):
            await route.fulfill(status=404, body="")
            return

        # Supabase Auth: getUser revalidation.
        if "/auth/v1/user" in url:
            await route.fulfill(
                status=200, content_type="application/json",
                body=json.dumps(fake_user(invite["email"])),
            )
            return

        # Supabase Auth: refresh_token grant (in case supabase-js refreshes).
        if "/auth/v1/token" in url and req.method == "POST":
            await route.fulfill(
                status=200, content_type="application/json",
                body=json.dumps(fake_session(invite["email"])),
            )
            return

        # TanStack server fns — match by decoded export name.
        if "/_serverFn/" in url:
            meta = decode_fn_url(url) or {}
            export = str(meta.get("export", ""))
            if export.startswith("getPortalInvitationByToken"):
                # TanStack's compiled extractedFn treats the JSON payload as
                # the middleware "context patch" — the actual return value
                # lives under `result`.
                await route.fulfill(
                    status=200, content_type="application/json",
                    body=json.dumps({"result": invite}),
                )
                return
            if export.startswith("acceptPortalInvitation"):
                await route.fulfill(
                    status=200, content_type="application/json",
                    body=json.dumps({"result": {"orgId": FAKE_ORG_ID}}),
                )
                return
            # Any other server fn used by portal layout loaders — return a
            # benign empty JSON so the page renders (errorComponent is fine
            # too; we only assert on URL + absence of the est toast).
            await route.fulfill(
                status=200, content_type="application/json", body='{"result": null}',
            )
            return

        await route.continue_()

    await page.route("**/*", handle)

    # Watch every rendered toast; if the est-rejection string ever appears
    # we fail regardless of when it fires.
    await page.expose_function("__recordEstToast", lambda text: seen_toast.__setitem__("hit", True))
    await page.add_init_script(f"""
      const target = {json.dumps(EST_TOAST)};
      const attach = () => {{
        if (!document.body) return;
        const scan = () => {{
          if (document.body.innerText.includes(target)) window.__recordEstToast(target);
        }};
        new MutationObserver(scan).observe(document.body, {{
          subtree: true, childList: true, characterData: true,
        }});
        scan();
      }};
      if (document.readyState === 'loading') {{
        document.addEventListener('DOMContentLoaded', attach, {{ once: true }});
      }} else attach();
    """)


async def seed_session(page: Page, email: str) -> None:
    """Establish localhost origin, then inject the fake Supabase session."""
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    # Playwright passes a single arg to page.evaluate — destructure it.
    await page.evaluate(
        "({ k, v }) => window.localStorage.setItem(k, v)",
        {"k": STORAGE_KEY, "v": json.dumps(fake_session(email))},
    )
    # Also drop any service-worker cache from prior sessions that might
    # serve a stale "offline" shell of /portal-invite.
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

async def run_role(browser, label: str, kind: str, expected_path: str) -> None:
    ctx: BrowserContext = await browser.new_context(
        viewport={"width": 1280, "height": 900},
    )
    email = f"portal-{label}@example.com"
    invite = {
        "id": "11111111-1111-1111-1111-111111111111",
        "org_id": FAKE_ORG_ID,
        "org_name": "Test Org",
        "kind": kind,
        "tenant_id": "22222222-2222-2222-2222-222222222222" if kind == "tenant" else None,
        "owner_id": "33333333-3333-3333-3333-333333333333" if kind == "owner" else None,
        "email": email,
        "expires_at": "2099-01-01T00:00:00Z",
        "accepted_at": None,
    }
    seen_toast = {"hit": False}
    try:
        page = await ctx.new_page()
        await install_mocks(page, invite, seen_toast)
        await seed_session(page, email)

        await page.goto(f"{BASE}/portal-invite/{TOKEN}", wait_until="domcontentloaded")
        # The invite card renders once useAuth() reports the user and the
        # (mocked) getPortalInvitationByToken resolves.
        try:
            btn = await page.wait_for_selector(
                "button:not([disabled]):has-text('قبول'), "
                "button:not([disabled]):has-text('Accept')",
                timeout=12000, state="visible",
            )
        except Exception:
            btn = None
        record(f"{label}: invite Accept button renders",
               btn is not None, f"url={page.url}")
        if not btn:
            await ctx.close()
            return

        await btn.click(force=True)

        # Post-accept: nav() replaces to expected_path. Use a strict URL
        # predicate — "**/portal**" would match the /portal-invite page too.
        import re as _re
        pattern = _re.compile(rf"^{_re.escape(BASE)}{_re.escape(expected_path)}(/|\?|$)")
        landed_ok = False
        try:
            await page.wait_for_url(lambda u: bool(pattern.match(u)), timeout=10000)
            landed_ok = True
        except Exception:
            pass
        record(f"{label}: lands on {expected_path} after accepting",
               landed_ok, f"url={page.url}")
        record(f"{label}: never routed back to /auth",
               "/auth" not in page.url, f"url={page.url}")

        # Give any late toast a chance to appear.
        await page.wait_for_timeout(1500)
        record(f"{label}: est-rejection toast never appeared during flow",
               seen_toast["hit"] is False,
               f"seen={seen_toast['hit']}")
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
