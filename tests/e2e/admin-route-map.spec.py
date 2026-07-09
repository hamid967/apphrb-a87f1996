"""
Playwright E2E: /admin/route-map must load for a signed-in super-admin
and its three interactive affordances must work:

  1. Table renders rows (baseline count > 10).
  2. Summary "Showing X of Y" reflects the unfiltered total.
  3. Live search filters rows and updates the counter.
  4. Scope <select> narrows rows to a single scope (admin) and every
     visible badge matches that scope.
  5. The stat cards render one card per scope (public/authenticated/
     admin/api) with numeric counts.

Auth is restored the same way as admin-routes-signed-in.spec.py
(LOVABLE_BROWSER_SUPABASE_* env, or tests/.auth/admin.*.json fallback).
On signed_out sandboxes the script exits 0 with a SKIP.

Run:  python3 tests/e2e/admin-route-map.spec.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SCREENSHOTS = Path("/tmp/browser/admin-route-map")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

STORAGE_STATE_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.storage.json"
SESSION_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.session.json"
COOKIES_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.cookies.json"

results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed})
    marker = "PASS" if passed else "FAIL"
    print(f"{marker} — {name}{(' :: ' + detail) if detail else ''}")


def resolve_auth_source() -> str:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") == "injected":
        return "env"
    if STORAGE_STATE_FILE.exists() or SESSION_FILE.exists():
        return "file"
    return "none"


async def restore_session(context, page) -> None:
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    if not (storage_key and session_json) and SESSION_FILE.exists():
        session_json = SESSION_FILE.read_text()
        url = os.environ.get("VITE_SUPABASE_URL", "")
        ref = url.replace("https://", "").split(".")[0]
        storage_key = storage_key or f"sb-{ref}-auth-token"
    if not cookies_json and COOKIES_FILE.exists():
        cookies_json = COOKIES_FILE.read_text()

    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            if not c.get("domain"):
                c["url"] = BASE
        await context.add_cookies(cookies)

    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            "([k, v]) => window.localStorage.setItem(k, v)",
            [storage_key, session_json],
        )
    bypass = (
        os.environ.get("VITE_E2E_BYPASS_TOKEN")
        or os.environ.get("E2E_BYPASS_TOKEN")
    )
    if bypass:
        await page.evaluate(
            "(t) => window.sessionStorage.setItem('__admin_e2e_skip_aal2', t)",
            bypass,
        )


async def parse_counter(page) -> tuple[int, int] | None:
    """Reads the 'Showing X of Y routes' / 'يعرض X من Y مسار' line."""
    text = await page.locator("text=/Showing \\d+ of \\d+ routes|يعرض \\d+ من \\d+ مسار/").first.inner_text()
    import re
    m = re.search(r"(\d+)\D+(\d+)", text)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


async def run(page) -> None:
    # 1. Load /admin/route-map.
    await page.goto(f"{BASE}/admin/route-map", wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass
    final = page.url.replace(BASE, "")
    reached = final.startswith("/admin/route-map")
    record("navigates to /admin/route-map without redirect", reached, f"final={final}")
    if not reached:
        await page.screenshot(path=str(SCREENSHOTS / "01_redirected.png"))
        return
    await page.screenshot(path=str(SCREENSHOTS / "01_loaded.png"))

    # 2. Baseline table + counter.
    total_rows = await page.locator("table tbody tr").count()
    record("table renders route rows", total_rows >= 10, f"{total_rows} rows")

    counter = await parse_counter(page)
    if counter is None:
        record("counter 'Showing X of Y' present", False)
        return
    shown, total = counter
    record("counter matches full row count on load",
           shown == total_rows and total == total_rows,
           f"showing={shown} of={total} rows={total_rows}")

    # 3. Stat cards — expect 4 scope cards with numeric values.
    stat_values = await page.locator("div.grid > div .tabular-nums").all_inner_texts()
    numeric = [v for v in stat_values if v.strip().isdigit()]
    stat_sum = sum(int(v) for v in numeric)
    record("four scope stat cards render with numbers",
           len(numeric) == 4 and stat_sum == total,
           f"values={numeric} sum={stat_sum} total={total}")

    # 4. Live search filter.
    search = page.get_by_placeholder("Filter by path...").or_(
        page.get_by_placeholder("ابحث عن مسار...")
    ).first
    await search.fill("/admin")
    await page.wait_for_timeout(250)
    filtered_rows = await page.locator("table tbody tr").count()
    after = await parse_counter(page)
    admin_ok = (
        after is not None
        and after[0] == filtered_rows
        and 0 < filtered_rows < total_rows
    )
    record("live search '/admin' narrows the table",
           admin_ok,
           f"rows={filtered_rows} counter={after}")
    await page.screenshot(path=str(SCREENSHOTS / "02_search_admin.png"))

    # Every remaining row must contain /admin in its path cell.
    path_cells = await page.locator("table tbody tr td:first-child").all_inner_texts()
    all_match = all("/admin" in p for p in path_cells) and len(path_cells) > 0
    record("all filtered rows contain '/admin' in path",
           all_match,
           f"sample={path_cells[:3]}")

    # Clear the search for the next assertion.
    await search.fill("")
    await page.wait_for_timeout(200)

    # 5. Scope filter — pick "Admin only" / "إدارة النظام".
    await page.locator('[role="combobox"]').first.click()
    admin_option = page.get_by_role("option").filter(
        has_text="Admin only"
    ).or_(page.get_by_role("option").filter(has_text="إدارة النظام")).first
    await admin_option.click()
    await page.wait_for_timeout(250)

    scoped_rows = await page.locator("table tbody tr").count()
    scoped_counter = await parse_counter(page)
    record("scope filter reduces rows to admin subset",
           scoped_counter is not None
           and scoped_counter[0] == scoped_rows
           and 0 < scoped_rows <= total_rows,
           f"rows={scoped_rows} counter={scoped_counter}")

    # Every visible badge should read the admin label.
    badges = await page.locator("table tbody tr td:nth-child(2)").all_inner_texts()
    only_admin = all(
        ("Admin only" in b) or ("إدارة النظام" in b) for b in badges
    ) and len(badges) > 0
    record("every row badge shows the admin scope",
           only_admin,
           f"unique={sorted(set(badges))[:3]}")
    await page.screenshot(path=str(SCREENSHOTS / "03_scope_admin.png"))


async def main() -> int:
    source = resolve_auth_source()
    if source == "none":
        print("SKIP: no admin session available.")
        print("      Either sign in via the preview (LOVABLE_BROWSER_AUTH_STATUS=injected)")
        print("      or mint locally:  python3 scripts/e2e-mint-admin-session.py")
        return 0
    print(f"Using auth source: {source}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        try:
            await restore_session(context, page)
            await run(page)
        finally:
            await browser.close()

    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    print(f"\n{passed}/{total} checks passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
