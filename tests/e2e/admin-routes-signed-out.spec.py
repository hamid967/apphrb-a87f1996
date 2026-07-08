"""
Playwright smoke: every /admin/*, /security/sessions, /reports/templates/*
link must be reachable in a signed-out session. Expected outcome for
authenticated routes is a redirect to /auth (not a 404, not a crash, not
a redirect into another protected page that loops).

Run with:  python3 tests/e2e/admin-routes-signed-out.spec.py
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SCREENSHOTS = Path("/tmp/browser/admin-routes-signed-out")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

ADMIN_PATHS = [
    "/admin",
    "/admin/users",
    "/admin/companies",
    "/admin/roles",
    "/admin/policies",
    "/admin/subscription-payments",
    "/admin/plans",
    "/admin/portal-invitations",
    "/admin/audit-log",
    "/admin/search-insights",
    "/admin/intro-analytics",
    "/admin/report-branding",
    "/admin/report-intro",
    "/admin/settings",
    "/admin/seed",
    "/admin/systest",
]

OTHER_PATHS = [
    "/security/sessions",
    "/security/mfa",
    "/reports/templates",
    "/reports/templates/manage",
]

ALL_PATHS = ADMIN_PATHS + OTHER_PATHS


async def check(page, path: str) -> dict:
    resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    # give the client router a tick to run any redirect() in beforeLoad
    await page.wait_for_load_state("networkidle", timeout=5000)
    status = resp.status if resp else 0
    final = page.url.replace(BASE, "") or "/"
    body_text = (await page.locator("body").inner_text())[:400].lower()
    is_404 = ("404" in body_text and "not found" in body_text) or (
        "notfound" in body_text
    )
    # Accept: redirect to /auth (expected for signed-out) OR the page renders
    # itself (e.g. /security/mfa is intentionally reachable). Reject 404s and
    # bad statuses.
    ok = (
        status < 400
        and not is_404
        and (final.startswith("/auth") or final.startswith(path))
    )
    return {
        "path": path,
        "status": status,
        "final": final,
        "is_404": is_404,
        "ok": ok,
    }


async def main() -> int:
    failures: list[dict] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        page = await context.new_page()
        for p in ALL_PATHS:
            try:
                r = await check(page, p)
            except Exception as e:  # noqa: BLE001
                r = {"path": p, "status": 0, "final": "ERR", "is_404": False,
                     "ok": False, "err": str(e)[:200]}
            marker = "OK " if r["ok"] else "FAIL"
            print(f"{marker} {r['status']:>3} {r['path']:38} -> {r['final']}"
                  + (f"  ({r.get('err','')})" if r.get("err") else ""))
            if not r["ok"]:
                failures.append(r)
                safe = r["path"].strip("/").replace("/", "_") or "root"
                await page.screenshot(path=str(SCREENSHOTS / f"fail_{safe}.png"))
        await browser.close()
    if failures:
        print(f"\n{len(failures)} failing route(s):")
        for f in failures:
            print(" -", f)
        return 1
    print(f"\nAll {len(ALL_PATHS)} routes reachable (no 404 in signed-out).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))