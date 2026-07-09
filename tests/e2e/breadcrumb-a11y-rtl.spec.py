"""
Playwright: Breadcrumb accessibility on RTL (Arabic) — desktop + mobile.

Verifies the unified SmartBreadcrumbs contract shared by /dashboard,
/portal and /admin:

  1. <nav aria-label="مسار التنقّل"> is present.
  2. Exactly ONE element has aria-current="page" and it is the LAST
     visible focusable in the trail.
  3. Every ancestor <a> has aria-current="false" (TanStack Router's
     Link would otherwise add "page" for partial matches).
  4. The root Link exposes a bilingual aria-label starting with
     "الانتقال إلى" so screen readers announce it.
  5. Keyboard Tab order follows the DOM order (root → middle → current
     → out of breadcrumb) with no tabindex traps.

Runs each check at desktop (1280) and mobile (390) viewports.

When TEST_SEED_TOKEN is set the spec drives real /portal routes as a
seeded tenant. Otherwise it falls back to the public, auth-free harness
at /dev/breadcrumbs-test?depth=1|2|3 so CI always exercises the
SmartBreadcrumbs contract.
"""
import asyncio
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8080"
SHOTS = Path("/tmp/browser/breadcrumb-a11y-rtl")
SHOTS.mkdir(parents=True, exist_ok=True)


def _load_env_file() -> dict:
    env = {}
    for p in (Path(".env"), Path(".env.local")):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


_ENV = _load_env_file()
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL") or _ENV.get("VITE_SUPABASE_URL")
SUPABASE_KEY = (
    os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    or _ENV.get("VITE_SUPABASE_PUBLISHABLE_KEY")
)
SUPABASE_PROJECT_ID = (
    os.environ.get("VITE_SUPABASE_PROJECT_ID")
    or _ENV.get("VITE_SUPABASE_PROJECT_ID")
    or (SUPABASE_URL.split("//", 1)[-1].split(".", 1)[0] if SUPABASE_URL else "")
)


def seed_via_endpoint(token: str) -> dict:
    req = urllib.request.Request(
        f"{BASE}/api/public/test-seed-portal-users",
        method="POST",
        headers={"x-test-seed-token": token, "content-type": "application/json"},
        data=b"{}",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"seed failed: {payload}")
    return payload


async def sign_in(page, email: str, password: str) -> None:
    if not (SUPABASE_URL and SUPABASE_KEY and SUPABASE_PROJECT_ID):
        raise RuntimeError("VITE_SUPABASE_URL / _PUBLISHABLE_KEY missing")
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    result = await page.evaluate(
        """async ({ url, key, projectRef, email, password }) => {
          const res = await fetch(url + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: key,
              Authorization: 'Bearer ' + key,
            },
            body: JSON.stringify({ email, password }),
          });
          const body = await res.json();
          if (!res.ok || !body.access_token) return { ok: false, status: res.status, body };
          window.localStorage.setItem('sb-' + projectRef + '-auth-token', JSON.stringify(body));
          window.localStorage.setItem('i18nextLng', 'ar');
          return { ok: true };
        }""",
        {"url": SUPABASE_URL, "key": SUPABASE_KEY, "projectRef": SUPABASE_PROJECT_ID,
         "email": email, "password": password},
    )
    if not result.get("ok"):
        raise PWTimeout(f"password-grant failed for {email}: {result}")


async def read_breadcrumb(page) -> dict:
    """Read the current visible breadcrumb state from the DOM."""
    return await page.evaluate(
        """() => {
          const nav = [...document.querySelectorAll('nav[aria-label]')]
            .find(n => /مسار|Breadcrumb/i.test(n.getAttribute('aria-label')||''));
          if (!nav) return { found: false };
          const dir = getComputedStyle(document.documentElement).direction;
          const focusables = [...nav.querySelectorAll('a,button,[tabindex="0"]')]
            .filter(el => el.offsetParent !== null);
          return {
            found: true,
            dir,
            nav_aria_label: nav.getAttribute('aria-label'),
            items: focusables.map(el => ({
              tag: el.tagName.toLowerCase(),
              text: (el.textContent||'').replace(/\\s+/g,' ').trim(),
              aria_label: el.getAttribute('aria-label'),
              aria_current: el.getAttribute('aria-current'),
              href: el.getAttribute('href'),
            })),
          };
        }"""
    )


