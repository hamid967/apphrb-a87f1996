"""
Integration test: portal tenant/owner sign-in must never be blocked by the
optional establishment-number gate.

Covers the client flow in src/routes/auth.tsx:

  1. establishment-number field is OPTIONAL (no `required`) — leaving it
     empty must not stop portal users from submitting.
  2. When empty, no `verify_my_establishment` RPC is invoked, so no
     forced signOut can happen (see auth.tsx :141 `if (estNo)`).
  3. Wrong establishment number rejects the session with the toast
     "رقم المنشأة غير صحيح…" and the user stays on /auth.
  4. /portal-invite/<token> renders without crashing so a fresh invitee
     can accept a link.
  5. /portal and /owner/portal without a session redirect to /auth
     (they must not 500).

The credentialed cases (empty / correct / wrong estNo, both tenant &
owner) run only when the matching env vars are set — the sandbox has no
canonical portal accounts, so we always exercise the form-level guarantees
and opt into the end-to-end cases when the operator supplies fixtures.

Env vars:
  TEST_TENANT_EMAIL / TEST_TENANT_PASS   — required for tenant e2e
  TEST_TENANT_EST                        — matching establishment_no
  TEST_OWNER_EMAIL  / TEST_OWNER_PASS    — required for owner e2e
  TEST_OWNER_EST                         — matching establishment_no

Run:
  python3 tests/integration/portal-login.spec.py
"""

import asyncio
import os
import sys
import urllib.request
from playwright.async_api import async_playwright, Page, BrowserContext

BASE = "http://localhost:8080"
WRONG_EST = "HBS-000000"
results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed})
    print(f"{'PASS' if passed else 'FAIL'} — {name}{(' :: ' + detail) if detail else ''}")


def skip(name: str, reason: str) -> None:
    print(f"SKIP — {name} :: {reason}")


