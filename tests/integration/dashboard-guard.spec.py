"""
Integration test: /dashboard without a session must not 500 and must
redirect the client to /auth.

Run:
  python3 tests/integration/dashboard-guard.spec.py
"""

import asyncio
import sys
import urllib.request
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
results: list[dict] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append({"name": name, "passed": passed})
    print(f"{'PASS' if passed else 'FAIL'} — {name}{(' :: ' + detail) if detail else ''}")


def check_ssr_not_500() -> None:
    req = urllib.request.Request(f"{BASE}/dashboard")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
    record("SSR /dashboard is not 500", code < 500, f"status={code}")


async def check_client_redirect() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        try:
            await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
            try:
                await page.wait_for_url("**/auth**", timeout=5000)
            except Exception:
                pass
            record("client redirects to /auth", "/auth" in page.url, f"landed at {page.url}")
        finally:
            await browser.close()


async def main() -> int:
    check_ssr_not_500()
    await check_client_redirect()
    passed = sum(1 for r in results if r["passed"])
    print(f"\n{passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))