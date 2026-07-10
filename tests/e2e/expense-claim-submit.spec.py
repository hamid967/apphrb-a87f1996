"""
Playwright E2E: مستخدم مُسجَّل الدخول يفتح نموذج تقديم مصروف مع بيانات
مُمرَّرة عبر URL prefill (يمرّ عبر `validateSearch`), يُرسل الطلب،
ثم يزور صفحة حالة التقديم (/dashboard/expenses)، ويتحقّق من عدم ظهور
أي خطأ Radix (`useLayoutEffect`, Invalid hook call) أو SSR
(`HTTPError`, hydration errors #418/#419/#422/#423/#425).

المنطق:
- prefill يجعل النموذج يبدأ من step=2 (شاشة المراجعة) مع الحقول جاهزة،
  فلا نحتاج لرفع ملف حقيقي إلى تخزين Supabase من CI.
- إن كان زر الإرسال مُفعَّلاً نضغطه؛ وإلّا نتحقّق فقط من رسم UI بدون كسر.
- بعد ذلك ننتقل يدوياً إلى `/dashboard/expenses` (صفحة الحالة/القائمة)
  للتحقّق من رسمها نظيفةً.

يتخطّى تلقائياً إذا لم تكن جلسة Supabase مُدارة متوفّرة.
"""
import asyncio
import base64
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlencode

from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/expense-claim-submit")
SHOTS.mkdir(parents=True, exist_ok=True)

# 1x1 PNG صغير — نحتفظ به كأداة تشخيص، غير مرفوع في المسار الأساسي.
TINY_PNG = SHOTS / "fake-receipt.png"
TINY_PNG.write_bytes(
    base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4"
        "//8/AwAI/AL+XJ/pAAAAAABJRU5ErkJggg=="
    )
)

FATAL_PATTERNS = [
    re.compile(r"useLayoutEffect", re.I),
    re.compile(r"\bHTTPError\b"),
    re.compile(r'"unhandled"\s*:\s*true'),
    re.compile(r"Minified React error #(418|419|422|423|425)"),
    re.compile(r"Invalid hook call", re.I),
    re.compile(r"two copies of React", re.I),
]
IGNORE_PATTERNS = [
    re.compile(r"favicon", re.I),
    re.compile(r"ServiceWorker", re.I),
    re.compile(r"manifest\.json", re.I),
    re.compile(r"data-tsd-source", re.I),
    re.compile(r"data-lov-", re.I),
]


def is_fatal(msg: str) -> bool:
    if any(p.search(msg) for p in IGNORE_PATTERNS):
        return False
    return any(p.search(msg) for p in FATAL_PATTERNS)


async def main() -> int:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        print("SKIP: no Supabase session injected")
        return 0

    storage_key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
    session_json = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    errors: list[tuple[str, str]] = []
    current = "<init>"

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})

        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = BASE
            await context.add_cookies(cookies)

        page = await context.new_page()

        def on_console(msg):
            if msg.type == "error" and is_fatal(msg.text):
                errors.append((current, f"[console.error] {msg.text}"))

        def on_pageerror(exc):
            if is_fatal(str(exc)):
                errors.append((current, f"[pageerror] {exc}"))

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        # حقن جلسة SPA على أصل localhost.
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )

        # 1) افتح نموذج المطالبة مع بيانات prefill.
        current = "/dashboard/expenses/claim (prefilled step=2)"
        prefill = urlencode({
            "step": "2",
            "amount": "42",
            "title": "Playwright test receipt",
            "category": "other",
            "notes": "e2e smoke",
            "receipt": "receipts/playwright-e2e/fake.png",
            "filename": "fake.png",
        })
        await page.goto(f"{BASE}/dashboard/expenses/claim?{prefill}", wait_until="domcontentloaded")
        try:
            await page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass
        await page.screenshot(path=str(SHOTS / "1_form_review.png"))

        if page.url.startswith(f"{BASE}/auth"):
            print(f"FAIL: session rejected — redirected to {page.url}")
            return 1

        # 2) اضغط الإرسال إن كان مفعّلاً — الخادم قد يرفض receipt path وهميّاً،
        #    لكن ما يهم هنا هو عدم انهيار JS في UI/Radix.
        submit_btn = page.locator('[data-coach="receipt-submit"]').first
        if await submit_btn.count() and await submit_btn.is_visible():
            enabled = await submit_btn.is_enabled()
            print(f"submit button visible, enabled={enabled}")
            if enabled:
                current = "submit click"
                await submit_btn.click()
                try:
                    await page.wait_for_load_state("networkidle", timeout=10_000)
                except Exception:
                    pass
        else:
            print("submit button not visible — review step didn't render (non-fatal)")

        await page.screenshot(path=str(SHOTS / "2_after_submit.png"))

        # 3) صفحة حالة/قائمة المصروفات — تُستخدم كصفحة "ما بعد التقديم".
        current = "/dashboard/expenses"
        await page.goto(f"{BASE}/dashboard/expenses", wait_until="domcontentloaded")
        try:
            await page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass
        await page.screenshot(path=str(SHOTS / "3_status_page.png"))

        body_head = (await page.content())[:4000]
        if '"unhandled":true' in body_head or "HTTPError" in body_head:
            errors.append((current, "[body] swallowed SSR HTTPError page rendered"))

        final = page.url.replace(BASE, "") or "/"
        print(f"final_url={final} errors={len(errors)}")

        await browser.close()

    if errors:
        print("\nFAIL: Radix/SSR errors during expense claim flow:")
        for route, err in errors:
            print(f"  [{route}] {err}")
        return 1

    print("\nOK: expense claim submit flow clean of Radix/SSR errors")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
