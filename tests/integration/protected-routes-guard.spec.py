"""
Integration test: protected routes without a session must not 500 and must
redirect the client to /auth.

Covers: /portal/tenant, /portal/owner, /register-company

Run:
  python3 tests/integration/protected-routes-guard.spec.py
"""

import asyncio
import sys
import urllib.error
import urllib.request
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
ROUTES = ["/portal/tenant", "/portal/owner", "/register-company"]
results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed})
    print(f"{'PASS' if passed else 'FAIL'} — {name}{(' :: ' + detail) if detail else ''}")


def check_ssr_not_500(path: str) -> None:
    try:
        with urllib.request.urlopen(f"{BASE}{path}", timeout=15) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
    record(f"SSR {path} is not 500", code < 500, f"status={code}")


async def check_client_redirect(context, path: str) -> None:
    page = await context.new_page()
    try:
        await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
        try:
            await page.wait_for_url("**/auth**", timeout=5000)
        except Exception:
            pass
        record(f"client {path} → /auth", "/auth" in page.url, f"landed at {page.url}")
    finally:
        await page.close()


async def main() -> int:
    for p in ROUTES:
        check_ssr_not_500(p)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        try:
            for p in ROUTES:
                await check_client_redirect(context, p)
        finally:
            await browser.close()
    passed = sum(1 for r in results if r["passed"])
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))