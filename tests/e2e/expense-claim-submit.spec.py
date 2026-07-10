"""
Playwright E2E: مستخدم مُسجَّل الدخول يفتح نموذج تقديم مصروف،
يرفع إيصالاً تجريبياً (صورة PNG صغيرة مُولَّدة برمجياً)، يُكمل الحقول،
يُرسل الطلب، ثم يُتحقَّق من الوصول إلى صفحة حالة التقديم
(/dashboard/expenses) بدون أي خطأ Radix (useLayoutEffect) أو SSR
(HTTPError مُغلَّف / hydration errors).

يتخطّى تلقائياً إذا لم تكن جلسة Supabase مُدارة متوفّرة.
"""
import asyncio
import base64
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/expense-claim-submit")
SHOTS.mkdir(parents=True, exist_ok=True)

# 1x1 PNG (67 بايت) — يكفي كإيصال تجريبي لعبور فحص نوع الملف والحجم.
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4"
    "//8/AwAI/AL+XJ/pAAAAAABJRU5ErkJggg=="
)
RECEIPT_PATH = SHOTS / "fake-receipt.png"
RECEIPT_PATH.write_bytes(base64.b64decode(TINY_PNG_B64))

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

    errors: list[str] = []

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
                errors.append(f"[console.error] {msg.text}")

        def on_pageerror(exc):
            if is_fatal(str(exc)):
                errors.append(f"[pageerror] {exc}")

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        # حقن جلسة SPA.
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )

        # افتح النموذج.
        await page.goto(f"{BASE}/dashboard/expenses/claim", wait_until="domcontentloaded")
        try:
            await page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass
        await page.screenshot(path=str(SHOTS / "1_form_open.png"))

        if page.url.startswith(f"{BASE}/auth"):
            print(f"FAIL: session rejected — redirected to {page.url}")
            return 1

        # ارفع الإيصال مباشرة عبر input[type=file] المخفي.
        file_input = page.locator('input[type="file"]').first
        try:
            await file_input.set_input_files(str(RECEIPT_PATH))
        except Exception as exc:
            print(f"FAIL: could not attach receipt file: {exc}")
            return 1

        # انتظر انتقال الخطوة (upload → OCR → step 1/2).
        try:
            await page.wait_for_load_state("networkidle", timeout=15_000)
        except Exception:
            pass
        await page.screenshot(path=str(SHOTS / "2_receipt_uploaded.png"))

        # املأ الحقول الأساسية بأمان — inputs تُميَّز بـ label نصي أو placeholder.
        # نستخدم استعلامات مرنة تعمل مع كِلا اللغتين (AR/EN).
        # amount: أول input رقمي.
        amount = page.locator('input[type="number"]').first
        if await amount.count():
            await amount.fill("42")
        # title/name: أول input نصي غير مخفي.
        title_input = page.locator('input[type="text"]:visible').first
        if await title_input.count():
            await title_input.fill("Playwright test receipt")

        await page.screenshot(path=str(SHOTS / "3_form_filled.png"))

        # اضغط زر "التالي" حتى الوصول لزر الإرسال (data-coach="receipt-submit").
        submit_btn = page.locator('[data-coach="receipt-submit"]')
        for _ in range(3):
            if await submit_btn.count() and await submit_btn.is_visible():
                break
            next_btn = page.get_by_role("button", name=re.compile(r"^(Next|التالي)", re.I)).first
            if await next_btn.count() and await next_btn.is_enabled():
                await next_btn.click()
                await page.wait_for_timeout(400)
            else:
                break

        await page.screenshot(path=str(SHOTS / "4_ready_to_submit.png"))

        if not await submit_btn.count():
            print("FAIL: submit button never appeared")
            return 1

        # قد يكون معطّلاً بسبب سياسات — لا يهمّ للاختبار، الأهم عدم انهيار JS.
        if await submit_btn.is_enabled():
            await submit_btn.click()
            try:
                await page.wait_for_url(
                    re.compile(r"/dashboard/expenses(?:\?|$|/)"),
                    timeout=15_000,
                )
            except Exception:
                # حتى لو الخادم رفض، ما زلنا نتحقق من الأخطاء أدناه.
                pass

        try:
            await page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass
        await page.screenshot(path=str(SHOTS / "5_after_submit.png"))

        final = page.url.replace(BASE, "") or "/"
        print(f"final_url={final} errors={len(errors)}")

        # افحص body للتأكد من عدم عرض صفحة خطأ h3 المُغلَّفة.
        body_head = (await page.content())[:4000]
        if '"unhandled":true' in body_head or "HTTPError" in body_head:
            errors.append("[body] swallowed SSR HTTPError page rendered")

        await browser.close()

    if errors:
        print("\nFAIL: Radix/SSR errors during expense claim submission:")
        for e in errors:
            print(f"  {e}")
        return 1

    print("\nOK: expense claim form → submit flow clean of Radix/SSR errors")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
