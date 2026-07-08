"""Admin panel E2E smoke: navigates each admin section, captures
screenshots + summary.json. Used locally and from CI (see
.github/workflows/admin-e2e.yml).

Env:
  BASE_URL   default http://localhost:8080
  OUT_DIR    default ./admin-e2e-output
  E2E_BYPASS_TOKEN  shared secret matching VITE_E2E_BYPASS_TOKEN in the
    build under test. Required to bypass AAL2 on Staging/CI builds
    (production builds omit VITE_E2E_BYPASS_* and cannot be bypassed).
  LOVABLE_BROWSER_SUPABASE_* (optional) — restores an authenticated
    session; without it, admin routes redirect to /auth and the run is
    recorded as unauthenticated (still uploaded as artifact).
"""
import asyncio, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")
OUT = Path(os.environ.get("OUT_DIR", "admin-e2e-output")).resolve()
SCREENS = OUT / "screenshots"
SCREENS.mkdir(parents=True, exist_ok=True)

# axe-core (pinned) — injected per page for a11y checks.
AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"
# Focused rule set: landmarks, contrast, and core ARIA correctness.
AXE_RULES = [
    "landmark-one-main",
    "landmark-unique",
    "landmark-no-duplicate-banner",
    "landmark-no-duplicate-contentinfo",
    "region",
    "page-has-heading-one",
    "color-contrast",
    "aria-allowed-attr",
    "aria-required-attr",
    "aria-required-children",
    "aria-required-parent",
    "aria-valid-attr",
    "aria-valid-attr-value",
    "aria-roles",
    "aria-hidden-focus",
    "button-name",
    "link-name",
    "image-alt",
    "label",
    "duplicate-id-aria",
    "html-has-lang",
]

SECTIONS = [
    ("/admin",                       "مركز التحكم"),
    ("/admin/users",                 "المستخدمون"),
    ("/admin/roles",                 "الأدوار"),
    ("/admin/policies",              "السياسات"),
    ("/admin/portal-invitations",    "دعوات البوابة"),
    ("/admin/companies",             "المنشآت"),
    ("/admin/plans",                 "الباقات"),
    ("/admin/subscription-payments", "الإيصالات"),
    ("/admin/billing-metrics",       "مؤشرات الفوترة"),
    ("/admin/report-branding",       "الهوية البصرية"),
    ("/admin/report-intro",          "قوالب التقارير"),
    ("/admin/intro-analytics",       "تحليلات المقدمة"),
    ("/admin/search-insights",       "مصادر البحث"),
    ("/admin/audit-log",             "سجل التدقيق"),
    ("/admin/telemetry",             "التليمتري"),
    ("/admin/settings",              "الإعدادات"),
]

