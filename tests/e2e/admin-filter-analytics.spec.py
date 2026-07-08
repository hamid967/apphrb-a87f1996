"""
E2E: /admin/filter-analytics renders the four KPI cards and the event-volume
chart for a super_admin, using the AAL2 bypass token so the run doesn't need
a real TOTP factor.

Requirements to run:
    - LOVABLE_BROWSER_AUTH_STATUS=injected (managed Supabase session available)
    - E2E_BYPASS_TOKEN set on both server and client, >=16 chars
      (server: E2E_BYPASS_AAL2=true, E2E_BYPASS_TOKEN=<t>;
       client build: VITE_E2E_BYPASS_TOKEN=<t>)
    - Dev server on http://localhost:8080
    - Signed-in session belongs to a super_admin

What it asserts:
    1. Page loads at /admin/filter-analytics without redirecting to /auth or
       hitting the AAL2 challenge page.
    2. The four KPI labels are visible (Total events / Unique users /
       Unique sessions / Active sessions (1h)), in EN or AR.
    3. At least one SVG chart element is rendered (the AreaChart in the
       "Event volume trend" card via recharts).
    4. The health banner renders (either "Ingestion healthy" or a warning
       state) — proves getFilterAnalyticsHealth resolved.

Skip if:
    - No Supabase session (LOVABLE_BROWSER_AUTH_STATUS != injected).
    - E2E_BYPASS_TOKEN missing / too short — the run cannot reach the page
      without AAL2 and this test is not meaningful.
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

SCREENSHOTS = Path("/tmp/browser/admin-filter-analytics")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

# EN + AR labels the KPI cards render — matches admin.filter-analytics.tsx.
KPI_LABELS = [
    ("Total events", "إجمالي الأحداث"),
    ("Unique users", "مستخدمون فريدون"),
    ("Unique sessions", "جلسات فريدة"),
    ("Active sessions (1h)", "جلسات نشطة (آخر ساعة)"),
]

HEALTH_MARKERS = [
    "Ingestion healthy",
    "الاستيعاب سليم",
    "No events received recently",
    "لم تصل أحداث منذ فترة",
    "Sharp drop in event rate",
    "انخفاض حاد في الأحداث",
]


async def main() -> int:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        print("SKIP: no Supabase session injected")
        return 0

    bypass_token = os.environ.get("E2E_BYPASS_TOKEN") or ""
    if len(bypass_token) < 16:
        print("SKIP: E2E_BYPASS_TOKEN not set (>=16 chars) — cannot cross AAL2 gate")
        return 0

    storage_key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
    session_json = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        # Playwright traces mirror admin-routes-signed-in for viewer parity.
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)

        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = "http://localhost:8080"
            await context.add_cookies(cookies)

        # Restore session and inject the bypass token BEFORE navigating to
        # /admin — the admin layout reads sessionStorage during its render.
        await page.goto("http://localhost:8080", wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )
        await page.evaluate(
            f'window.sessionStorage.setItem("__admin_e2e_skip_aal2", {json.dumps(bypass_token)})'
        )

        try:
            await page.goto(
                "http://localhost:8080/admin/filter-analytics",
                wait_until="networkidle",
                timeout=25_000,
            )
            await page.screenshot(path=str(SCREENSHOTS / "1_loaded.png"))

            # 1) Not bounced to /auth or to a 2FA challenge page.
            assert "/auth" not in page.url, f"redirected to auth: {page.url}"
            assert "/admin/filter-analytics" in page.url, f"unexpected URL: {page.url}"

            body_text = (await page.locator("body").inner_text()).strip()

            # 2) All four KPI labels present (EN or AR variant).
            missing = []
            for en, ar in KPI_LABELS:
                if en not in body_text and ar not in body_text:
                    missing.append(en)
            assert not missing, f"missing KPI labels: {missing}\n--- body ---\n{body_text[:2000]}"

            # 3) At least one SVG chart rendered.
            svg_count = await page.locator("svg.recharts-surface").count()
            assert svg_count >= 1, f"expected >=1 recharts SVG, got {svg_count}"

            # 4) Health banner text visible.
            assert any(m in body_text for m in HEALTH_MARKERS), (
                "health banner did not render — getFilterAnalyticsHealth may have failed"
            )

            await page.screenshot(path=str(SCREENSHOTS / "2_verified.png"))
        finally:
            await context.tracing.stop(path=str(SCREENSHOTS / "trace.zip"))
            await browser.close()

    print("PASS: /admin/filter-analytics renders KPIs + chart + health banner")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))


# Silence "unused" lint on re — kept in case future assertions need regex.
_ = re