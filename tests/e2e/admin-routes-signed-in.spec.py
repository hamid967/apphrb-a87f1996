"""
Playwright smoke: every /admin/* route must render successfully for a
signed-in super-admin — no 404, no redirect to /auth, no redirect to
/access-denied, no redirect to /security/mfa (assumes the test user has
already completed MFA / has aal2, since the /admin gate is fail-closed).

Uses the managed Supabase session injected by the sandbox
(LOVABLE_BROWSER_SUPABASE_*). If auth is not injected, the script exits 0
with a clear "SKIP" so CI on signed_out projects doesn't false-fail.

Run with:  python3 tests/e2e/admin-routes-signed-in.spec.py
"""
import asyncio
import html
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
ARTIFACT_ROOT = Path(
    os.environ.get("ADMIN_E2E_ARTIFACT_ROOT", "/tmp/browser/admin-routes-signed-in")
)
RUN_ID = os.environ.get(
    "ADMIN_E2E_RUN_ID",
    datetime.now(timezone.utc).strftime("run-%Y%m%d-%H%M%SZ"),
)
RUN_DIR = ARTIFACT_ROOT / RUN_ID
SCREENSHOT_DIR = RUN_DIR / "screenshots"
VIDEO_DIR = RUN_DIR / "video"
for d in (SCREENSHOT_DIR, VIDEO_DIR):
    d.mkdir(parents=True, exist_ok=True)
# Kept for callers that still reference SCREENSHOTS; points at this run.
SCREENSHOTS = SCREENSHOT_DIR

REPORT_JSON = RUN_DIR / "report.json"
REPORT_HTML = RUN_DIR / "report.html"
CONSOLE_LOG = RUN_DIR / "console.log"
NETWORK_LOG = RUN_DIR / "network-failures.log"
TRACE_FILE = RUN_DIR / "trace.zip"

# Fallback: if the sandbox didn't inject LOVABLE_BROWSER_SUPABASE_*, look for a
# locally minted session on disk (see scripts/e2e-mint-admin-session.py).
STORAGE_STATE_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.storage.json"
SESSION_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.session.json"
COOKIES_FILE = Path(__file__).resolve().parent.parent / ".auth" / "admin.cookies.json"
MINT_SCRIPT = (
    Path(__file__).resolve().parent.parent.parent
    / "scripts" / "e2e-mint-admin-session.py"
)
# Refresh the session when fewer than this many seconds remain (or when a
# 401/403 lands mid-run). 120s covers the longest single-route wait.
SESSION_MIN_TTL_SECS = 120
# Never remint more than this many times in one run — guards against a
# broken password / down auth server causing an infinite loop.
MAX_REMINTS = 2

ADMIN_PATHS = [
    "/admin",
    "/admin/users",
    "/admin/companies",
    "/admin/roles",
    "/admin/policies",
    "/admin/subscription-payments",
    "/admin/plans",
    "/admin/portal-invitations",
    "/admin/audit-log",
    "/admin/search-insights",
    "/admin/intro-analytics",
    "/admin/report-branding",
    "/admin/report-intro",
    "/admin/settings",
    "/admin/route-map",
]

# Paths intentionally NOT registered as TanStack routes today. Populate
# only when a known-missing admin URL still needs a "must 404 without
# bouncing to /auth or /security/mfa" assertion.
EXPECTED_404: set[str] = set()

# Any final URL starting with one of these means the route rejected the
# user rather than rendering.
REJECT_PREFIXES = ("/auth", "/access-denied", "/security/mfa", "/onboarding")

# Shared mutable state so response listeners can flag a stale session
# without threading arguments through every helper.
_stale_auth = {"flag": False, "reason": ""}
_remints_done = {"n": 0}

# Current path under check — listeners attribute events to it.
_ctx = {"path": "<startup>"}

# Per-path event buckets.
_events: dict[str, dict] = {}


def bucket(path: str) -> dict:
    b = _events.get(path)
    if b is None:
        b = {"console": [], "page_errors": [], "network_failures": []}
        _events[path] = b
    return b