async def main():
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    authenticated = bool(storage_key and session_json)
    bypass_token = os.environ.get("E2E_BYPASS_TOKEN", "")

    results = []
    page_errs: list[str] = []
    console_errs: list[str] = []
    axe_js = None
    # Network monitoring — populated by request/response listeners.
    net_failures: list[dict] = []   # network-level failures (DNS/abort/reset)
    api_errors: list[dict] = []     # HTTP 4xx/5xx responses
    # Requests deemed irrelevant to admin correctness (analytics, sourcemaps…).
    NET_IGNORE = ("/@vite/", "/@fs/", "/@id/", "/node_modules/.vite/",
                  ".map", "hot-update", "chrome-extension://")
    # Endpoints we expect to 401/404 by design in admin flows.
    API_IGNORE_STATUS = {
        # Optional feature probes / auth-gated reads that legitimately 401
        # for unauthenticated visitors on public routes.
    }

    def _is_admin_ctx():
        try:
            return "/admin" in page.url
        except Exception:
            return False

    def _should_ignore(url: str) -> bool:
        return any(tok in url for tok in NET_IGNORE)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        # Record a Playwright trace for the whole run. Kept only on failure
        # (see finalization at the bottom) to avoid uploading large artifacts
        # on green runs.
        await ctx.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = await ctx.new_page()
        page.on("pageerror", lambda e: page_errs.append(str(e)))
        page.on("console", lambda m: console_errs.append(m.text) if m.type == "error" else None)

        def _on_requestfailed(req):
            url = req.url
            if _should_ignore(url) or not _is_admin_ctx():
                return
            net_failures.append({
                "url": url,
                "method": req.method,
                "resource_type": req.resource_type,
                "failure": (req.failure or "")[:200] if isinstance(req.failure, str) else str(req.failure)[:200],
                "on_path": page.url,
            })

        def _on_response(resp):
            try:
                status = resp.status
                url = resp.url
                if status < 400 or _should_ignore(url) or not _is_admin_ctx():
                    return
                if status in API_IGNORE_STATUS:
                    return
                api_errors.append({
                    "url": url,
                    "status": status,
                    "method": resp.request.method,
                    "resource_type": resp.request.resource_type,
                    "on_path": page.url,
                })
            except Exception:
                pass

        page.on("requestfailed", _on_requestfailed)
        page.on("response", _on_response)

        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = BASE
            await ctx.add_cookies(cookies)
        await page.goto(BASE, wait_until="domcontentloaded")
        if authenticated:
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
            )
        if bypass_token:
            await page.evaluate(
                f"window.sessionStorage.setItem('__admin_e2e_skip_aal2', {json.dumps(bypass_token)})"
            )
        else:
            print("[admin-e2e] warning: E2E_BYPASS_TOKEN not set — AAL2 bypass disabled", file=sys.stderr)

        # Fetch axe-core once and inject on every page.
        try:
            axe_resp = await ctx.request.get(AXE_CDN)
            if axe_resp.ok:
                axe_js = await axe_resp.text()
        except Exception as ex:
            print(f"[admin-e2e] axe-core fetch failed: {ex}", file=sys.stderr)

        for i, (path, label) in enumerate(SECTIONS, 1):
            entry = {"path": path, "expected": label}
            try:
                await page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(1800)
                # Snapshot per-section network counters (indices before this section).
                net_start = len(net_failures)
                api_start = len(api_errors)
                heading = ""
                for sel in ("h1", "h2"):
                    if await page.locator(sel).count() == 0:
                        continue
                    try:
                        heading = (await page.locator(sel).first.text_content(timeout=800) or "").strip()
                        if heading:
                            break
                    except Exception:
                        pass
                entry["url"] = page.url
                entry["title"] = await page.title()
                entry["heading"] = heading[:120]
                entry["heading_present"] = bool(heading)
                entry["redirected_to_auth"] = "/auth" in page.url

                # Landmark sanity (independent of axe, cheap and specific).
                entry["landmarks"] = await page.evaluate(
                    """() => ({
                        main: document.querySelectorAll('main, [role=main]').length,
                        nav: document.querySelectorAll('nav, [role=navigation]').length,
                        banner: document.querySelectorAll('header[role=banner], [role=banner]').length,
                        contentinfo: document.querySelectorAll('footer[role=contentinfo], [role=contentinfo]').length,
                        h1: document.querySelectorAll('h1').length,
                        htmlLang: document.documentElement.getAttribute('lang') || '',
                        dir: document.documentElement.getAttribute('dir') || '',
                    })"""
                )
                # Attach any network/API issues captured while on this section.
                entry["net_failures"] = [
                    f for f in net_failures[net_start:] if path in f.get("on_path", "")
                ]
                entry["api_errors"] = [
                    e for e in api_errors[api_start:] if path in e.get("on_path", "")
                ]

                # axe-core scan (skip when redirected to /auth — not the target surface).
                if axe_js and not entry["redirected_to_auth"]:
                    try:
                        await page.evaluate(axe_js)
                        axe_result = await page.evaluate(
                            """async (rules) => {
                                const res = await window.axe.run(document, {
                                    runOnly: { type: 'rule', values: rules },
                                    resultTypes: ['violations'],
                                });
                                return res.violations.map(v => ({
                                    id: v.id,
                                    impact: v.impact,
                                    help: v.help,
                                    nodes: v.nodes.slice(0, 3).map(n => ({
                                        target: n.target,
                                        summary: (n.failureSummary || '').slice(0, 300),
                                    })),
                                    count: v.nodes.length,
                                }));
                            }""",
                            AXE_RULES,
                        )
                        entry["a11y_violations"] = axe_result
                        entry["a11y_serious"] = sum(
                            v["count"] for v in axe_result
                            if v.get("impact") in ("serious", "critical")
                        )
                    except Exception as ex:
                        entry["a11y_error"] = str(ex)[:300]

                shot = SCREENS / f"{i:02d}_{path.strip('/').replace('/', '_')}.png"
                await page.screenshot(path=str(shot))
                entry["screenshot"] = shot.relative_to(OUT).as_posix()
            except Exception as ex:
                entry["error"] = str(ex)[:300]
            results.append(entry)

        # Stop tracing before closing the context/browser so the .zip flushes.
        trace_path = OUT / "trace.zip"
        try:
            await ctx.tracing.stop(path=str(trace_path))
        except Exception as ex:
            print(f"[admin-e2e] tracing.stop failed: {ex}", file=sys.stderr)
        await browser.close()

    passed = sum(1 for r in results if r.get("heading_present") and not r.get("redirected_to_auth"))
    a11y_total_serious = sum(r.get("a11y_serious", 0) for r in results)
    a11y_pages_with_issues = sum(1 for r in results if r.get("a11y_serious", 0) > 0)
    total_net_failures = len(net_failures)
    total_api_errors = len(api_errors)
    summary = {
        "base_url": BASE,
        "authenticated": authenticated,
        "total": len(results),
        "passed": passed,
        "page_errors": page_errs,
        "console_errors": console_errs[:50],
        "a11y": {
            "rules": AXE_RULES,
            "total_serious_or_critical": a11y_total_serious,
            "pages_with_issues": a11y_pages_with_issues,
        },
        "network": {
            "total_failures": total_net_failures,
            "total_api_errors": total_api_errors,
            "failures": net_failures,
            "api_errors": api_errors,
        },
        "results": results,
    }
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"[admin-e2e] authenticated={authenticated} passed={passed}/{len(results)} "
        f"page_errors={len(page_errs)} a11y_serious={a11y_total_serious} "
        f"(on {a11y_pages_with_issues} page(s)) net_failures={total_net_failures} "
        f"api_errors={total_api_errors}"
    )
    for r in results:
        flag = "✓" if r.get("heading_present") and not r.get("redirected_to_auth") else ("→auth" if r.get("redirected_to_auth") else "✗")
        a11y_note = ""
        if r.get("a11y_serious"):
            ids = ",".join(sorted({v["id"] for v in r.get("a11y_violations", []) if v.get("impact") in ("serious", "critical")}))
            a11y_note = f"  a11y={r['a11y_serious']} [{ids}]"
        lm = r.get("landmarks") or {}
        lm_note = f" main={lm.get('main','?')}" if lm else ""
        net_note = ""
        if r.get("net_failures") or r.get("api_errors"):
            net_note = f"  net={len(r.get('net_failures', []))} api={len(r.get('api_errors', []))}"
        print(f"  {flag:5s} {r['path']:35s} h={r.get('heading','')[:32]!r}{lm_note}{a11y_note}{net_note}")

    # Fail the job on JS errors regardless of auth.
    if page_errs:
        print(f"[admin-e2e] FAIL: {len(page_errs)} pageerror(s)", file=sys.stderr)
        sys.exit(2)
    # When authenticated, also require every section to render a heading.
    if authenticated and passed != len(results):
        print(f"[admin-e2e] FAIL: {len(results) - passed} section(s) missing heading", file=sys.stderr)
        sys.exit(3)
    # When authenticated, fail on serious/critical a11y violations.
    if authenticated and a11y_total_serious > 0:
        print(
            f"[admin-e2e] FAIL: {a11y_total_serious} serious/critical a11y "
            f"violation(s) across {a11y_pages_with_issues} page(s)",
            file=sys.stderr,
        )
        sys.exit(4)
    # Network failures during admin navigation are always a red flag.
    if total_net_failures > 0:
        print(
            f"[admin-e2e] FAIL: {total_net_failures} network failure(s) during admin navigation",
            file=sys.stderr,
        )
        for f in net_failures[:10]:
            print(f"  - {f['method']} {f['url']} :: {f['failure']}", file=sys.stderr)
        sys.exit(5)
    # When authenticated, treat 4xx/5xx API responses as failures.
    if authenticated and total_api_errors > 0:
        print(
            f"[admin-e2e] FAIL: {total_api_errors} HTTP 4xx/5xx response(s) during admin navigation",
            file=sys.stderr,
        )
        for e in api_errors[:10]:
            print(f"  - {e['status']} {e['method']} {e['url']}", file=sys.stderr)
        sys.exit(6)

asyncio.run(main())