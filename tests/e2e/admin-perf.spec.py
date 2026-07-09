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

# Viewport presets that mirror the device switcher in the editor preview.
# Widths/heights match Chrome DevTools' defaults so results stay comparable
# with what a developer sees when they toggle the preview manually.
VIEWPORTS: dict[str, dict[str, int]] = {
    "mobile":  {"width": 390,  "height": 844},   # iPhone 14 class
    "tablet":  {"width": 820,  "height": 1180},  # iPad Air class
    "desktop": {"width": 1280, "height": 1800},
}

# Per-(path, viewport) budgets in milliseconds for "time until key selector
# is visible". Smaller screens usually cost more due to layout/reflow, so
# their budgets are looser. Dev-server + first-hit compile is slow; tune
# these when a page grows legitimately and treat unexpected jumps as
# regressions.
BUDGETS_MS: dict[str, dict[str, int]] = {
    "/admin/route-map":   {"desktop": 8000, "tablet": 9000, "mobile": 10000},
    "/security/sessions": {"desktop": 8000, "tablet": 9000, "mobile": 10000},
}

# How many times to load each (path, viewport). First hit warms Vite; we
# report the median of the remaining runs.
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


def slug(path: str) -> str:
    return path.strip("/").replace("/", "_") or "root"


async def run_path(
    browser,
    path: str,
    viewport_name: str,
    viewport: dict[str, int],
    budget: int,
) -> tuple[dict, list[str], Path]:
    """Load a path RUNS_PER_PATH times inside a dedicated context that records
    video + HAR + Playwright trace. One context per (path, viewport) so each
    combination gets its own isolated diagnostics bundle."""
    artifact_dir = SCREENSHOTS / slug(path) / viewport_name
    video_dir = artifact_dir / "video"
    video_dir.mkdir(parents=True, exist_ok=True)
    har_path = artifact_dir / "network.har"
    trace_path = artifact_dir / "trace.zip"

    context = await browser.new_context(
        viewport=viewport,
        record_video_dir=str(video_dir),
        record_video_size=viewport,
        record_har_path=str(har_path),
        record_har_content="omit",
    )
    await context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = await context.new_page()

    runs: list[dict] = []
    failures: list[str] = []
    try:
        await restore_session(context, page)
        for i in range(RUNS_PER_PATH):
            r = await measure(page, path)
            print(
                f"  [{viewport_name:7s}] {path:22s} run {i + 1}: "
                f"nav={r['navigation_ms']:>5}ms "
                f"interactive={r['interactive_ms']:>5}ms "
                f"transfer={r['transfer_kb']:>6.1f}KB "
                f"status={r['status']} ready={r['ready']}"
            )
            runs.append(r)
        await page.screenshot(path=str(artifact_dir / "final.png"))
    finally:
        # tracing.stop + context.close MUST run before video/HAR files are
        # flushed to disk. Order matters: stop trace → close context.
        await context.tracing.stop(path=str(trace_path))
        await context.close()

    summary = summarize(runs)
    med = summary["interactive_ms_median"]
    label = f"{path} @ {viewport_name}"
    if not summary["all_ready"]:
        failures.append(f"{label}: never rendered ready selector")
    if med > budget:
        failures.append(f"{label}: interactive_ms median {med} > budget {budget}")

    return summary, failures, artifact_dir


def discard_artifacts(artifact_dir: Path) -> None:
    """Passing runs leave nothing behind — video/HAR/trace exist only when
    a regression needs diagnosis."""
    import shutil
    if artifact_dir.exists():
        shutil.rmtree(artifact_dir, ignore_errors=True)


async def main() -> int:
    source = resolve_auth_source()
    if source == "none":
        print("SKIP: no admin session available.")
        print("      Sign in via the preview or run scripts/e2e-mint-admin-session.py")
        return 0
    print(f"Using auth source: {source}")


    report: dict = {"budgets_ms": BUDGETS_MS, "runs_per_path": RUNS_PER_PATH, "results": {}}
    all_failures: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            for path, budget in BUDGETS_MS.items():
                summary, failures, artifact_dir = await run_path(browser, path, budget)
                report["results"][path] = {"budget_ms": budget, **summary}
                med = summary["interactive_ms_median"]
                if failures:
                    all_failures.extend(failures)
                    marker = "FAIL"
                    print(
                        f"{marker} {path:22s} median interactive={med}ms "
                        f"(budget {budget}ms) — artifacts kept at {artifact_dir}"
                    )
                    # Attach artifact locations into the JSON report for CI.
                    report["results"][path]["artifacts"] = {
                        "dir": str(artifact_dir),
                        "video_dir": str(artifact_dir / "video"),
                        "har": str(artifact_dir / "network.har"),
                        "trace": str(artifact_dir / "trace.zip"),
                        "screenshot": str(artifact_dir / "final.png"),
                    }
                else:
                    discard_artifacts(artifact_dir)
                    print(
                        f"OK   {path:22s} median interactive={med}ms "
                        f"(budget {budget}ms) transfer={summary['transfer_kb_median']}KB"
                    )
        finally:
            await browser.close()

    REPORT.write_text(json.dumps(report, indent=2))
    print(f"\nReport → {REPORT}")

    if all_failures:
        print(f"\n{len(all_failures)} regression(s):")
        for f in all_failures:
            print(" -", f)
        print(
            "\nDiagnose with:\n"
            "  - open the video under <artifacts>/video/*.webm\n"
            "  - inspect requests: cat <artifacts>/network.har | jq\n"
            "  - replay UI:  bunx playwright show-trace <artifacts>/trace.zip"
        )
        return 1
    print("\nAll pages within budget.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

