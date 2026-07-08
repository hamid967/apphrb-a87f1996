"""Visual regression smoke tests for HBSpro core UI surfaces.

Captures deterministic screenshots for the dashboard, /admin overview and a
representative form (onboarding) and compares each capture against the
baseline stored under ``tests/visual/baselines/``. Any pixel diff above
``THRESHOLD`` (per-pixel color distance) or exceeding ``MAX_DIFF_RATIO``
(fraction of changed pixels) fails the test — signalling that the shared
color / typography / shadow tokens drifted across surfaces.

Update baselines intentionally with:  UPDATE_BASELINES=1 python tests/visual/visual-regression.spec.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

ROOT = Path(__file__).parent
BASELINES = ROOT / "baselines"
ACTUAL = ROOT / "actual"
DIFFS = ROOT / "diffs"
for d in (BASELINES, ACTUAL, DIFFS):
    d.mkdir(parents=True, exist_ok=True)

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
UPDATE = os.environ.get("UPDATE_BASELINES") == "1"
THRESHOLD = 24           # per-channel tolerance for antialiasing / subpixel noise
MAX_DIFF_RATIO = 0.02    # >2% changed pixels => regression

SCENARIOS = [
    {"name": "dashboard", "path": "/dashboard"},
    {"name": "admin",     "path": "/admin"},
    {"name": "onboarding-form", "path": "/onboarding"},
]


async def restore_session(context, page):
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE_URL
        await context.add_cookies(cookies)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


def compare(baseline: Path, actual: Path, diff: Path) -> tuple[bool, float]:
    a = Image.open(baseline).convert("RGB")
    b = Image.open(actual).convert("RGB")
    if a.size != b.size:
        return False, 1.0
    d = ImageChops.difference(a, b)
    # collapse to a mask of pixels beyond THRESHOLD on any channel
    px = d.load()
    w, h = d.size
    changed = 0
    for y in range(h):
        for x in range(w):
            r, g, bl = px[x, y]
            if r > THRESHOLD or g > THRESHOLD or bl > THRESHOLD:
                changed += 1
    ratio = changed / (w * h)
    if ratio > 0:
        d.save(diff)
    return ratio <= MAX_DIFF_RATIO, ratio


async def main() -> int:
    failures: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await restore_session(context, page)

        for s in SCENARIOS:
            await page.goto(f"{BASE_URL}{s['path']}", wait_until="networkidle")
            # freeze animations for determinism
            await page.add_style_tag(content="*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}")
            await page.wait_for_timeout(400)
            shot = (BASELINES if UPDATE else ACTUAL) / f"{s['name']}.png"
            await page.screenshot(path=str(shot))
            if UPDATE:
                print(f"[baseline] {s['name']} -> {shot}")
                continue
            baseline = BASELINES / f"{s['name']}.png"
            if not baseline.exists():
                print(f"[missing baseline] {s['name']} — run with UPDATE_BASELINES=1")
                failures.append(s["name"])
                continue
            ok, ratio = compare(baseline, shot, DIFFS / f"{s['name']}.png")
            status = "PASS" if ok else "FAIL"
            print(f"[{status}] {s['name']}  diff={ratio:.4%}")
            if not ok:
                failures.append(s["name"])

        await browser.close()
    if failures and not UPDATE:
        print(f"\nVisual regressions in: {', '.join(failures)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))