def session_expires_in() -> int | None:
    """Seconds until the on-disk session expires, or None if unknown."""
    if not SESSION_FILE.exists():
        return None
    try:
        s = json.loads(SESSION_FILE.read_text())
    except Exception:
        return None
    exp = s.get("expires_at")
    if not isinstance(exp, (int, float)):
        return None
    return int(exp - time.time())


def remint_session(reason: str) -> bool:
    """Run the mint script. Returns True on success."""
    if _remints_done["n"] >= MAX_REMINTS:
        print(f"  remint SKIPPED ({reason}): hit MAX_REMINTS={MAX_REMINTS}")
        return False
    _remints_done["n"] += 1
    print(f"  reminting session ({reason})…")
    env = os.environ.copy()
    r = subprocess.run(
        [sys.executable, str(MINT_SCRIPT)],
        env=env, capture_output=True, text=True, timeout=30,
    )
    if r.returncode != 0:
        print(f"  remint FAILED: {r.stderr.strip() or r.stdout.strip()}")
        return False
    # Refresh the env vars this process reads (mirrors admin.env exports).
    if SESSION_FILE.exists() and COOKIES_FILE.exists():
        sess = SESSION_FILE.read_text()
        cook = COOKIES_FILE.read_text()
        url = os.environ.get("VITE_SUPABASE_URL", "")
        ref = url.replace("https://", "").split(".")[0]
        os.environ["LOVABLE_BROWSER_AUTH_STATUS"] = "injected"
        os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"] = f"sb-{ref}-auth-token"
        os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"] = sess
        os.environ["LOVABLE_BROWSER_SUPABASE_COOKIES_JSON"] = cook
    return True


def ensure_fresh_session(where: str) -> None:
    """Remint before starting if the on-disk session is missing or expiring."""
    ttl = session_expires_in()
    if ttl is None:
        # No file → nothing to check; env-injected session is handled elsewhere.
        return
    if ttl < SESSION_MIN_TTL_SECS:
        print(f"[{where}] session TTL={ttl}s < {SESSION_MIN_TTL_SECS}s — reminting")
        remint_session(f"ttl={ttl}s")
    else:
        print(f"[{where}] session TTL={ttl}s — OK")


async def refresh_context(context, page) -> None:
    """Clear cookies/storage then re-apply the freshly minted session."""
    _stale_auth["flag"] = False
    _stale_auth["reason"] = ""
    await context.clear_cookies()
    try:
        await page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")
    except Exception:
        pass
    await restore_session(context, page)


def resolve_auth_source() -> str:
    """Returns 'env', 'file', or 'none'."""
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") == "injected":
        return "env"
    if STORAGE_STATE_FILE.exists():
        return "file"
    return "none"


async def restore_session(context, page) -> None:
    """Restore session from sandbox env vars if present, else from
    tests/.auth/admin.*.json (minted by scripts/e2e-mint-admin-session.py)."""
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    if not (storage_key and session_json) and SESSION_FILE.exists():
        session_obj = json.loads(SESSION_FILE.read_text())
        session_json = json.dumps(session_obj)
        # Derive the storage key from the project ref in .env.
        url = os.environ.get("VITE_SUPABASE_URL", "")
        ref = url.replace("https://", "").split(".")[0]
        storage_key = storage_key or f"sb-{ref}-auth-token"
    if not cookies_json and COOKIES_FILE.exists():
        cookies_json = COOKIES_FILE.read_text()

    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            # Playwright wants EITHER `url` OR (`domain`+`path`), not both.
            if not c.get("domain"):
                c["url"] = BASE
        await context.add_cookies(cookies)

    await page.goto(BASE, wait_until="domcontentloaded")
    if storage_key and session_json:
        await page.evaluate(
            "([k, v]) => window.localStorage.setItem(k, v)",
            [storage_key, session_json],
        )
    # Super-admin routes require AAL2. In dev/CI builds a bypass token
    # activates when sessionStorage["__admin_e2e_skip_aal2"] === VITE_E2E_BYPASS_TOKEN.
    # Production builds strip both env vars so this branch is inert there.
    bypass_token = (
        os.environ.get("VITE_E2E_BYPASS_TOKEN")
        or os.environ.get("E2E_BYPASS_TOKEN")
    )
    if bypass_token:
        await page.evaluate(
            "(t) => window.sessionStorage.setItem('__admin_e2e_skip_aal2', t)",
            bypass_token,
        )


