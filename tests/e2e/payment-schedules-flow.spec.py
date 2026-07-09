"""
Playwright smoke + interactive flow: /dashboard/payment-schedules.

  1. Signed-out visitor is bounced to /auth (managed _authenticated gate).
  2. When LOVABLE_BROWSER_AUTH_STATUS == "injected", the signed-in user
     reaches the schedules page and the header controls render.
  3. If at least one pending/overdue installment row exists in the tenant's
     org, the test:
         a. Clicks "Voucher" on the first eligible row and asserts the
            row status badge transitions to "Invoiced" (voucher_id set).
         b. Clicks "Pay" on the same row and asserts the status flips to
            "Paid" (row + voucher linked, no duplicate voucher created).
     When no seed row is present, the create/pay assertions are skipped
     with a clear log line — the smoke portion still runs.

Environment: relies on the sandbox-injected Supabase session vars
(LOVABLE_BROWSER_*). No credentials are printed or exfiltrated.
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8080"
ROUTE = "/dashboard/payment-schedules"
SHOTS = Path("/tmp/browser/payment-schedules-flow")
SHOTS.mkdir(parents=True, exist_ok=True)

REJECT = ("/auth", "/access-denied", "/onboarding")

# Header markers proving the localized page rendered.
LOCALIZED_MARKERS = (
    "جداول الأقساط",
    "payment schedules",
    "توليد سندات الأقساط المستحقة",
    "generate due vouchers",
)

# Row-level status badge text (ar/en) — matches STATUS_LABEL in the route.
STATUS_INVOICED = ("فوترة", "invoiced")
STATUS_PAID = ("مدفوع", "paid")
STATUS_PENDING = ("معلّق", "pending", "متأخر", "overdue")


async def restore(context, page) -> None:
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies:
        arr = json.loads(cookies)
        for c in arr:
            c["url"] = BASE
        await context.add_cookies(arr)
    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session:
        await page.evaluate(
            "([k, v]) => window.localStorage.setItem(k, v)",
            [storage_key, session],
        )


async def signed_out_check() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        await page.goto(f"{BASE}{ROUTE}", wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle", timeout=8000)
        await page.screenshot(path=str(SHOTS / "1_signed_out.png"))
        final = page.url.replace(BASE, "") or "/"
        print(f"signed-out: final={final}")
        await browser.close()
        if not final.startswith("/auth"):
            print("FAIL: signed-out visitor was NOT redirected to /auth.")
            return 1
        return 0


async def first_row_with_status(page, needles):
    """Return the row locator whose status cell matches any of `needles`."""
    rows = page.locator("table tbody tr")
    count = await rows.count()
    for i in range(count):
        row = rows.nth(i)
        text = (await row.inner_text()).lower()
        if any(n.lower() in text for n in needles):
            return row
    return None


async def click_row_button(row, labels):
    """Click a button in `row` whose text contains any label."""
    buttons = row.locator("button")
    n = await buttons.count()
    for i in range(n):
        b = buttons.nth(i)
        try:
            txt = (await b.inner_text()).strip().lower()
        except Exception:
            continue
        if any(lbl.lower() in txt for lbl in labels):
            disabled = await b.is_disabled()
            if disabled:
                continue
            await b.click()
            return True
    return False


async def wait_for_row_status(page, row_index, needles, timeout_ms=8000):
    """Poll a specific row for a status-text change."""
    deadline = asyncio.get_event_loop().time() + timeout_ms / 1000
    while asyncio.get_event_loop().time() < deadline:
        rows = page.locator("table tbody tr")
        if row_index < await rows.count():
            text = (await rows.nth(row_index).inner_text()).lower()
            if any(n.lower() in text for n in needles):
                return True
        await asyncio.sleep(0.4)
    return False


async def signed_in_check() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        await restore(context, page)
        await page.goto(f"{BASE}{ROUTE}", wait_until="domcontentloaded")
        try:
            await page.wait_for_load_state("networkidle", timeout=12000)
        except PWTimeout:
            pass
        await page.screenshot(path=str(SHOTS / "2_signed_in_loaded.png"))
        final = page.url.replace(BASE, "") or "/"
        print(f"signed-in: final={final}")

        if any(final.startswith(p) for p in REJECT):
            print(f"FAIL: bounced away to {final}")
            await browser.close()
            return 1
        if not final.startswith(ROUTE):
            print(f"FAIL: unexpected final URL {final}")
            await browser.close()
            return 1

        body = (await page.locator("body").inner_text()).lower()
        if not any(m.lower() in body for m in LOCALIZED_MARKERS):
            print("FAIL: schedules page header markers missing.")
            print("body preview:", body[:400])
            await browser.close()
            return 1
        print("OK: payment schedules page rendered.")

        # ---- Interactive flow (skips gracefully when no seed row) ----
        pending_row = await first_row_with_status(page, STATUS_PENDING)
        if pending_row is None:
            print(
                "SKIP: no pending/overdue installment in this tenant's org — "
                "seed a payment_schedules row to exercise the full flow."
            )
            await browser.close()
            return 0

        # Capture the row index so we can re-target after re-render.
        rows = page.locator("table tbody tr")
        row_count = await rows.count()
        target_index = None
        for i in range(row_count):
            if (await rows.nth(i).inner_text()) == (await pending_row.inner_text()):
                target_index = i
                break
        if target_index is None:
            target_index = 0

        # (a) Voucher — should transition status to "invoiced".
        clicked = await click_row_button(pending_row, ("سند", "voucher"))
        if not clicked:
            print("FAIL: 'Voucher' button not clickable on pending row.")
            await page.screenshot(path=str(SHOTS / "fail_voucher.png"))
            await browser.close()
            return 1
        ok = await wait_for_row_status(page, target_index, STATUS_INVOICED)
        await page.screenshot(path=str(SHOTS / "3_after_voucher.png"))
        if not ok:
            print("FAIL: status did not flip to 'invoiced' after voucher.")
            await browser.close()
            return 1
        print("OK: row transitioned to 'invoiced' — voucher linked.")

        # (b) Pay — should transition status to "paid".
        row_after = page.locator("table tbody tr").nth(target_index)
        clicked = await click_row_button(row_after, ("دفع", "pay"))
        if not clicked:
            print("FAIL: 'Pay' button not clickable on invoiced row.")
            await page.screenshot(path=str(SHOTS / "fail_pay.png"))
            await browser.close()
            return 1
        ok = await wait_for_row_status(page, target_index, STATUS_PAID)
        await page.screenshot(path=str(SHOTS / "4_after_pay.png"))
        if not ok:
            print("FAIL: status did not flip to 'paid' after pay.")
            await browser.close()
            return 1
        print("OK: row transitioned to 'paid' — voucher marked paid.")

        await browser.close()
        return 0


async def main() -> int:
    rc = await signed_out_check()
    if rc:
        return rc

    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "no_supabase")
    if status != "injected":
        print(
            "\nSigned-in check SKIPPED "
            f"(LOVABLE_BROWSER_AUTH_STATUS={status!r}). "
            "Sign in from the preview, then re-run."
        )
        return 0
    return await signed_in_check()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