async def collect_tab_order(page) -> list[dict]:
    """Focus the first breadcrumb item, then Tab until focus leaves it."""
    await page.evaluate(
        """() => {
          const nav = [...document.querySelectorAll('nav[aria-label]')]
            .find(n => /مسار|Breadcrumb/i.test(n.getAttribute('aria-label')||''));
          if (!nav) return;
          const first = [...nav.querySelectorAll('a,button,[tabindex="0"]')]
            .find(el => el.offsetParent !== null);
          if (first) first.focus();
        }"""
    )
    order = []
    for _ in range(12):
        info = await page.evaluate(
            """() => {
              const a = document.activeElement;
              const nav = a?.closest('nav[aria-label]');
              const inside = !!nav && /مسار|Breadcrumb/i.test(nav.getAttribute('aria-label')||'');
              return {
                inside,
                tag: a?.tagName?.toLowerCase(),
                text: (a?.textContent||'').replace(/\\s+/g,' ').trim(),
                aria_current: a?.getAttribute('aria-current'),
                aria_label: a?.getAttribute('aria-label'),
              };
            }"""
        )
        order.append(info)
        if not info.get("inside"):
            break
        await page.keyboard.press("Tab")
    return order


def check_breadcrumb(label: str, state: dict, tab_order: list[dict]) -> list[str]:
    errs: list[str] = []
    if not state.get("found"):
        return [f"{label}: <nav aria-label='مسار…'> not found"]
    if state["dir"] != "rtl":
        errs.append(f"{label}: expected dir=rtl, got {state['dir']}")
    if state["nav_aria_label"] != "مسار التنقّل":
        errs.append(f"{label}: nav aria-label is {state['nav_aria_label']!r}")

    items = state["items"]
    if not items:
        return errs + [f"{label}: breadcrumb has no visible focusables"]

    # Root must be a link with Arabic aria-label
    root = items[0]
    if root["tag"] != "a":
        errs.append(f"{label}: root is <{root['tag']}>, expected <a>")
    if not (root["aria_label"] or "").startswith("الانتقال إلى"):
        errs.append(f"{label}: root aria-label {root['aria_label']!r} missing 'الانتقال إلى'")

    # aria-current: exactly one 'page', on the last item
    current = [i for i, it in enumerate(items) if it["aria_current"] == "page"]
    if current != [len(items) - 1]:
        errs.append(
            f"{label}: aria-current='page' at indices {current}, expected only [{len(items)-1}]"
        )
    for i, it in enumerate(items[:-1]):
        if it["tag"] == "a" and it["aria_current"] != "false":
            errs.append(
                f"{label}: ancestor <a href={it['href']!r}> has aria-current={it['aria_current']!r}, expected 'false'"
            )

    # Tab traversal: each of the N items in order, then one item outside.
    focused_inside = [t for t in tab_order if t.get("inside")]
    if len(focused_inside) != len(items):
        errs.append(
            f"{label}: Tab visited {len(focused_inside)} focusables, expected {len(items)}"
        )
    for idx, (dom, tabbed) in enumerate(zip(items, focused_inside)):
        # Compare by text or aria-label (icon-only items have empty text)
        dom_ident = dom["aria_label"] or dom["text"]
        tab_ident = tabbed.get("aria_label") or tabbed.get("text")
        if dom_ident != tab_ident:
            errs.append(
                f"{label}: Tab step {idx}: focused {tab_ident!r}, DOM expected {dom_ident!r}"
            )
    # After the last inside step, Tab must leave the breadcrumb
    if focused_inside and len(tab_order) == len(focused_inside):
        errs.append(f"{label}: Tab did not leave breadcrumb after last item")

    return errs