def install_auth_watchers(page) -> None:
    """Flag stale-auth on any 401/403 so the next route triggers a remint."""
    def on_response(resp):
        try:
            status = resp.status
            url = resp.url
            if status >= 400:
                bucket(_ctx["path"])["network_failures"].append({
                    "status": status,
                    "method": resp.request.method,
                    "url": url,
                })
            if status in (401, 403):
                # Ignore preflight noise; only trigger on Supabase or our own APIs.
                if ("supabase.co" in url) or ("/api/" in url) or ("/_serverFn/" in url):
                    if not _stale_auth["flag"]:
                        _stale_auth["flag"] = True
                        _stale_auth["reason"] = f"{status} {url.split('?')[0]}"
        except Exception:
            pass
    page.on("response", on_response)


def install_diagnostics(page) -> None:
    """Capture console messages and uncaught page errors per-path."""
    def on_console(msg):
        try:
            if msg.type in ("error", "warning"):
                bucket(_ctx["path"])["console"].append({
                    "type": msg.type,
                    "text": msg.text[:2000],
                })
        except Exception:
            pass
    def on_pageerror(err):
        try:
            bucket(_ctx["path"])["page_errors"].append(str(err)[:2000])
        except Exception:
            pass
    page.on("console", on_console)
    page.on("pageerror", on_pageerror)


def write_reports(results: list[dict], meta: dict) -> None:
    """Dump report.json + report.html + flat logs into RUN_DIR."""
    # Attach per-path events onto each result row.
    for r in results:
        r["events"] = _events.get(r["path"], {"console": [], "page_errors": [], "network_failures": []})
    REPORT_JSON.write_text(json.dumps({"meta": meta, "results": results}, indent=2))

    # Flat text logs for quick grep.
    with CONSOLE_LOG.open("w") as fh:
        for r in results:
            for c in r["events"]["console"]:
                fh.write(f"[{r['path']}] {c['type'].upper()}: {c['text']}\n")
            for pe in r["events"]["page_errors"]:
                fh.write(f"[{r['path']}] PAGEERROR: {pe}\n")
    with NETWORK_LOG.open("w") as fh:
        for r in results:
            for n in r["events"]["network_failures"]:
                fh.write(f"[{r['path']}] {n['status']} {n['method']} {n['url']}\n")

    # Minimal HTML report — pure inline CSS, no assets.
    def esc(x): return html.escape(str(x))
    rows = []
    for r in results:
        cls = "ok" if r["ok"] else "fail"
        ev = r["events"]
        events_html = ""
        if ev["page_errors"]:
            events_html += "<div class='ev'><b>Page errors:</b><ul>" + "".join(
                f"<li><code>{esc(x)}</code></li>" for x in ev["page_errors"]
            ) + "</ul></div>"
        if ev["console"]:
            events_html += "<div class='ev'><b>Console:</b><ul>" + "".join(
                f"<li>[{esc(c['type'])}] <code>{esc(c['text'])}</code></li>"
                for c in ev["console"]
            ) + "</ul></div>"
        if ev["network_failures"]:
            events_html += "<div class='ev'><b>Network failures:</b><ul>" + "".join(
                f"<li>{esc(n['status'])} {esc(n['method'])} <code>{esc(n['url'])}</code></li>"
                for n in ev["network_failures"]
            ) + "</ul></div>"
        shot = r.get("screenshot")
        shot_html = f"<a href='screenshots/{esc(shot)}'>screenshot</a>" if shot else "&mdash;"
        rows.append(
            f"<tr class='{cls}'>"
            f"<td class='mono {cls}'>{'PASS' if r['ok'] else 'FAIL'}</td>"
            f"<td class='mono'>{esc(r['status'])}</td>"
            f"<td class='mono'>{esc(r['expected'])}</td>"
            f"<td class='mono'>{esc(r['path'])}</td>"
            f"<td class='mono'>{esc(r['final'])}</td>"
            f"<td>{shot_html}</td>"
            f"<td>{events_html or '&mdash;'}</td>"
            f"</tr>"
        )
    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    summary = (
        f"<p><b>{passed}</b> passed, <b>{failed}</b> failed &middot; "
        f"reminted <b>{meta['remints']}</b>&times; &middot; "
        f"started {esc(meta['started_at'])} &middot; duration {meta['duration_secs']}s</p>"
    )
    REPORT_HTML.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Admin routes signed-in — {esc(RUN_ID)}</title>
