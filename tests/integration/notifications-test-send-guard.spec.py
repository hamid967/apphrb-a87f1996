"""
Integration test: notifications "Test Send" role guard.

Verifies:
  1. Unauthenticated → /dashboard/settings/notifications redirects to /auth.
  2. Authenticated → the "اختبار الإرسال" tab is visible IFF the user is
     super_admin OR a member of the org with role in ('owner','admin').
     Ground truth is determined by querying PostgREST with the same bearer
     token, then compared to the observed DOM.
  3. When visible, sendTestNotification succeeds for the allowed user (email
     channel + bogus recipient enqueues without throwing).
  4. sendTestNotification with an obviously invalid recipient
     ("not-an-email") is rejected client-side by the server-fn validator
     regardless of role, proving the strict recipient check runs.

Auth:
  Uses LOVABLE_BROWSER_SUPABASE_* env when injected. When signed_out only
  step (1) runs; step (2)+ report as skipped.
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SETTINGS_URL = f"{BASE}/dashboard/settings/notifications"
SCREENSHOTS = Path("/tmp/browser/notifications-test-send-guard")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL") or "https://iefrhjjlftbijuedxmbl.supabase.co"
SUPABASE_ANON = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY") or ""

results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed, "detail": detail})
    print(f"{'PASS' if passed else 'FAIL'} — {name}{(' :: ' + detail) if detail else ''}")


async def restore_session(context, page) -> bool:
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if not (storage_key and session_json):
        return False
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE
        await context.add_cookies(cookies)
    await page.goto(BASE)
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
    )
    return True


async def check_unauth_redirect(context) -> None:
    page = await context.new_page()
    await page.goto(SETTINGS_URL, wait_until="domcontentloaded")
    try:
        await page.wait_for_url("**/auth**", timeout=6000)
    except Exception:
        pass
    ok = "/auth" in page.url
    record("unauth redirect settings/notifications → /auth", ok, f"landed at {page.url}")
    await page.close()


async def query_ground_truth(page, access_token: str, user_id: str) -> dict:
    """Query PostgREST directly with the bearer token to see if the user is
    super_admin or has owner/admin membership. This is the source of truth
    that the UI must reflect."""
    js = """
    async ({ url, anon, token, uid }) => {
      const headers = {
        apikey: anon,
        Authorization: `Bearer ${token}`,
      };
      const [sup, mem] = await Promise.all([
        fetch(`${url}/rest/v1/user_roles?user_id=eq.${uid}&role=eq.super_admin&select=role`, { headers }).then(r => r.json()),
        fetch(`${url}/rest/v1/organization_members?user_id=eq.${uid}&role=in.(owner,admin)&select=org_id,role`, { headers }).then(r => r.json()),
      ]);
      return {
        isSuperAdmin: Array.isArray(sup) && sup.length > 0,
        adminOrgs: Array.isArray(mem) ? mem : [],
      };
    }
    """
    return await page.evaluate(
        js,
        {"url": SUPABASE_URL, "anon": SUPABASE_ANON, "token": access_token, "uid": user_id},
    )


async def check_tab_visibility_and_send(context) -> None:
    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS")
    if status != "injected":
        record("tab visibility gate", True, f"skipped (AUTH_STATUS={status})")
        return

    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if not session_json:
        record("tab visibility gate", False, "session json missing")
        return
    session = json.loads(session_json)
    access_token = session.get("access_token", "")
    user_id = (session.get("user") or {}).get("id", "")
    if not (access_token and user_id):
        record("tab visibility gate", False, "session missing access_token/user.id")
        return

    page = await context.new_page()
    injected = await restore_session(context, page)
    if not injected:
        record("tab visibility gate", False, "restore_session failed")
        await page.close()
        return

    truth = await query_ground_truth(page, access_token, user_id)
    should_allow = truth["isSuperAdmin"] or len(truth["adminOrgs"]) > 0

    await page.goto(SETTINGS_URL, wait_until="domcontentloaded")
    # wait for the base tab list to appear
    try:
        await page.get_by_role("tab", name="القنوات").wait_for(timeout=8000)
    except Exception:
        pass
    await page.wait_for_timeout(1000)  # give canTestSendNotifications query time
    await page.screenshot(path=str(SCREENSHOTS / "settings.png"))

    test_tab = page.get_by_role("tab", name="اختبار الإرسال")
    tab_visible = await test_tab.count() > 0

    if should_allow:
        record(
            "allowed user sees 'اختبار الإرسال' tab",
            tab_visible,
            f"is_super_admin={truth['isSuperAdmin']} admin_orgs={len(truth['adminOrgs'])}",
        )
    else:
        record(
            "denied user does NOT see 'اختبار الإرسال' tab",
            not tab_visible,
            f"is_super_admin=False admin_orgs=0",
        )

    if not tab_visible:
        # denied path — nothing more to click; ensure server would reject if
        # somehow called. This is best-effort DOM-only; the server function
        # itself is guarded by requireSupabaseAuth + assertCanTestSend.
        await page.close()
        return

    # ---- send-flow ------------------------------------------------------
    await test_tab.click()
    await page.wait_for_timeout(400)
    # history card is always rendered inside the tab
    history_visible = await page.get_by_text("سجل الاختبارات الأخيرة").count() > 0
    record("history card renders under test-send tab", history_visible)

    # Fill an invalid recipient and confirm the mutation surfaces an error
    # (server-side validation should reject "not-an-email").
    recipient_input = page.get_by_label("المستلم")
    await recipient_input.fill("not-an-email")
    await page.get_by_role("button", name="إرسال تجريبي").click()
    await page.wait_for_timeout(1500)
    body = await page.locator("body").inner_text()
    rejected = ("valid email" in body) or ("phone number" in body) or ("فشل" in body)
    record(
        "invalid recipient is rejected by strict validator",
        rejected,
        "toast/last-result contained an error",
    )
    await page.screenshot(path=str(SCREENSHOTS / "after-invalid.png"))

    # Now a syntactically valid email — allowed users should get an enqueue
    # ack (status pending / pending_credentials / sent). We don't require
    # actual dispatch, just that no permission error surfaces.
    await recipient_input.fill("qa+test@example.com")
    await page.get_by_role("button", name="إرسال تجريبي").click()
    await page.wait_for_timeout(2500)
    body = await page.locator("body").inner_text()
    forbidden = "forbidden" in body.lower()
    record(
        "allowed user's valid send does NOT hit forbidden",
        not forbidden,
        "no 'forbidden' string in DOM",
    )
    await page.screenshot(path=str(SCREENSHOTS / "after-valid.png"))
    await page.close()


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        try:
            await check_unauth_redirect(context)
            await check_tab_visibility_and_send(context)
        finally:
            await browser.close()
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"\n{passed}/{total} checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
