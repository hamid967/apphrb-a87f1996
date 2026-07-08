#!/usr/bin/env python3
"""Quick E2E audit: crawls all discovered routes, logs hydration mismatches,
5xx/4xx responses, console + pageerror events, and writes a markdown report.

Usage:
    python3 scripts/e2e-audit.py [--base http://localhost:8080] [--out audit-report.md]

Requires: playwright (already in the Lovable sandbox).
"""
import argparse, asyncio, json, os, re
from pathlib import Path
from playwright.async_api import async_playwright

ROUTES_DIR = Path("src/routes")
HYDRATION_RE = re.compile(r"hydrat|did not match|Text content does not match", re.I)


def discover_routes() -> list[str]:
    urls: set[str] = set()
    for p in ROUTES_DIR.rglob("*.tsx"):
        rel = p.relative_to(ROUTES_DIR).with_suffix("")
        name = str(rel).replace(os.sep, ".")
        if name.startswith("__") or name.startswith("api"):
            continue
        # normalise: dots -> slashes, drop _layout segments, strip trailing /index
        segs = [s for s in name.split(".") if not s.startswith("_")]
        url = "/" + "/".join(segs)
        url = re.sub(r"/index$", "", url) or "/"
        if "$" in url or "[" in url or url.startswith("/dev"):
            continue
        urls.add(url)
    return sorted(urls)


async def audit(base: str, out: str):
    routes = discover_routes()
    print(f"Discovered {len(routes)} routes")

    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1400})

        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = base
            await context.add_cookies(cookies)

        page = await context.new_page()

        if storage_key and session_json:
            await page.goto(base)
            await page.evaluate(
                "([k, v]) => window.localStorage.setItem(k, v)",
                [storage_key, session_json],
            )

        results = []
        for route in routes:
            url = base + route
            console_errors: list[str] = []
            hydration: list[str] = []
            page_errors: list[str] = []

            def on_console(msg):
                t = msg.text
                if msg.type == "error":
                    console_errors.append(t)
                    if HYDRATION_RE.search(t):
                        hydration.append(t)
                elif msg.type == "warning" and HYDRATION_RE.search(t):
                    hydration.append(t)

            def on_pageerror(err):
                page_errors.append(str(err))

            page.on("console", on_console)
            page.on("pageerror", on_pageerror)

            status = 0
            final = url
            err = None
            try:
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                status = resp.status if resp else 0
                final = page.url
                await page.wait_for_timeout(600)
            except Exception as e:
                err = str(e).splitlines()[0][:200]
            page.remove_listener("console", on_console)
            page.remove_listener("pageerror", on_pageerror)

            results.append({
                "route": route, "status": status, "final": final, "err": err,
                "console": console_errors[:3], "hydration": hydration[:2],
                "pageerr": page_errors[:2],
            })
            icon = "💥" if err else "🔥" if status >= 500 else "⚠️" if status >= 400 else "✅"
            tag = " (hydration)" if hydration else ""
            print(f"{icon} {status or 'ERR'} {route}{tag}")

        await browser.close()

    # ---- write markdown report
    from datetime import datetime
    now = datetime.utcnow().isoformat() + "Z"
    bad = [r for r in results if r["err"] or r["status"] >= 400]
    hydra = [r for r in results if r["hydration"]]
    errs = [r for r in results if r["console"] or r["pageerr"]]

    md = [f"# E2E Audit Report\n",
          f"- Date: {now}",
          f"- Base: {base}",
          f"- Routes tested: {len(results)}",
          f"- ❌ HTTP >=400: {len(bad)} | 💧 Hydration: {len(hydra)} | 🐞 Console/page errors: {len(errs)}\n",
          "## Summary\n",
          "| Route | Status | Final | Hydration | Console errs |",
          "|---|---|---|---|---|"]
    for r in results:
        final = r["final"].replace(base, "") or "/"
        md.append(f"| `{r['route']}` | {r['err'] or r['status']} | `{final}` | "
                  f"{'⚠️' if r['hydration'] else '—'} | {len(r['console']) or '—'} |")

    if bad:
        md.append("\n## HTTP Errors (>=400)\n")
        for r in bad:
            md.append(f"### `{r['route']}` — {r['err'] or r['status']}")
            if r["err"]:
                md.append(f"```\n{r['err']}\n```")

    if hydra:
        md.append("\n## Hydration Mismatches\n")
        for r in hydra:
            md.append(f"### `{r['route']}`")
            for h in r["hydration"]:
                md.append(f"- {h}")

    if errs:
        md.append("\n## Console / Page Errors\n")
        for r in errs:
            md.append(f"### `{r['route']}`")
            for e in r["pageerr"]:
                md.append(f"- **pageerror**: {e}")
            for e in r["console"]:
                md.append(f"- {e}")
            md.append("")

    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text("\n".join(md))
    print(f"\nReport → {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("BASE_URL", "http://localhost:8080"))
    ap.add_argument("--out", default="audit-report.md")
    a = ap.parse_args()
    asyncio.run(audit(a.base, a.out))
