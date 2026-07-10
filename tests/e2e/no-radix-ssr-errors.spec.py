"""
Playwright: يفتح المسارات العامة الرئيسية ويؤكد عدم وجود أخطاء JS
مرتبطة بـ Radix (مثل: Cannot read properties of undefined (reading 'useLayoutEffect'))
أو أخطاء SSR (hydration mismatch / HTTPError / unhandled 500).

الهدف: منع أي انحدار مستقبلي في تقسيم chunks للـ vendor-radix / vendor-react
أو تسرّب استخدامات SSR-غير-آمنة.
"""
import asyncio
import re
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/no-radix-ssr-errors")
SHOTS.mkdir(parents=True, exist_ok=True)

# مسارات عامة (لا تتطلب مصادقة) — تُغطي Root + مكونات Radix شائعة
# (Dialog, Dropdown, Tooltip, Toast, Select ... تُحمّل عبر UI shell).
ROUTES = [
    ("/", "home"),
    ("/auth", "auth"),
    ("/pricing", "pricing"),
    ("/contact", "contact"),
]


# أنماط أخطاء يجب رفضها
FATAL_PATTERNS = [
    re.compile(r"useLayoutEffect", re.I),
    re.compile(r"\bHTTPError\b"),
    re.compile(r'"unhandled"\s*:\s*true'),
    re.compile(r"Minified React error #(418|419|422|423|425)"),  # hydration errors
]

# تجاهُل ضوضاء غير حرجة (SW / analytics / 404 favicon / dev tagger…)
IGNORE_PATTERNS = [
    re.compile(r"favicon", re.I),
    re.compile(r"ServiceWorker", re.I),
    re.compile(r"manifest", re.I),
    re.compile(r"data-tsd-source", re.I),   # dev-only componentTagger noise
    re.compile(r"data-lov-", re.I),
]



def is_fatal(msg: str) -> bool:
    if any(p.search(msg) for p in IGNORE_PATTERNS):
        return False
    return any(p.search(msg) for p in FATAL_PATTERNS)


async def check_route(page, path: str, slug: str):
    errors: list[str] = []

    def on_console(msg):
        if msg.type in ("error",):
            text = msg.text
            if is_fatal(text):
                errors.append(f"[console.error] {text}")

    def on_pageerror(exc):
        text = str(exc)
        if is_fatal(text):
            errors.append(f"[pageerror] {text}")

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)

    resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    await page.screenshot(path=str(SHOTS / f"{slug}.png"))

    status = resp.status if resp else 0
    if status >= 500:
        errors.append(f"[http {status}] {path} returned server error")

    # افحص body للتأكد من عدم عرض صفحة خطأ h3 المُغلَّفة
    body = await page.content()
    if '"unhandled":true' in body or "HTTPError" in body[:2000]:
        errors.append(f"[body] {path} shows swallowed SSR HTTPError page")

    print(f"[{path}] http={status} errors={len(errors)}")
    for e in errors:
        print(f"  - {e}")
    return errors


async def main() -> int:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        all_errors: dict[str, list[str]] = {}
        for path, slug in ROUTES:
            page = await context.new_page()
            errs = await check_route(page, path, slug)
            if errs:
                all_errors[path] = errs
            await page.close()
        await browser.close()

    if all_errors:
        print("\nFAIL: Radix/SSR errors detected on:")
        for path, errs in all_errors.items():
            print(f"  {path}")
            for e in errs:
                print(f"    {e}")
        return 1
    print("\nOK: no Radix / SSR errors on covered routes")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