<style>
  body{{font:14px/1.4 system-ui,sans-serif;margin:1.5rem;color:#111}}
  h1{{margin:0 0 .25rem 0}}
  table{{border-collapse:collapse;width:100%;margin-top:1rem}}
  th,td{{border:1px solid #ddd;padding:.4rem .55rem;vertical-align:top;text-align:left}}
  th{{background:#f6f7f9;position:sticky;top:0}}
  .mono{{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}}
  tr.ok td.ok{{background:#e6f4ea;color:#137333;font-weight:600}}
  tr.fail td.fail{{background:#fce8e6;color:#a50e0e;font-weight:600}}
  .ev{{margin:.15rem 0}}
  .ev ul{{margin:.2rem 0 .4rem 1.2rem;padding:0}}
  code{{background:#f2f3f5;padding:0 .25rem;border-radius:3px}}
  a{{color:#1a56db}}
  .meta{{color:#555;font-size:12.5px}}
</style></head>
<body>
<h1>Admin routes signed-in</h1>
<div class='meta'>Run <code>{esc(RUN_ID)}</code></div>
{summary}
<p class='meta'>Playwright trace: <code>trace.zip</code> &mdash; open with
<code>bunx playwright show-trace trace.zip</code> or
<a href='https://trace.playwright.dev/'>trace.playwright.dev</a>.</p>
<table>
<thead><tr>
  <th>Result</th><th>Status</th><th>Expect</th><th>Path</th>
  <th>Final URL</th><th>Screenshot</th><th>Events</th>
</tr></thead>
<tbody>
{''.join(rows)}
</tbody></table>
<p class='meta'>Also in this folder: <code>report.json</code>, <code>console.log</code>,
<code>network-failures.log</code>, <code>video/</code>, <code>trace.zip</code>.</p>
</body></html>
""")


async def check(page, path: str) -> dict:
    _ctx["path"] = path
    resp = await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass  # long-polling / realtime pages never idle; DOM is enough
    status = resp.status if resp else 0
    final = page.url.replace(BASE, "") or "/"
    body_text = (await page.locator("body").inner_text())[:600].lower()
    is_404 = "404" in body_text and "not found" in body_text
    redirected_away = any(final.startswith(p) for p in REJECT_PREFIXES)
    if path in EXPECTED_404:
        # Expected-missing route: 404 status OR the root notFoundComponent
        # counts as success, provided we didn't bounce to auth/MFA.
        ok = (
            not redirected_away
            and final.startswith(path)
            and (status == 404 or is_404)
        )
        expected = "404"
    else:
        ok = (
            status < 400
            and not is_404
            and not redirected_away
            and final.startswith(path)
        )
        expected = "200"
    return {
        "path": path,
        "status": status,
        "final": final,
        "is_404": is_404,
        "redirected_away": redirected_away,
        "expected": expected,
        "ok": ok,
    }


async def main() -> int:
    source = resolve_auth_source()
    if source == "none":
        print("SKIP: no admin session available.")
        print("      Either sign in via the preview (LOVABLE_BROWSER_AUTH_STATUS=injected)")
        print("      or mint locally:  python3 scripts/e2e-mint-admin-session.py")
        return 0
    print(f"Using auth source: {source}")
    ensure_fresh_session("startup")
    started_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    t0 = time.time()
    print(f"Artifacts → {RUN_DIR}")

    failures: list[dict] = []
    results: list[dict] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800},
            record_video_dir=str(VIDEO_DIR),
            record_video_size={"width": 1280, "height": 900},
        )
        # Full Playwright trace: screenshots + snapshots + sources for every
        # step. Open with `playwright show-trace <run>/trace.zip`.
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = await context.new_page()
        install_auth_watchers(page)
        install_diagnostics(page)
        await restore_session(context, page)

        # Sanity: make sure the session actually landed by opening /admin
        # once and screenshotting the entry state.
        await page.goto(f"{BASE}/admin", wait_until="domcontentloaded")
        try:
            await page.wait_for_load_state("networkidle", timeout=6000)
        except Exception:
            pass
        await page.screenshot(path=str(SCREENSHOT_DIR / "00_admin_entry.png"))
        entry_url = page.url.replace(BASE, "")
        if any(entry_url.startswith(p) for p in REJECT_PREFIXES):
            print(f"FAIL: /admin bounced to {entry_url} — test user is not "
                  f"a super-admin with aal2. Aborting.")
            try:
                await context.tracing.stop(path=str(TRACE_FILE))
            except Exception:
                pass
            await context.close()
            await browser.close()
            write_reports(
                [{"path": "/admin", "status": 0, "final": entry_url,
                  "expected": "200", "ok": False, "is_404": False,
                  "redirected_away": True, "screenshot": "00_admin_entry.png"}],
                {"started_at": started_at, "duration_secs": round(time.time()-t0, 1),
                 "remints": _remints_done["n"], "aborted": True},
            )
            return 1

        for p in ADMIN_PATHS:
            # If a previous route saw 401/403 (or the on-disk session is
            # about to expire), remint + reapply before the next navigation.
            ttl = session_expires_in()
            if _stale_auth["flag"] or (ttl is not None and ttl < SESSION_MIN_TTL_SECS):
                reason = _stale_auth["reason"] or f"ttl={ttl}s"
                if remint_session(reason):
                    await refresh_context(context, page)
                else:
                    # Clear the flag so we don't spin; the route will just fail.
                    _stale_auth["flag"] = False
            try:
                r = await check(page, p)
            except Exception as e:  # noqa: BLE001
                r = {"path": p, "status": 0, "final": "ERR", "is_404": False,
                     "redirected_away": False,
                     "expected": "404" if p in EXPECTED_404 else "200",
                     "ok": False, "err": str(e)[:200]}
            # If the route bounced to /auth despite a valid-looking session,
            # treat that as a stale-auth signal and retry ONCE after remint.
            if (
                not r["ok"]
                and r.get("final", "").startswith("/auth")
                and _remints_done["n"] < MAX_REMINTS
            ):
                print(f"  retrying {p} after auth bounce…")
                if remint_session(f"auth-bounce on {p}"):
                    await refresh_context(context, page)
                    try:
                        r = await check(page, p)
                    except Exception as e:  # noqa: BLE001
                        r["err"] = str(e)[:200]
            if r["ok"] and r["path"] in EXPECTED_404:
                marker = "OK*"  # expected 404
            elif r["ok"]:
                marker = "OK "
            else:
                marker = "FAIL"
            print(f"{marker} {r['status']:>3} {r['path']:38} -> {r['final']}"
                  + f"  [expect {r['expected']}]"
                  + (f"  ({r.get('err','')})" if r.get("err") else ""))
            # Screenshot every page (not just failures) so the HTML report is complete.
            safe = r["path"].strip("/").replace("/", "_") or "root"
            shot_name = f"{'fail' if not r['ok'] else 'ok'}_{safe}.png"
            try:
                await page.screenshot(path=str(SCREENSHOT_DIR / shot_name))
                r["screenshot"] = shot_name
            except Exception:
                r["screenshot"] = None
            results.append(r)
            if not r["ok"]:
                failures.append(r)
        try:
            await context.tracing.stop(path=str(TRACE_FILE))
        except Exception as e:
            print(f"warning: tracing.stop failed: {e}")
        await context.close()  # flushes video files
        await browser.close()

    if _remints_done["n"]:
        print(f"\nSession reminted {_remints_done['n']} time(s) during run.")

    write_reports(
        results,
        {"started_at": started_at,
         "duration_secs": round(time.time() - t0, 1),
         "remints": _remints_done["n"],
         "aborted": False},
    )
    print(f"\nReport → {REPORT_HTML}")
    print(f"JSON   → {REPORT_JSON}")
    print(f"Video  → {VIDEO_DIR}")

    if failures:
        print(f"\n{len(failures)} failing route(s):")
        for f in failures:
            print(" -", f)
        return 1
    print(f"\nAll {len(ADMIN_PATHS)} admin routes render for signed-in super-admin.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))