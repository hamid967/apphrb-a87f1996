"""
Playwright E2E: مستخدم مُسجَّل الدخول يفتح لوحة التحكم ثم صفحة تقديم المصروفات
ثم صفحة الموافقات، ويتم التأكد من عدم ظهور أي أخطاء JS متعلقة بـ Radix
(مثال: `useLayoutEffect of undefined`) أو أخطاء SSR (HTTPError مُغلَّف
من h3، أخطاء React hydration المُصغّرة).

يستخدم جلسة Supabase المُدارة من Lovable — يتخطّى إذا كانت غير موجودة.

المسارات المُغطّاة:
  1. /dashboard                        — لوحة التحكم
  2. /dashboard/expenses/claim         — تقديم مصروف (نموذج Radix Dialog/Select/…)
  3. /dashboard/expenses/review        — صفحة الموافقات

الأخطاء المرصودة تُجمَّع من `console.error` و `pageerror` طوال جلسة التصفح
الواحدة (SPA) — أي خطأ يظهر بعد التنقل الأول يُحسب أيضاً.
"""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/authed-radix-ssr")
SHOTS.mkdir(parents=True, exist_ok=True)

ROUTES = [
    ("/dashboard", "1_dashboard"),
    ("/dashboard/expenses/claim", "2_expenses_claim"),
    ("/dashboard/expenses/review", "3_expenses_review"),
]

FATAL_PATTERNS = [
    re.compile(r"useLayoutEffect", re.I),
    re.compile(r"\bHTTPError\b"),
    re.compile(r'"unhandled"\s*:\s*true'),
    re.compile(r"Minified React error #(418|419|422|423|425)"),
    # مؤشرات كسر React موزَّع بين chunks (مصدر شائع لخطأ Radix)
    re.compile(r"Invalid hook call", re.I),
    re.compile(r"two copies of React", re.I),
]

IGNORE_PATTERNS = [
    re.compile(r"favicon", re.I),
    re.compile(r"ServiceWorker", re.I),
    re.compile(r"manifest\.json", re.I),
    re.compile(r"data-tsd-source", re.I),   # ضوضاء componentTagger في dev
    re.compile(r"data-lov-", re.I),
    re.compile(r"\bDevTools\b", re.I),
]


def is_fatal(msg: str) -> bool:
    if any(p.search(msg) for p in IGNORE_PATTERNS):
        return False
    return any(p.search(msg) for p in FATAL_PATTERNS)


async def main() -> int:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        print("SKIP: no Supabase session injected (LOVABLE_BROWSER_AUTH_STATUS != injected)")
        return 0

    storage_key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
    session_json = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    errors: list[tuple[str, str]] = []  # (route, error)
    current_route = "<init>"

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})

        # SSR (@supabase/ssr) يقرأ الجلسة من كوكيز مرتبطة بأصل localhost.
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = BASE
            await context.add_cookies(cookies)

        page = await context.new_page()

        def on_console(msg):
            if msg.type == "error":
                text = msg.text
                if is_fatal(text):
                    errors.append((current_route, f"[console.error] {text}"))

        def on_pageerror(exc):
            text = str(exc)
            if is_fatal(text):
                errors.append((current_route, f"[pageerror] {text}"))

        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        # حقن جلسة SPA (localStorage) على أصل localhost قبل أي تنقّل محمي.
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )

        for path, slug in ROUTES:
            current_route = path
            resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            try:
                await page.wait_for_load_state("networkidle", timeout=10_000)
            except Exception:
                pass
            await page.screenshot(path=str(SHOTS / f"{slug}.png"))

            status = resp.status if resp else 0
            final = page.url.replace(BASE, "") or "/"
            print(f"[{path}] http={status} final={final}")

            if status >= 500:
                errors.append((path, f"[http {status}] server error"))
            if final.startswith("/auth"):
                errors.append((path, f"session lost — redirected to {final}"))

            # افحص body للتأكد من عدم عرض صفحة خطأ h3 المُغلَّفة.
            body_head = (await page.content())[:4000]
            if '"unhandled":true' in body_head or "HTTPError" in body_head:
                errors.append((path, "[body] swallowed SSR HTTPError page rendered"))

        await browser.close()

    if errors:
        print("\nFAIL: Radix/SSR errors detected during authenticated flow:")
        for route, err in errors:
            print(f"  [{route}] {err}")
        return 1

    print("\nOK: no Radix/SSR errors across dashboard → claim → review")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