async def audit_route(page, viewport_label: str, path: str) -> list[str]:
    await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=8000)
    except PWTimeout:
        pass
    await page.wait_for_timeout(400)
    slug = f"{viewport_label}_{path.strip('/').replace('/', '_') or 'root'}"
    await page.screenshot(path=str(SHOTS / f"{slug}.png"))

    state = await read_breadcrumb(page)
    tab_order = await collect_tab_order(page) if state.get("found") else []
    label = f"[{viewport_label}] {path}"
    return check_breadcrumb(label, state, tab_order)


async def run_authenticated(creds: dict) -> list[str]:
    # Portal routes reachable as the seeded tenant. /portal itself is 1 crumb
    # (leaf-only); /portal/tenant is 2 crumbs; /portal/tenant/maintenance is 3.
    routes = ["/portal", "/portal/tenant", "/portal/tenant/maintenance"]
    all_errs: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            for vp_label, vp in [("desktop", {"width": 1280, "height": 900}),
                                 ("mobile",  {"width": 390,  "height": 844})]:
                ctx_kwargs = {"viewport": vp, "locale": "ar-SA"}
                if vp_label == "mobile":
                    ctx_kwargs.update({"is_mobile": True, "has_touch": True})
                ctx = await browser.new_context(**ctx_kwargs)
                page = await ctx.new_page()
                try:
                    await sign_in(page, creds["tenant"]["email"], creds["tenant"]["password"])
                except PWTimeout as e:
                    all_errs.append(f"[{vp_label}] sign-in failed: {e}")
                    await ctx.close()
                    continue
                for path in routes:
                    all_errs.extend(await audit_route(page, vp_label, path))
                await ctx.close()
        finally:
            await browser.close()
    return all_errs


async def run_harness() -> list[str]:
    """Auth-free fallback: exercise the /dev/breadcrumbs-test harness at
    depth=1|2|3 on desktop + mobile using fixture crumbs. Same aria-current
    / aria-label / Tab-order contract, no seed token required."""
    routes = [
        "/dev/breadcrumbs-test?depth=1&lang=ar",
        "/dev/breadcrumbs-test?depth=2&lang=ar",
        "/dev/breadcrumbs-test?depth=3&lang=ar",
    ]
    all_errs: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            for vp_label, vp in [("desktop", {"width": 1280, "height": 900}),
                                 ("mobile",  {"width": 390,  "height": 844})]:
                ctx_kwargs = {"viewport": vp, "locale": "ar-SA"}
                if vp_label == "mobile":
                    ctx_kwargs.update({"is_mobile": True, "has_touch": True})
                ctx = await browser.new_context(**ctx_kwargs)
                page = await ctx.new_page()
                for path in routes:
                    all_errs.extend(await audit_route(page, vp_label, path))
                await ctx.close()
        finally:
            await browser.close()
    return all_errs


def main() -> int:
    token = os.environ.get("TEST_SEED_TOKEN")
    if token:
        try:
            seed = seed_via_endpoint(token)
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError) as e:
            print(f"WARN: seed endpoint error ({e}); falling back to harness route",
                  file=sys.stderr)
            errs = asyncio.run(run_harness())
            mode = "harness (seed failed)"
        else:
            errs = asyncio.run(run_authenticated(seed["credentials"]))
            mode = "authenticated portal routes"
    else:
        print("INFO: TEST_SEED_TOKEN not set; running auth-free harness at "
              "/dev/breadcrumbs-test")
        errs = asyncio.run(run_harness())
        mode = "harness (no seed token)"

    if errs:
        for e in errs:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1
    print(f"OK [{mode}]: breadcrumb aria-current / aria-label / Tab order intact "
          "on RTL desktop + mobile")
    return 0


if __name__ == "__main__":
    sys.exit(main())