def http_status(path: str) -> int:
    req = urllib.request.Request(f"{BASE}{path}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


# ---------- form-level (no credentials required) ---------------------------

async def check_form_guarantees(ctx: BrowserContext) -> None:
    page = await ctx.new_page()
    try:
        await page.goto(f"{BASE}/auth", wait_until="domcontentloaded")
        await page.wait_for_selector("input#est_no", timeout=10000)

        state = await page.evaluate("""() => {
          const el = document.querySelector('input#est_no');
          const form = el ? el.closest('form') : null;
          return {
            found: !!el,
            required: el?.required ?? null,
            value: el?.value ?? null,
            validEmpty: el ? el.checkValidity() : null,
            formValid: form ? form.checkValidity() : null,
          };
        }""")
        record("establishment field renders on /auth", bool(state.get("found")))
        record("establishment field is NOT required",  state.get("required") is False,
               f"required={state.get('required')}")
        record("empty establishment passes HTML5 validity", state.get("validEmpty") is True,
               f"validEmpty={state.get('validEmpty')}")

        # Static assertion on the source: the gate must be behind `if (estNo)`
        try:
            with open("src/routes/auth.tsx", "r", encoding="utf-8") as f:
                src = f.read()
            has_guard = "if (estNo) {" in src and "verify_my_establishment" in src
            record("verify_my_establishment is gated by `if (estNo)`", has_guard)
        except FileNotFoundError:
            skip("verify_my_establishment gate check", "src/routes/auth.tsx not found")
    finally:
        await page.close()


# ---------- static route reachability --------------------------------------

def check_portal_invite_not_500() -> None:
    code = http_status("/portal-invite/fake-token-abc")
    record("/portal-invite/<token> is not 500", 0 < code < 500, f"status={code}")


def check_portal_ssr_not_500() -> None:
    for path in ("/portal", "/owner/portal"):
        code = http_status(path)
        record(f"SSR {path} is not 500", 0 < code < 500, f"status={code}")


async def check_portal_redirects_when_unauth(ctx: BrowserContext) -> None:
    for path in ("/portal", "/owner/portal"):
        page = await ctx.new_page()
        try:
            await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            try:
                await page.wait_for_url("**/auth**", timeout=6000)
            except Exception:
                pass
            record(f"unauth {path} redirects to /auth", "/auth" in page.url,
                   f"landed at {page.url}")
        finally:
            await page.close()


# ---------- credentialed sign-in (optional) --------------------------------

async def sign_in(page: Page, email: str, password: str, est_no: str | None) -> None:
    await page.goto(f"{BASE}/auth", wait_until="domcontentloaded")
    await page.wait_for_selector("input#email", timeout=10000)
    await page.fill("input#email", email)
    await page.fill("input#password", password)
    if est_no is not None:
        await page.fill("input#est_no", est_no)
    else:
        # clear defensively
        await page.fill("input#est_no", "")
    await page.click("button[type=submit]")


async def portal_flow(ctx: BrowserContext, label: str, email: str, password: str,
                      correct_est: str | None, portal_path: str) -> None:
    # (a) empty establishment  -> should reach portal, no forced signOut
    page = await ctx.new_page()
    try:
        await sign_in(page, email, password, est_no=None)
        # Success = we land off /auth (portal, dashboard, or root).
        landed = False
        try:
            await page.wait_for_url(lambda u: "/auth" not in u, timeout=15000)
            landed = True
        except Exception:
            pass
        record(f"{label}: empty establishment does NOT block sign-in",
               landed, f"landed at {page.url}")
    finally:
        await page.close()

    # (b) correct establishment -> reach portal
    if correct_est:
        page = await ctx.new_page()
        try:
            await sign_in(page, email, password, est_no=correct_est)
            landed = False
            try:
                await page.wait_for_url(lambda u: "/auth" not in u, timeout=15000)
                landed = True
            except Exception:
                pass
            record(f"{label}: correct establishment lets user in",
                   landed, f"landed at {page.url}")
        finally:
            await page.close()
    else:
        skip(f"{label}: correct-establishment case",
             f"set TEST_{label.upper()}_EST to enable")

    # (c) wrong establishment -> rejected, stay on /auth, toast surfaces
    page = await ctx.new_page()
    try:
        await sign_in(page, email, password, est_no=WRONG_EST)
        # We expect to remain on /auth (session revoked). Give the gate time.
        await page.wait_for_timeout(6000)
        stayed = "/auth" in page.url
        toast_text = ""
        try:
            toast = await page.wait_for_selector(
                "text=رقم المنشأة غير صحيح", timeout=5000, state="visible")
            toast_text = await toast.inner_text()
        except Exception:
            pass
        record(f"{label}: wrong establishment rejects the session",
               stayed, f"landed at {page.url}")
        record(f"{label}: wrong establishment shows rejection toast",
               "رقم المنشأة غير صحيح" in toast_text, f"toast={toast_text!r}")
    finally:
        await page.close()


# ---------- driver ---------------------------------------------------------

async def main() -> int:
    check_portal_invite_not_500()
    check_portal_ssr_not_500()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        try:
            await check_form_guarantees(ctx)
            await check_portal_redirects_when_unauth(ctx)

            tenant_email = os.environ.get("TEST_TENANT_EMAIL")
            tenant_pass  = os.environ.get("TEST_TENANT_PASS")
            tenant_est   = os.environ.get("TEST_TENANT_EST")
            if tenant_email and tenant_pass:
                await portal_flow(ctx, "tenant", tenant_email, tenant_pass,
                                  tenant_est, "/portal")
            else:
                skip("tenant e2e sign-in flow",
                     "set TEST_TENANT_EMAIL and TEST_TENANT_PASS to enable")

            owner_email = os.environ.get("TEST_OWNER_EMAIL")
            owner_pass  = os.environ.get("TEST_OWNER_PASS")
            owner_est   = os.environ.get("TEST_OWNER_EST")
            if owner_email and owner_pass:
                await portal_flow(ctx, "owner", owner_email, owner_pass,
                                  owner_est, "/owner/portal")
            else:
                skip("owner e2e sign-in flow",
                     "set TEST_OWNER_EMAIL and TEST_OWNER_PASS to enable")
        finally:
            await browser.close()

    passed = sum(1 for r in results if r["passed"])
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
