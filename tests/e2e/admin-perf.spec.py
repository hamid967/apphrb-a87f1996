"""
Playwright perf smoke: measure how long /admin/route-map and
/security/sessions take to reach a usable state for a signed-in
super-admin, and fail loudly when either page regresses past a
per-route budget.

For each path we record:
  - navigation_ms:   navigation start → domcontentloaded
  - interactive_ms:  navigation start → the page's key selector is visible
                     (route-map: <table>, security sessions: main heading)
  - transfer_kb:     total encoded bytes reported by the Performance API

A run FAILS when interactive_ms exceeds BUDGETS_MS[path]. Adjust the
budgets when the pages legitimately grow; treat unexpected jumps as
regressions.

Auth restoration mirrors admin-routes-signed-in.spec.py — falls back
to a SKIP on signed_out sandboxes so CI does not false-fail.

Run:  python3 tests/e2e/admin-perf.spec.py
"""
import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
SCREENSHOTS = Path("/tmp/browser/admin-perf")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)
REPORT = SCREENSHOTS / "report.json"

STORAGE_STATE_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.storage.json"
SESSION_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.session.json"
COOKIES_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.cookies.json"

# Per-path budgets in milliseconds for "time until key selector is visible".
# Dev-server + first-hit compile is slow; keep budgets generous but low enough
# to catch real regressions (e.g. a synchronous 2 MB import).
BUDGETS_MS: dict[str, int] = {
    "/admin/route-map": 8000,
    "/security/sessions": 8000,
}

# How many times to load each path. First hit warms Vite; we report the
# median of the remaining runs.
RUNS_PER_PATH = 3

# Key selectors that signal each page is usable.
READY_SELECTORS: dict[str, str] = {
    "/admin/route-map": "table tbody tr",
    "/security/sessions": "h1, h2",
}


def resolve_auth_source() -> str:
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") == "injected":
        return "env"
    if STORAGE_STATE_FILE.exists() or SESSION_FILE.exists():
        return "file"
    return "none"


async def restore_session(context, page) -> None:
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    if not (storage_key and session_json) and SESSION_FILE.exists():
        session_json = SESSION_FILE.read_text()
        url = os.environ.get("VITE_SUPABASE_URL", "")
        ref = url.replace("https://", "").split(".")[0]
        storage_key = storage_key or f"sb-{ref}-auth-token"
    if not cookies_json and COOKIES_FILE.exists():
        cookies_json = COOKIES_FILE.read_text()

    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            if not c.get("domain"):
                c["url"] = BASE
        await context.add_cookies(cookies)

    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            "([k, v]) => window.localStorage.setItem(k, v)",
            [storage_key, session_json],
        )
    bypass = (
        os.environ.get("VITE_E2E_BYPASS_TOKEN")
        or os.environ.get("E2E_BYPASS_TOKEN")
    )
    if bypass:
        await page.evaluate(
            "(t) => window.sessionStorage.setItem('__admin_e2e_skip_aal2', t)",
            bypass,
        )


async def measure(page, path: str) -> dict:
    """Load `path` in a clean navigation and record timings."""
    ready_sel = READY_SELECTORS[path]

    # Reset the perf buffer so transfer bytes reflect only this navigation.
    await page.evaluate("() => performance.clearResourceTimings()")

    t0 = time.perf_counter()
    resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    dom_ms = int((time.perf_counter() - t0) * 1000)

    try:
        await page.wait_for_selector(ready_sel, state="visible", timeout=15000)
        interactive_ms = int((time.perf_counter() - t0) * 1000)
        ready = True
    except Exception:
        interactive_ms = int((time.perf_counter() - t0) * 1000)
        ready = False

    transfer_bytes = await page.evaluate(
        "() => performance.getEntriesByType('resource')"
        ".reduce((n, e) => n + (e.transferSize || 0), 0)"
    )

    final = page.url.replace(BASE, "")
    return {
        "path": path,
        "status": resp.status if resp else 0,
        "final": final,
        "navigation_ms": dom_ms,
        "interactive_ms": interactive_ms,
        "transfer_kb": round(transfer_bytes / 1024, 1),
        "ready": ready,
    }


def summarize(runs: list[dict]) -> dict:
    """Discard the first (cold) run and return median of the rest."""
    warm = runs[1:] if len(runs) > 1 else runs
    return {
        "runs": runs,
        "navigation_ms_median": int(statistics.median(r["navigation_ms"] for r in warm)),
        "interactive_ms_median": int(statistics.median(r["interactive_ms"] for r in warm)),
        "transfer_kb_median": round(statistics.median(r["transfer_kb"] for r in warm), 1),
        "all_ready": all(r["ready"] for r in runs),
    }


async def main() -> int:
    source = resolve_auth_source()
    if source == "none":
        print("SKIP: no admin session available.")
        print("      Sign in via the preview or run scripts/e2e-mint-admin-session.py")
        return 0
    print(f"Using auth source: {source}")

    report: dict = {"budgets_ms": BUDGETS_MS, "runs_per_path": RUNS_PER_PATH, "results": {}}
    failures: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        try:
            await restore_session(context, page)

            for path, budget in BUDGETS_MS.items():
                runs: list[dict] = []
                for i in range(RUNS_PER_PATH):
                    r = await measure(page, path)
                    print(
                        f"  {path:22s} run {i + 1}: nav={r['navigation_ms']:>5}ms "
                        f"interactive={r['interactive_ms']:>5}ms "
                        f"transfer={r['transfer_kb']:>6.1f}KB "
                        f"status={r['status']} ready={r['ready']}"
                    )
                    runs.append(r)
                summary = summarize(runs)
                report["results"][path] = {"budget_ms": budget, **summary}

                med = summary["interactive_ms_median"]
                if not summary["all_ready"]:
                    failures.append(f"{path}: never rendered ready selector")
                if med > budget:
                    failures.append(
                        f"{path}: interactive_ms median {med} > budget {budget}"
                    )
                marker = "OK  " if (summary["all_ready"] and med <= budget) else "FAIL"
                print(
                    f"{marker} {path:22s} median interactive={med}ms "
                    f"(budget {budget}ms) transfer={summary['transfer_kb_median']}KB"
                )

            await page.screenshot(path=str(SCREENSHOTS / "final.png"))
        finally:
            await browser.close()

    REPORT.write_text(json.dumps(report, indent=2))
    print(f"\nReport → {REPORT}")

    if failures:
        print(f"\n{len(failures)} regression(s):")
        for f in failures:
            print(" -", f)
        return 1
    print("\nAll pages within budget.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
